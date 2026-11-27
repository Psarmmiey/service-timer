import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

// FR-22: turn phone control on in Settings, then drive the timer as a phone would.

let app: ElectronApplication;
let control: Page;
let base = "";
let cookie = "";

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

const post = (path: string, body: unknown, withCookie = true) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Service-Timer": "1", ...(withCookie && cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });

describe("phone control", () => {
  beforeAll(async () => {
    app = await electron.launch({
      args: ["."],
      env: {
        ...process.env,
        NODE_ENV: "test",
        SERVICE_TIMER_E2E_FORCE_DUAL: "1",
        SERVICE_TIMER_E2E_WEB: "1",
        SERVICE_TIMER_USER_DATA: await mkdtemp(join(tmpdir(), "service-timer-e2e-")),
      },
    });
    control = await findWindow('header:has-text("Service Timer")');
    await control.setViewportSize({ width: 1366, height: 720 });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it("shows an address and PIN once switched on in Settings", async () => {
    await control.getByRole("button", { name: "Settings" }).click();
    await control.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Phone control" }).click();
    await control.getByRole("switch", { name: "Let phones control the timer" }).click();
    const pinElement = control.getByLabel("Phone PIN");
    await pinElement.waitFor({ timeout: 10_000 });
    const pin = (await pinElement.textContent())!.trim();
    expect(pin).toMatch(/^\d{4}$/);
    const url = (await control.locator("text=/^http:\\/\\/[0-9.]+:\\d+$/").first().textContent().catch(() => null))?.trim();
    const port = url ? new URL(url).port : "4280";
    base = `http://127.0.0.1:${port}`;

    expect((await post("/api/login", { pin: pin === "0000" ? "1111" : "0000" })).status).toBe(401);
    const login = await post("/api/login", { pin });
    expect(login.status).toBe(200);
    cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    await control.keyboard.press("Escape");
  }, 30_000);

  it("drives the timer from a phone and shows the phone as connected", async () => {
    const abort = new AbortController();
    const events = await fetch(base + "/api/events", { headers: { Cookie: cookie }, signal: abort.signal });
    const first = new TextDecoder().decode((await events.body!.getReader().read()).value);
    expect(first).toContain('"planName"');
    await control.getByText("1 phone").waitFor({ timeout: 5_000 });

    // Start (from the top if the default plan's time has passed), then Next from the "phone".
    const start = await post("/api/command", { type: "startChoice", mode: "fromTop" });
    expect(start.status).toBe(204);
    await control.getByRole("button", { name: "Pause", exact: true }).waitFor();
    expect((await post("/api/command", { type: "next" })).status).toBe(204);
    await control.locator("aside").getByText("Praise and worship").first().waitFor();
    expect(await control.locator("aside").innerText()).toMatch(/Now/);

    expect((await post("/api/command", { type: "message", text: "From the phone" })).status).toBe(204);
    await control.locator('[aria-label="Stage preview"] .stage-message:has-text("From the phone")').waitFor();
    abort.abort();
  }, 30_000);

  it("never lets a phone change plans or settings", async () => {
    expect((await post("/api/command", { type: "savePlans", plans: [], activePlanId: "x" })).status).toBe(403);
    expect((await post("/api/command", { type: "saveSettings", settings: {} })).status).toBe(403);
    expect((await post("/api/command", { type: "next" }, false)).status).toBe(401);
  });

  it("signs phones out when a new PIN is made", async () => {
    await control.getByRole("button", { name: "Settings" }).click();
    await control.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Phone control" }).click();
    await control.getByRole("button", { name: "New PIN" }).click();
    await control.waitForTimeout(300);
    expect((await post("/api/command", { type: "pause" })).status).toBe(401);
    await control.keyboard.press("Escape");
  });
});
