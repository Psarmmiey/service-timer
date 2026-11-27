import { afterEach, describe, expect, it } from "vitest";
import { createWebControl, newPin, type WebControl } from "./web-control";

let control: WebControl | null = null;
afterEach(async () => {
  await control?.stop();
  control = null;
});

async function setup(pin = "4821") {
  const received: Record<string, unknown>[] = [];
  let snapshot: Record<string, unknown> = { status: "running", timeLeftMs: 60_000 };
  control = createWebControl({
    getSnapshot: () => snapshot,
    onCommand: (command) => {
      received.push(command);
      return true;
    },
    getPin: () => pin,
  });
  const port = await control.start(0, "127.0.0.1");
  const base = `http://127.0.0.1:${port}`;
  const post = (path: string, body: unknown, cookie?: string, header = true) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(header ? { "X-Service-Timer": "1" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
  const login = async () => {
    const response = await post("/api/login", { pin });
    return response.headers.get("set-cookie")!.split(";")[0]!;
  };
  return { base, post, login, received, setSnapshot: (next: Record<string, unknown>) => { snapshot = next; } };
}

describe("phone control server", () => {
  it("serves the phone page without signing in", async () => {
    const { base } = await setup();
    const response = await fetch(base + "/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Service Timer");
  });

  it("rejects a wrong PIN and limits attempts to five a minute", async () => {
    const { post } = await setup();
    for (let index = 0; index < 5; index += 1) expect((await post("/api/login", { pin: "0000" })).status).toBe(401);
    expect((await post("/api/login", { pin: "4821" })).status).toBe(429);
  });

  it("needs the custom header, so other websites can't post to it", async () => {
    const { post } = await setup();
    expect((await post("/api/login", { pin: "4821" }, undefined, false)).status).toBe(403);
  });

  it("refuses commands before signing in", async () => {
    const { post, received } = await setup();
    expect((await post("/api/command", { type: "next" })).status).toBe(401);
    expect(received).toHaveLength(0);
  });

  it("accepts live controls but never plan or settings changes", async () => {
    const { post, login, received } = await setup();
    const cookie = await login();
    expect((await post("/api/command", { type: "next" }, cookie)).status).toBe(204);
    expect((await post("/api/command", { type: "message", text: "Please wrap up" }, cookie)).status).toBe(204);
    expect((await post("/api/command", { type: "doNext", index: 3 }, cookie)).status).toBe(204);
    expect((await post("/api/command", { type: "savePlans", plans: [] }, cookie)).status).toBe(403);
    expect((await post("/api/command", { type: "editPlan", plan: {} }, cookie)).status).toBe(403);
    expect((await post("/api/command", { type: "saveSettings", settings: {} }, cookie)).status).toBe(403);
    expect(received.map((command) => command.type)).toEqual(["next", "message", "doNext"]);
  });

  it("streams state to signed-in phones and counts them", async () => {
    const { base, login, setSnapshot } = await setup();
    const cookie = await login();
    const abort = new AbortController();
    const response = await fetch(base + "/api/events", { headers: { Cookie: cookie }, signal: abort.signal });
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('"status":"running"');
    expect(control!.clientCount()).toBe(1);
    setSnapshot({ status: "overrun" });
    control!.broadcast();
    const second = new TextDecoder().decode((await reader.read()).value);
    expect(second).toContain('"status":"overrun"');
    abort.abort();
  });

  it("signs everyone out when the PIN changes", async () => {
    const { post, login } = await setup();
    const cookie = await login();
    control!.signOutAll();
    expect((await post("/api/command", { type: "next" }, cookie)).status).toBe(401);
  });

  it("makes 4-digit PINs", () => {
    for (let index = 0; index < 20; index += 1) expect(newPin()).toMatch(/^\d{4}$/);
  });
});
