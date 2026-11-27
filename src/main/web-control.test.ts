import { afterEach, describe, expect, it } from "vitest";
import { createWebControl, describeDevice, newPin, type WebControl } from "./web-control";

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
  const post = (path: string, body: unknown, cookie?: string, header = true, userAgent?: string) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(header ? { "X-Service-Timer": "1" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(userAgent ? { "User-Agent": userAgent } : {}),
      },
      body: JSON.stringify(body),
    });
  const login = async (name = "Tolu", userAgent?: string) => {
    const response = await post("/api/login", { pin, name }, undefined, true, userAgent);
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
    for (let index = 0; index < 5; index += 1) expect((await post("/api/login", { pin: "0000", name: "Tolu" })).status).toBe(401);
    expect((await post("/api/login", { pin: "4821", name: "Tolu" })).status).toBe(429);
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

  it("needs a name, so the laptop can see who is connected", async () => {
    const { post } = await setup();
    expect((await post("/api/login", { pin: "4821" })).status).toBe(400);
    expect((await post("/api/login", { pin: "4821", name: "   " })).status).toBe(400);
    expect(control!.phones()).toHaveLength(0);
  });

  it("lists signed-in phones with name, device and last action", async () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const { base, post, login } = await setup();
    const cookie = await login("  Tolu\u0007 (media)  ", iphone);
    const abort = new AbortController();
    const response = await fetch(base + "/api/events", { headers: { Cookie: cookie }, signal: abort.signal });
    await response.body!.getReader().read();
    await post("/api/command", { type: "next" }, cookie);
    const [phone] = control!.phones();
    expect(phone).toMatchObject({ name: "Tolu (media)", device: "iPhone · Safari", address: "127.0.0.1", connected: true });
    expect(phone!.lastAction?.label).toBe("Next");
    expect(JSON.stringify(control!.phones())).not.toContain(cookie.split("=")[1]!);
    abort.abort();
  });

  it("disconnects one phone and tells it why, leaving the others signed in", async () => {
    const { base, post, login } = await setup();
    const tolu = await login("Tolu");
    const ada = await login("Ada");
    const abort = new AbortController();
    const response = await fetch(base + "/api/events", { headers: { Cookie: tolu }, signal: abort.signal });
    const reader = response.body!.getReader();
    await reader.read();
    const id = control!.phones().find((phone) => phone.name === "Tolu")!.id;
    expect(control!.disconnect(id)).toBe(true);
    let text = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) text += new TextDecoder().decode(chunk.value);
    expect(text).toContain("event: signed-out");
    expect(text).toContain('"reason":"disconnected"');
    expect((await post("/api/command", { type: "next" }, tolu)).status).toBe(401);
    expect((await post("/api/command", { type: "next" }, ada)).status).toBe(204);
    expect(control!.phones().map((phone) => phone.name)).toEqual(["Ada"]);
    expect(control!.disconnect("nope")).toBe(false);
  });

  it("replaces an idle entry when the same person signs in again", async () => {
    const { login } = await setup();
    await login("Tolu");
    await login("Tolu");
    await login("Ada");
    expect(control!.phones().map((phone) => phone.name).sort()).toEqual(["Ada", "Tolu"]);
  });

  it("describes common phones and browsers", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36")).toBe("Android phone · Chrome");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36")).toBe("Android phone · Samsung Internet");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Chrome");
    expect(describeDevice(undefined)).toBe("Unknown device");
  });

  it("makes 4-digit PINs", () => {
    for (let index = 0; index < 20; index += 1) expect(newPin()).toMatch(/^\d{4}$/);
  });
});
