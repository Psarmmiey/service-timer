import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

let app: ElectronApplication;

async function windowHasText(window: Page, text: string): Promise<boolean> {
  return window.evaluate((value) => document.body.innerText.includes(value), text);
}

async function findWindowByText(windows: Page[], text: string): Promise<Page | undefined> {
  for (const window of windows) {
    if (await windowHasText(window, text)) {
      return window;
    }
  }
  return undefined;
}

async function waitForWindows(appInstance: ElectronApplication, minimum: number): Promise<Page[]> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const windows = appInstance.windows();
    if (windows.length >= minimum) {
      return windows;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return appInstance.windows();
}

describe("electron smoke", () => {
  beforeAll(async () => {
    app = await electron.launch({
      args: ["."],
      env: {
        ...process.env,
        NODE_ENV: "test",
        SERVICE_TIMER_E2E_FORCE_DUAL: "1",
      },
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it("opens control and stage windows and streams state", async () => {
    const allWindows = await waitForWindows(app, 2);

    expect(allWindows.length).toBeGreaterThanOrEqual(2);

    // Add wait to ensure content is rendered
    await new Promise((resolve) => setTimeout(resolve, 500));

    const controlWindow = await findWindowByText(allWindows, "Control");
    const stageWindow = await findWindowByText(allWindows, "Stage");

    expect(controlWindow).toBeTruthy();
    expect(stageWindow).toBeTruthy();

    const [controlText, stageText] = await Promise.all([
      controlWindow!.evaluate(() => document.body.innerText),
      stageWindow!.evaluate(() => document.body.innerText),
    ]);

    expect(controlText).toContain("Status:");
    expect(stageText).toContain("Stage");
  }, 60_000);
});
