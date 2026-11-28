import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

// FR-5, FR-11 and the M / Esc shortcuts, driven through the real app.

let app: ElectronApplication;
let control: Page;
let stage: Page;
/** The digits are refitted on the frame after a size change; wait until they fit their box. */
async function digitsFitted(page: Page) {
  await page.waitForFunction(() => {
    const box = document.querySelector<HTMLElement>(".stage-digits-box");
    return Boolean(box && box.dataset.fitted === `${box.clientWidth}x${box.clientHeight}`);
  }, undefined, { timeout: 5_000 });
}

const shots = process.env.STAGE_MESSAGE_SHOTS ?? "/tmp/service-timer-screenshots/messages";

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

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

const stageMessage = () => stage.locator(".stage-message");

async function expectStageMessage(text: string) {
  await stage.waitForSelector(`.stage-message:has-text(${JSON.stringify(text)})`, { timeout: 5_000 });
  await control.waitForSelector(`[aria-label="Stage preview"] .stage-message:has-text(${JSON.stringify(text)})`, { timeout: 5_000 });
}

async function expectNoStageMessage() {
  await stage.waitForSelector(".stage-message", { state: "detached", timeout: 5_000 });
  await control.waitForSelector('[aria-label="Stage preview"] .stage-message', { state: "detached", timeout: 5_000 });
}

