import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

// When an update has downloaded, the control window says so, but never during a service.

let app: ElectronApplication;
let control: Page;
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

describe("update ready", () => {
  beforeAll(async () => {
    app = await electron.launch({
      args: ["."],
      env: { ...process.env, NODE_ENV: "test", SERVICE_TIMER_E2E_FORCE_DUAL: "1", SERVICE_TIMER_E2E_UPDATE_READY: "9.9.9", SERVICE_TIMER_USER_DATA: await mkdtemp(join(tmpdir(), "service-timer-e2e-")) },
    });
    control = await findWindow('header:has-text("Service Timer")');
    await control.setViewportSize({ width: 1366, height: 768 });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it("offers Restart now when no service is running, hides it during a service and offers it again after", async () => {
    const note = control.getByText("Update 9.9.9 ready");
    await note.waitFor({ timeout: 5_000 });
    await control.getByRole("button", { name: "Restart now" }).waitFor();
    await control.getByRole("button", { name: "Later" }).waitFor();
    if (shots) {
      await control.waitForTimeout(800);
      await control.screenshot({ path: join(shots, "update-ready.png"), clip: { x: 900, y: 560, width: 466, height: 208 } });
    }

    await control.getByRole("button", { name: /^(Start now|Start)$/ }).first().click();
    const late = control.getByRole("dialog");
    if (await late.waitFor({ timeout: 1_500 }).then(() => true, () => false)) {
      await late.getByRole("radio", { name: /Start from the top/ }).click();
      await late.getByRole("button", { name: "Start", exact: true }).click();
    }
    await control.getByRole("button", { name: "Pause", exact: true }).waitFor();
    await note.waitFor({ state: "detached", timeout: 5_000 });

    await control.getByRole("button", { name: "Stop", exact: true }).click();
    await control.getByRole("dialog").getByRole("button", { name: "Stop timer" }).click();
    await note.waitFor({ timeout: 5_000 });

    // Settings explains what happens and offers the same restart.
    await control.getByRole("button", { name: "Later" }).click();
    await control.getByRole("button", { name: "Settings" }).click();
    await control.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Updates" }).click();
    await control.getByText("installs next time Service Timer is closed while no service is running", { exact: false }).first().waitFor();
    await control.getByRole("button", { name: "Restart to update" }).waitFor();
  }, 30_000);
});
