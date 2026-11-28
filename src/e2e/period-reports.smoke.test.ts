import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

// Monthly, quarterly and yearly reports with charts, from recorded services.

let app: ElectronApplication;
let control: Page;
let saves = "";
const shots = process.env.REPORT_SHOTS;
const MIN = 60_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function findWindow(selector: string): Promise<Page> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const window of app.windows()) {
      if (await window.locator(selector).count().catch(() => 0)) return window;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No window with ${selector}`);
}

/** A finished service on a day this month: started `late` min late; The Word took `word` min (planned 45). */
function service(day: number, late: number, word: number) {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const plannedStart = new Date(now.getFullYear(), now.getMonth(), day, 11, 0).getTime();
  const start = plannedStart + late * MIN;
  const prayersEnd = start + 5 * MIN;
  const end = prayersEnd + word * MIN;
  return {
    version: 1, id: `${date}-sunday-${start}`, planId: "sunday", planName: "Sunday service", runDate: date,
    plannedStart, plannedFinish: plannedStart + 50 * MIN, startedAt: start, startMode: "fromTop", endedAt: end, ending: "finished",
    items: [
      { id: "p", title: "Opening prayers", plannedMinutes: 5, runs: [{ from: start, to: prayersEnd }], pausedMs: 0, adjustedMs: 0 },
      { id: "w", title: "The Word", plannedMinutes: 45, runs: [{ from: prayersEnd, to: end }], pausedMs: 0, adjustedMs: 0 },
    ],
    timeline: [],
  };
}

const reports = () => control.getByRole("dialog").filter({ has: control.getByRole("heading", { name: "Service reports" }) });

describe("period reports", () => {
  beforeAll(async () => {
    const userData = await mkdtemp(join(tmpdir(), "service-timer-e2e-"));
    saves = await mkdtemp(join(tmpdir(), "service-timer-saves-"));
    await mkdir(join(userData, "reports"));
    for (const record of [service(1, 0, 45), service(8, 5, 52), service(15, 1, 50), service(22, 3, 55)]) {
      await writeFile(join(userData, "reports", `${record.id}.json`), JSON.stringify(record));
    }
    app = await electron.launch({ args: ["."], env: { ...process.env, NODE_ENV: "test", SERVICE_TIMER_E2E_FORCE_DUAL: "1", SERVICE_TIMER_USER_DATA: userData } });
    await app.evaluate(({ dialog }, folder) => {
      dialog.showSaveDialog = (async (...args: unknown[]) => {
        const options = (args.length > 1 ? args[1] : args[0]) as { defaultPath?: string };
        return { canceled: false, filePath: `${folder}/${options.defaultPath ?? "report"}` };
      }) as typeof dialog.showSaveDialog;
    }, saves);
    control = await findWindow('header:has-text("Service Timer")');
    await control.setViewportSize({ width: 1366, height: 900 });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it("sums up this month with figures and charts", async () => {
    await control.getByRole("button", { name: "Reports", exact: true }).click();
    await reports().getByRole("radio", { name: "Month" }).click();
    const view = reports().getByRole("region", { name: "Period report" });
    const month = `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`;
    await view.getByRole("heading", { name: month }).waitFor();
    await view.getByText("2 of 4").waitFor(); // started on time: 0 and 1 min late
    await view.getByText("1 of 4").waitFor(); // finished on time: only the first
    expect(await view.locator('[data-chart="finish"] svg rect').count()).toBe(4);
    expect(await view.locator('[data-chart="items"] svg').count()).toBe(1);
    expect(await view.locator('[data-chart="months"]').count()).toBe(0);
    await view.getByRole("table", { name: "Items over the period" }).getByText("The Word").waitFor();
    if (shots) await control.screenshot({ path: join(shots, "month.png"), fullPage: true });
  }, 30_000);

  it("shows quarters and years by month, and steps back to an empty period", async () => {
    await reports().getByRole("radio", { name: "Quarter" }).click();
    const view = reports().getByRole("region", { name: "Period report" });
    await view.locator('[data-chart="months"]').waitFor();
    expect(await view.locator('[data-chart="months"] svg text').filter({ hasText: /^[A-Z][a-z]{2}/ }).count()).toBeGreaterThanOrEqual(3);
    if (shots) await control.screenshot({ path: join(shots, "quarter.png") });
    await reports().getByRole("radio", { name: "Year" }).click();
    await view.getByRole("heading", { name: String(new Date().getFullYear()) }).waitFor();
    await view.getByRole("button", { name: "Earlier" }).click();
    await view.getByText(`No services were recorded in ${new Date().getFullYear() - 1}.`, { exact: false }).waitFor();
    await view.getByRole("button", { name: "Later" }).click();
  }, 30_000);

  it("copies a WhatsApp summary and saves a PDF and CSV", async () => {
    await reports().getByRole("radio", { name: "Month" }).click();
    const view = reports().getByRole("region", { name: "Period report" });
    await view.getByText("2 of 4").waitFor();
    await reports().getByRole("button", { name: "Copy for WhatsApp" }).click();
    await control.getByText("Copied. Paste it into WhatsApp.").first().waitFor();
    const text = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(text).toContain(`*Service report: ${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}*`);
    expect(text).toContain("- The Word: 51 min on average, planned 45 min (+6)");
    await reports().getByRole("button", { name: "Save PDF" }).click();
    await reports().getByRole("button", { name: "Save CSV" }).click();
    let saved: string[] = [];
    for (let attempt = 0; attempt < 60 && saved.length < 2; attempt += 1) {
      saved = await readdir(saves);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const pdf = saved.find((name) => name.endsWith(".pdf"))!;
    expect((await readFile(join(saves, pdf))).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await readFile(join(saves, saved.find((name) => name.endsWith(".csv"))!), "utf8")).split("\r\n")[0]).toBe("Date,Service,Service started,Late (min),Finished over (min),Item,Planned (min),Actual (min),Difference (min),Status");
    if (shots) {
      const { copyFile } = await import("node:fs/promises");
      await copyFile(join(saves, pdf), join(shots, "period.pdf"));
    }
  }, 30_000);
});