async function blurFocus() {
  await control.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

describe("stage messages", () => {
  beforeAll(async () => {
    await mkdir(shots, { recursive: true });
    app = await electron.launch({
      args: ["."],
      env: { ...process.env, NODE_ENV: "test", SERVICE_TIMER_E2E_FORCE_DUAL: "1", SERVICE_TIMER_USER_DATA: await mkdtemp(join(tmpdir(), "service-timer-e2e-")) },
    });
    control = await findWindow('header:has-text("Service Timer")');
    stage = await findWindow('[aria-label="Stage display"]');
    await control.setViewportSize({ width: 1366, height: 720 });
    await stage.setViewportSize({ width: 1920, height: 1080 });
    await control.getByRole("button", { name: /^(Start now|Start)$/ }).waitFor();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it("shows a message before the service starts", async () => {
    await control.getByRole("radio", { name: "Please wrap up" }).click();
    await expectStageMessage("Please wrap up");
    await stage.screenshot({ path: join(shots, "01-before-service.png") });
    await control.getByRole("button", { name: "Clear", exact: true }).click();
    await expectNoStageMessage();
  });

  it("presets replace each other and stay shown until cleared", async () => {
    await control.getByRole("button", { name: /^(Start now|Start)$/ }).click();
    const late = control.getByRole("dialog");
    if (await late.waitFor({ timeout: 1_500 }).then(() => true, () => false)) {
      await late.getByRole("radio", { name: /Start from the top/ }).click();
      await late.getByRole("button", { name: "Start", exact: true }).click();
    }
    await control.waitForSelector("button:has-text('Pause')");

    await control.getByRole("radio", { name: "5 minutes" }).click();
    await expectStageMessage("5 minutes");
    await control.getByRole("radio", { name: "Time for altar call" }).click();
    await expectStageMessage("Time for altar call");
    expect(await stageMessage().count()).toBe(1);
    expect(await control.getByRole("radio", { name: "Time for altar call" }).getAttribute("aria-checked")).toBe("true");
    await stage.screenshot({ path: join(shots, "02-running-preset.png") });

    // Clicking the selected preset again must not leave the stage and the buttons disagreeing.
    await control.getByRole("radio", { name: "Time for altar call" }).click();
    await control.waitForTimeout(400);
    const shown = await stageMessage().count();
    const checked = await control.getByRole("radio", { name: "Time for altar call" }).getAttribute("aria-checked");
    expect({ shown, checked }).toEqual(shown ? { shown: 1, checked: "true" } : { shown: 0, checked: "false" });
  });

  it("sends a custom message with Enter or Show, and ignores an empty one", async () => {
    const box = control.getByRole("textbox", { name: "Custom message" });
    await box.fill("Pastor, 10 minutes please");
    await box.press("Enter");
    await expectStageMessage("Pastor, 10 minutes please");

    await box.fill("Choir to the front");
    await control.getByRole("button", { name: "Show", exact: true }).click();
    await expectStageMessage("Choir to the front");

    await box.fill("   ");
    await box.press("Enter");
    await control.waitForTimeout(400);
    await expectStageMessage("Choir to the front");
    expect(await box.getAttribute("maxlength")).toBe("120");
  });

  it("flashes only when Flash is on", async () => {
    expect(await stageMessage().getAttribute("data-flash")).toBe("false");
    await control.getByRole("switch", { name: "Flash stage message" }).click();
    await control.getByRole("radio", { name: "Please wrap up" }).click();
    await expectStageMessage("Please wrap up");
    expect(await stageMessage().getAttribute("data-flash")).toBe("true");
    const animation = await stageMessage().evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe("message-flash");
    // The switch also changes the message already on the stage, both ways.
    await control.getByRole("switch", { name: "Flash stage message" }).click();
    await stage.waitForSelector('.stage-message[data-flash="false"]', { timeout: 5_000 });
    await control.getByRole("switch", { name: "Flash stage message" }).click();
    await stage.waitForSelector('.stage-message[data-flash="true"]', { timeout: 5_000 });
    // It visibly swaps: white box, then white outline.
    const looks = new Set<string>();
    for (let sample = 0; sample < 6; sample += 1) {
      looks.add(await stageMessage().evaluate((el) => getComputedStyle(el).backgroundColor));
      await stage.waitForTimeout(250);
    }
    expect(looks.size).toBeGreaterThan(1);
    await control.getByRole("switch", { name: "Flash stage message" }).click();
    await stage.waitForSelector('.stage-message[data-flash="false"]', { timeout: 5_000 });
  });

  it("clears with the Clear button and with Esc, and M focuses the message box", async () => {
    await control.getByRole("button", { name: "Clear", exact: true }).click();
    await expectNoStageMessage();
    expect(await control.getByRole("button", { name: "Clear", exact: true }).isDisabled()).toBe(true);

    await control.getByRole("radio", { name: "2 minutes" }).click();
    await expectStageMessage("2 minutes");
    await blurFocus();
    await control.keyboard.press("Escape");
    await expectNoStageMessage();

    await blurFocus();
    await control.keyboard.press("m");
    expect(await control.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Custom message");
    await control.keyboard.type("Typed after M");
    await control.keyboard.press("Enter");
    await expectStageMessage("Typed after M");
    await control.keyboard.press("Escape");
    await expectNoStageMessage();
  });

  it("is hidden during blackout and comes back afterwards", async () => {
    await control.getByRole("radio", { name: "Please wrap up" }).click();
    await expectStageMessage("Please wrap up");
    const blackout = control.getByRole("button", { name: /^(Blackout|Stage blacked out\. Show the timer)$/ });
    await blackout.click();
    await stage.waitForSelector('[aria-label="Stage is blacked out"]');
    expect(await stageMessage().count()).toBe(0);
    await blackout.click();
    await expectStageMessage("Please wrap up");
  });

  it("does not cover the countdown or the next line at common stage sizes", async () => {
    const results: string[] = [];
    for (const size of [{ width: 1024, height: 768 }, { width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
      await stage.setViewportSize(size);
      await digitsFitted(stage);
      const message = (await stageMessage().boundingBox())!;
      const digits = (await stage.locator(".stage-digits").boundingBox())!;
      const next = await stage.locator(".stage-next").boundingBox();
      const fontPx = await stageMessage().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      results.push(`${size.width}x${size.height}: font ${Math.round(fontPx)}px, covers digits ${overlaps(message, digits)}, covers next ${next ? overlaps(message, next) : "n/a"}, inside ${message.y + message.height <= size.height}`);
      await stage.screenshot({ path: join(shots, `03-running-${size.width}x${size.height}.png`) });
    }
    console.log(results.join("\n"));
    expect(results.every((line) => line.includes("covers digits false"))).toBe(true);
    expect(results.every((line) => line.includes("covers next false"))).toBe(true);
    expect(results.every((line) => line.includes("inside true"))).toBe(true);
    await stage.setViewportSize({ width: 1920, height: 1080 });
    const fontPx = await stageMessage().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontPx).toBeGreaterThanOrEqual(1080 * 0.05);
  });

  it("wraps a long custom message without leaving the screen", async () => {
    await stage.setViewportSize({ width: 1920, height: 1080 });
    const long = "Please can the ushers bring the offering baskets to the front now and the choir get ready for the next song";
    const box = control.getByRole("textbox", { name: "Custom message" });
    await box.fill(long);
    await box.press("Enter");
    await expectStageMessage(long.slice(0, 40));
    await digitsFitted(stage);
    const message = (await stageMessage().boundingBox())!;
    expect(message.x).toBeGreaterThanOrEqual(0);
    expect(message.x + message.width).toBeLessThanOrEqual(1920);
    expect(message.y + message.height).toBeLessThanOrEqual(1080);
    expect(overlaps(message, (await stage.locator(".stage-digits").boundingBox())!)).toBe(false);
    expect(overlaps(message, (await stage.locator(".stage-next").boundingBox())!)).toBe(false);
    await stage.screenshot({ path: join(shots, "04-long-message.png") });
  });

  it("stays readable on the red time up screen", async () => {
    await control.getByRole("radio", { name: "Please wrap up" }).click();
    await expectStageMessage("Please wrap up");
    await blurFocus();
    for (let index = 0; index < 6; index += 1) await control.keyboard.press("-");
    await stage.waitForSelector('.stage-view[data-over="true"]');
    const message = (await stageMessage().boundingBox())!;
    const digits = (await stage.locator(".stage-digits").boundingBox())!;
    expect(overlaps(message, digits)).toBe(false);
    expect(message.y + message.height).toBeLessThanOrEqual(1080);
    await stage.screenshot({ path: join(shots, "05-time-up.png") });
    const box = control.getByRole("textbox", { name: "Custom message" });
    await box.fill("Please can the ushers bring the offering baskets to the front now and the choir get ready for the next song");
    await box.press("Enter");
    await expectStageMessage("Please can the ushers");
    const longBox = (await stageMessage().boundingBox())!;
    expect(overlaps(longBox, (await stage.locator(".stage-digits").boundingBox())!)).toBe(false);
    expect(longBox.y + longBox.height).toBeLessThanOrEqual(1080);
    await stage.screenshot({ path: join(shots, "05b-time-up-long.png") });
    await control.getByRole("radio", { name: "Please wrap up" }).click();
    await control.screenshot({ path: join(shots, "06-control.png") });
  });

  it("clears the message when moving to the next item", async () => {
    await blurFocus();
    await control.keyboard.press("n");
    await expectNoStageMessage();
  });

  it("shows Please wrap up by itself one minute before the end, and takes it away if time is added", async () => {
    // Praise and worship (20 min) is running: bring it down to under a minute.
    await blurFocus();
    for (let index = 0; index < 19; index += 1) await control.keyboard.press("-");
    await expectStageMessage("Please wrap up");
    await stage.screenshot({ path: join(shots, "07-wrap-up.png") });
    await control.keyboard.press("+");
    await expectNoStageMessage();
  });
});
