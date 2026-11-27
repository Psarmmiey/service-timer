import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

// FR-12a: plans come in as the WhatsApp message, a CSV, or a Service Timer backup.

let app: ElectronApplication;
let control: Page;
let downloads = "";
const shots = process.env.IMPORT_SHOTS;

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

const WHATSAPP = `*RCCG CITY OF GOD FOR ALL NATIONS STIRLING*

*Sunday, November 15th, 2026*

1. Opening prayers: 11.05 - 11.10pm *(Bro Tayo)*

2. Praise & Worship: 11.10 - 11.30pm *(Choir)*

3. Welcome: 11.30 - 11.35 *(Dcn Dolapo)*

4. Bible Reading: 11.35 - 11.40am *(Sis Farah)*

5. Hymn: 11.35 - 11.40am *(Choir)*

6. The Word: 11.40 - 12.25pm *(Pastor Richard)*

8. Offering/Tithe: 12.40pm - 12.55pm *Dcn Adedayo/Choir*

8. Announcement: 12.55 - 1.02pm *(Dcn Michael)*

9. Closing prayers: 12.02pm - 1.05pm *(Pastor Victor)*`;

const plansDialog = () => control.getByRole("dialog", { name: "Service plans" });
const pasteDialog = () => control.getByRole("dialog", { name: "Paste a running order" });

describe("importing plans", () => {
  beforeAll(async () => {
    downloads = await mkdtemp(join(tmpdir(), "service-timer-downloads-"));
    app = await electron.launch({
      args: ["."],
      env: { ...process.env, NODE_ENV: "test", SERVICE_TIMER_E2E_FORCE_DUAL: "1", SERVICE_TIMER_USER_DATA: await mkdtemp(join(tmpdir(), "service-timer-e2e-")) },
    });
    // Save downloads straight to a folder instead of asking where.
    await app.evaluate(({ session }, folder) => {
      session.defaultSession.on("will-download", (_event, item) => item.setSavePath(`${folder}/${item.getFilename()}`));
    }, downloads);
    control = await findWindow('header:has-text("Service Timer")');
    await control.setViewportSize({ width: 1366, height: 768 });
    await control.getByRole("button", { name: "Plans", exact: true }).click();
    await plansDialog().waitFor();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it("turns the WhatsApp message into a one-off plan, showing what it fixed", async () => {
    await plansDialog().getByRole("button", { name: "Paste running order" }).click();
    await pasteDialog().getByRole("textbox", { name: "Running order text" }).fill(WHATSAPP);
    const read = pasteDialog().getByRole("region", { name: "What was read" });
    await read.getByText("9 items · 110 min · 11:05 to 12:55").waitFor();
    const check = pasteDialog().getByRole("status", { name: "Please check" });
    expect(await check.innerText()).toContain("looks like a typo for 1.02pm");
    expect(await read.innerText()).not.toContain("Pastor");
    expect(await pasteDialog().getByRole("textbox", { name: "Plan name" }).inputValue()).toBe("Sunday service, 15 Nov");
    if (shots) await control.screenshot({ path: join(shots, "paste-whatsapp.png") });
    if (shots) await pasteDialog().getByRole("radio", { name: /Replace items in/ }).focus();
    await pasteDialog().getByRole("button", { name: "Create plan" }).click();
    await pasteDialog().waitFor({ state: "detached" });
    await plansDialog().getByRole("button", { name: /Sunday service, 15 Nov/ }).waitFor();
    expect(await plansDialog().innerText()).toContain("9 items · 110 min");
  }, 30_000);

  it("reads a CSV and can replace the items of the plan being edited", async () => {
    await plansDialog().getByLabel("Import a file").setInputFiles({
      name: "order.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Item,Minutes,Leader\nWelcome,5,Dcn Dolapo\nPraise and worship,20,Choir\nSermon,40,Pastor\n"),
    });
    await pasteDialog().waitFor();
    await pasteDialog().getByRole("radio", { name: /Replace items in/ }).click();
    await pasteDialog().getByRole("region", { name: "What was read" }).getByText("3 items · 65 min").waitFor();
    await pasteDialog().getByRole("button", { name: "Replace items" }).click();
    await control.getByText(/Replaced the running order of/).waitFor();
    if (shots) await control.screenshot({ path: join(shots, "after-replace.png") });
    expect(await plansDialog().innerText()).toContain("3 items · 65 min");
  }, 30_000);

  it("backs up every plan to one file and restores it", async () => {
    const before = await plansDialog().locator("aside button:has(span.text-sm)").count();
    await plansDialog().getByRole("button", { name: "Back up all plans" }).click();
    let file = "";
    for (let attempt = 0; attempt < 50 && !file; attempt += 1) {
      const { readdir } = await import("node:fs/promises");
      file = (await readdir(downloads)).find((name) => name.startsWith("service-timer-backup-") && name.endsWith(".json")) ?? "";
      if (!file) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(file).not.toBe("");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const backup = JSON.parse(await readFile(join(downloads, file), "utf8"));
    expect(backup.app).toBe("Service Timer");
    expect(backup.plans).toHaveLength(before);

    await plansDialog().getByLabel("Import a file").setInputFiles(join(downloads, file));
    await control.getByText(`Imported ${before} plans`).waitFor();
    // Names that already exist get a number rather than replacing anything.
    await plansDialog().getByRole("button", { name: /Sunday service, 15 Nov \(2\)/ }).waitFor();
    expect(await plansDialog().locator("aside button:has(span.text-sm)").count()).toBe(before * 2);
  }, 30_000);

  it("shows a plan on the schedule as soon as it is set active, even after a service has ended", async () => {
    await control.keyboard.press("Escape");
    await plansDialog().waitFor({ state: "detached" });
    // Run the current plan and stop it, so the service has ended.
    await control.getByRole("button", { name: /^(Start now|Start)$/ }).click();
    const late = control.getByRole("dialog");
    if (await late.waitFor({ timeout: 1_500 }).then(() => true, () => false)) {
      await late.getByRole("radio", { name: /Start from the top/ }).click();
      await late.getByRole("button", { name: "Start", exact: true }).click();
    }
    await control.getByRole("button", { name: "Stop", exact: true }).click();
    await control.getByRole("dialog").getByRole("button", { name: "Stop timer" }).click();
    const header = control.locator("header");
    expect(await header.innerText()).not.toContain("Sunday service, 15 Nov");

    await control.getByRole("button", { name: "Plans", exact: true }).click();
    await plansDialog().getByRole("button", { name: /^Sunday service, 15 Nov(?! \(2\))/ }).click();
    await plansDialog().getByRole("button", { name: "Set as active plan" }).click();
    await control.keyboard.press("Escape");
    await header.getByText("Sunday service, 15 Nov").waitFor({ timeout: 5_000 });
    await control.locator("aside").getByText("Praise and worship").waitFor();
    // Picking a plan never starts it by surprise.
    expect(await header.innerText()).not.toMatch(/Running/);
  }, 30_000);
});
