import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

let app: ElectronApplication;
let controlWindow: Page;
let stageWindow: Page;

/** The digits are refitted on the frame after a size change; wait until they fit their box. */
async function digitsFitted(page: Page) {
  await page.waitForFunction(() => {
    const box = document.querySelector<HTMLElement>(".stage-digits-box");
    return Boolean(box && box.dataset.fitted === `${box.clientWidth}x${box.clientHeight}`);
  }, undefined, { timeout: 5_000 });
}

async function waitForWindows(appInstance: ElectronApplication, minimum: number): Promise<Page[]> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const windows = appInstance.windows();
    if (windows.length >= minimum) return windows;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return appInstance.windows();
}

async function findWindowBySelector(windows: Page[], selector: string): Promise<Page | undefined> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    for (const window of windows) {
      if (await window.locator(selector).count()) return window;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return undefined;
}

describe("electron milestone 3 UI", () => {
  beforeAll(async () => {
    app = await electron.launch({
      args: ["."],
      env: {
        ...process.env,
        NODE_ENV: "test",
        SERVICE_TIMER_E2E_FORCE_DUAL: "1",
        SERVICE_TIMER_USER_DATA: await mkdtemp(join(tmpdir(), "service-timer-e2e-")),
      },
    });

    const windows = await waitForWindows(app, 2);
    controlWindow = (await findWindowBySelector(windows, 'header:has-text("Service Timer")'))!;
    stageWindow = (await findWindowBySelector(windows, '[aria-label="Stage display"]'))!;
    expect(controlWindow).toBeTruthy();
    expect(stageWindow).toBeTruthy();
    await controlWindow.getByRole("button", { name: /^(Start now|Start)$/ }).waitFor();
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it("fits the control window and sends controls to the stage", async () => {
    await controlWindow.setViewportSize({ width: 1366, height: 720 });
    expect(await controlWindow.locator("body").innerText()).toContain("Sunday service");
    const metrics = await controlWindow.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      height: window.innerHeight,
      mainWidth: document.querySelector("main")?.scrollWidth,
      width: window.innerWidth,
    }));
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.height);
    expect(metrics.mainWidth).toBeLessThanOrEqual(metrics.width);

    await controlWindow.getByRole("button", { name: /^(Start now|Start)$/ }).click();
    // Depending on the time of day the test runs, a late start opens the prompt (FR-16).
    const lateStart = controlWindow.getByRole("dialog");
    if (await lateStart.isVisible().catch(() => false) || await lateStart.waitFor({ timeout: 1_500 }).then(() => true, () => false)) {
      await lateStart.getByRole("radio", { name: /Start from the top/ }).click();
      await lateStart.getByRole("button", { name: "Start", exact: true }).click();
    }
    await controlWindow.waitForSelector("button:has-text('Pause')");
    await stageWindow.waitForSelector('[aria-label="Stage display"]');
    // Item names show in capitals on the stage by default.
    expect(await stageWindow.locator("body").innerText()).toContain("WELCOME AND OPENING PRAYER");

    await controlWindow.getByText("Please wrap up", { exact: true }).click();
    await stageWindow.waitForSelector(".stage-message:has-text('Please wrap up')");

    const blackout = controlWindow.getByRole("button", { name: /^(Blackout|Stage blacked out\. Show the timer)$/ });
    await blackout.click();
    await stageWindow.waitForSelector('[aria-label="Stage is blacked out"]');
    await blackout.click();
    await stageWindow.waitForSelector('[aria-label="Stage display"]');

    await controlWindow.getByRole("textbox", { name: "Custom message" }).fill("Speaker, please finish");
    await controlWindow.keyboard.press("Enter");
    await stageWindow.waitForSelector(".stage-message:has-text('Speaker, please finish')");
    await controlWindow.keyboard.press("Escape");
    await stageWindow.waitForSelector(".stage-message", { state: "detached" });

    await controlWindow.getByRole("button", { name: "Add item after current" }).click();
    await controlWindow.getByRole("textbox", { name: "Title" }).fill("Testimony");
    await controlWindow.getByRole("spinbutton", { name: "Minutes" }).fill("3");
    await controlWindow.getByRole("button", { name: "Add item", exact: true }).click();
    // The schedule updates on the next state broadcast, so wait rather than read straight away.
    await controlWindow.locator("aside").getByText("Testimony").first().waitFor({ timeout: 5_000 });
    await stageWindow.waitForSelector(".stage-next:has-text('Next: Testimony (3 min)')");

    await controlWindow.getByRole("button", { name: "Custom ± time" }).click();
    await controlWindow.getByRole("spinbutton", { name: "Amount" }).fill("2");
    await controlWindow.getByRole("button", { name: "Add time", exact: true }).click();
    await controlWindow.getByRole("button", { name: "Custom ± time" }).click();
    await controlWindow.getByRole("spinbutton", { name: "Amount" }).fill("2");
    await controlWindow.getByRole("button", { name: "Take away", exact: true }).click();

    const screenshotDir = process.env.COPILOT_ARTIFACTS_DIR ?? "/tmp/service-timer-screenshots";
    await mkdir(screenshotDir, { recursive: true });
    await controlWindow.screenshot({ path: join(screenshotDir, "control-1366x720.png") });
    await stageWindow.setViewportSize({ width: 1920, height: 1080 });
    await stageWindow.screenshot({ path: join(screenshotDir, "stage-running-1920x1080.png") });
    await stageWindow.setViewportSize({ width: 800, height: 600 });
  }, 60_000);

  it("shows warning and overrun states on the stage", async () => {
    await controlWindow.getByText("Please wrap up", { exact: true }).click();
    for (let index = 0; index < 4; index += 1) await controlWindow.keyboard.press("-");
    expect(await stageWindow.locator(".stage-digits").getAttribute("data-warning")).toBe("true");
    for (let index = 0; index < 2; index += 1) await controlWindow.keyboard.press("-");
    await stageWindow.waitForSelector(".timeup-sign:has-text('TIME UP')");
    expect(await stageWindow.locator(".stage-item").textContent()).toBe("Welcome and opening prayer");
    expect(await stageWindow.locator(".stage-view").getAttribute("data-flash-time-up")).toBe("true");
    expect(await stageWindow.locator(".stage-view").getAttribute("data-over")).toBe("true");
    // Over time reads "1:36 OVER", never "+1:36", which people took for time added.
    expect(await stageWindow.locator(".stage-digits").innerText()).toMatch(/^\d+:\d{2}\s*OVER$/);
    await stageWindow.setViewportSize({ width: 1920, height: 1080 });
    const screenshotDir = process.env.COPILOT_ARTIFACTS_DIR ?? "/tmp/service-timer-screenshots";
    await mkdir(screenshotDir, { recursive: true });
    await stageWindow.screenshot({ path: join(screenshotDir, "stage-time-up-1920x1080.png") });
  }, 30_000);

  it("keeps countdown digits large at supported stage resolutions", async () => {
    // Arrow keys on a focused toggle group belong to the group, so move focus away first.
    await controlWindow.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await controlWindow.keyboard.press("ArrowLeft");
    await stageWindow.waitForSelector(".stage-next");
    const sizes = [
      { width: 1024, height: 768 },
      { width: 1920, height: 1080 },
      { width: 3840, height: 2160 },
    ];
    const screenshotDir = process.env.COPILOT_ARTIFACTS_DIR ?? "/tmp/service-timer-screenshots";
    await mkdir(screenshotDir, { recursive: true });

    for (const size of sizes) {
      await stageWindow.setViewportSize(size);
      await digitsFitted(stageWindow);
      const bounds = await stageWindow.locator(".stage-digits").boundingBox();
      const titleBounds = await stageWindow.locator(".stage-title").boundingBox();
      const nextBounds = await stageWindow.locator(".stage-next").boundingBox();
      expect(bounds).toBeTruthy();
      expect(titleBounds).toBeTruthy();
      expect(nextBounds).toBeTruthy();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width);
      expect(titleBounds!.y).toBeGreaterThanOrEqual(0);
      expect(nextBounds!.y + nextBounds!.height).toBeLessThanOrEqual(size.height);
      if (size.width === 1920) {
        expect(bounds!.height).toBeGreaterThanOrEqual(size.height * 0.6);
      }
      await stageWindow.screenshot({
        path: join(screenshotDir, `stage-${size.width}x${size.height}.png`),
      });
    }
  }, 60_000);

  it("keeps ten minutes or more on screen at every size", async () => {
    await controlWindow.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let index = 0; index < 8; index += 1) await controlWindow.keyboard.press("+");
    await stageWindow.waitForFunction(() => /^\d{2}:\d{2}$/.test(document.querySelector(".stage-digits")?.textContent ?? ""));
    for (const size of [{ width: 1024, height: 768 }, { width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
      await stageWindow.setViewportSize(size);
      await digitsFitted(stageWindow);
      const bounds = (await stageWindow.locator(".stage-digits").boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width);
      expect(bounds.height).toBeGreaterThanOrEqual(size.height * 0.45);
    }
  }, 30_000);
});
