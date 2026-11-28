import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

// Service reports: recorded while the service runs, shown afterwards, shared as text, PDF and CSV.

let app: ElectronApplication;
let control: Page;
let userData = "";
let saves = "";
const shots = process.env.REPORT_SHOTS;

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

const reports = () => control.getByRole("dialog").filter({ has: control.getByRole("heading", { name: "Service reports" }) });

describe("service reports", () => {
  beforeAll(async () => {
    userData = await mkdtemp(join(tmpdir(), "service-timer-e2e-"));
    saves = await mkdtemp(join(tmpdir(), "service-timer-saves-"));
    app = await electron.launch({ args: ["."], env: { ...process.env, NODE_ENV: "test", SERVICE_TIMER_E2E_FORCE_DUAL: "1", SERVICE_TIMER_USER_DATA: userData } });
    // Answer save dialogs with a file in a temporary folder instead of asking.
    await app.evaluate(({ dialog }, folder) => {
      dialog.showSaveDialog = (async (...args: unknown[]) => {
        const options = (args.length > 1 ? args[1] : args[0]) as { defaultPath?: string };
        return { canceled: false, filePath: `${folder}/${options.defaultPath ?? "report"}` };
      }) as typeof dialog.showSaveDialog;
    }, saves);
    control = await findWindow('header:has-text("Service Timer")');
    await control.setViewportSize({ width: 1366, height: 768 });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it("records a service and shows its report", async () => {
    await control.getByRole("button", { name: /^(Start now|Start)$/ }).first().click();
    const late = control.getByRole("dialog");
    if (await late.waitFor({ timeout: 1_500 }).then(() => true, () => false)) {
      await late.getByRole("radio", { name: /Start from the top/ }).click();
      await late.getByRole("button", { name: "Start", exact: true }).click();
    }
    await control.getByRole("button", { name: "Pause", exact: true }).waitFor();
    await control.getByRole("button", { name: "+1 min" }).click();
    await control.getByRole("button", { name: /Next item/ }).click();
    await control.getByRole("button", { name: "Stop", exact: true }).click();
    await control.getByRole("dialog").getByRole("button", { name: "Stop timer" }).click();

    // The record is on disk.
    const files = await readdir(join(userData, "reports"));
    expect(files).toHaveLength(1);
    const record = JSON.parse(await readFile(join(userData, "reports", files[0]!), "utf8"));
    expect(record.ending).toBe("stopped");
    expect(record.timeline.map((entry: { text: string }) => entry.text)).toContain("Added 1 min to Welcome and opening prayer");

    // A run this short counts as a test, so it is under "Show test runs".
    await control.getByRole("button", { name: "Reports", exact: true }).click();
    await reports().getByRole("switch", { name: "Show test runs" }).click();
    await reports().getByRole("navigation", { name: "Past services" }).getByRole("button").first().click();
    const table = reports().getByRole("table", { name: "Items" });
    await table.getByText("Welcome and opening prayer").waitFor();
    await table.getByText("Praise and worship").waitFor();
    expect(await table.getByRole("row").count()).toBe(7);
    await reports().getByRole("button", { name: /What happened/ }).click();
    await reports().getByRole("list", { name: "What happened" }).getByText("Service stopped").waitFor();
    if (shots) await control.screenshot({ path: join(shots, "report.png") });
  }, 30_000);

  it("copies a WhatsApp summary, and saves PDF and CSV", async () => {
    await reports().getByRole("button", { name: "Copy for WhatsApp" }).click();
    await control.getByText("Copied. Paste it into WhatsApp.").waitFor();
    const text = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(text).toMatch(/^\*Sunday service, \w+ \d+ \w+ \d{4}\*/);
    expect(text).toContain("1. Welcome and opening prayer:");

    await reports().getByRole("button", { name: "Save PDF" }).click();
    await reports().getByRole("button", { name: "Save CSV" }).click();
    let saved: string[] = [];
    for (let attempt = 0; attempt < 50 && saved.length < 2; attempt += 1) {
      saved = await readdir(saves);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const pdf = saved.find((name) => name.endsWith(".pdf"));
    const csv = saved.find((name) => name.endsWith(".csv"));
    expect(pdf).toBeDefined();
    expect((await readFile(join(saves, pdf!))).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await readFile(join(saves, csv!), "utf8")).toContain("Service,Date,Item,Started");
  }, 30_000);

  it("deletes a report after asking", async () => {
    await reports().getByRole("button", { name: "Delete" }).click();
    await reports().getByRole("button", { name: "Delete", exact: true }).click();
    await reports().getByText("Reports appear here after the first service.").waitFor();
    expect(await readdir(join(userData, "reports"))).toHaveLength(0);
  }, 30_000);
});
