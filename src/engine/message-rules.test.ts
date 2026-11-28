import { describe, expect, it } from "vitest";
import { createIdleState, reduce } from "./engine";
import { applyMessageRules, type MessageRules } from "./message-rules";
import type { Plan, RunState } from "./types";

const plan: Plan = {
  id: "p",
  name: "Sunday service",
  startTime: "09:45",
  days: [0],
  autoStart: false,
  kind: "recurring",
  updatedAt: "2026-11-26T00:00:00Z",
  items: [
    { id: "welcome", title: "Welcome", minutes: 5 },
    { id: "notice", title: "Notice", minutes: 1 },
    { id: "sermon", title: "Sermon", minutes: 40 },
  ],
};
const rules: MessageRules = { wrapUpAtSeconds: 60, wrapUpText: "Please wrap up", clearOnItemChange: true };
const t0 = new Date(2026, 10, 29, 9, 45).getTime();
const at = (seconds: number) => t0 + seconds * 1000;

/** Apply a command (or a tick), then the message rules, like the app does. */
function step(state: RunState, command: Parameters<typeof reduce>[1], now: number, options = rules): RunState {
  return applyMessageRules(state, reduce(state, command, now, plan), plan, now, options);
}

function running(): RunState {
  return step(createIdleState(plan, "2026-11-29"), { type: "startChoice", mode: "fromItem", index: 0 }, t0);
}

describe("stage message rules", () => {
  it("shows Please wrap up with one minute left, once", () => {
    let state = running();
    state = step(state, { type: "tick" }, at(239));
    expect(state.message).toBeUndefined();
    state = step(state, { type: "tick" }, at(240));
    expect(state.message).toEqual({ text: "Please wrap up", flash: false, auto: true });
    // Cleared by someone: it does not come back for the same item.
    state = step(state, { type: "clearMessage" }, at(250));
    state = step(state, { type: "tick" }, at(251));
    expect(state.message).toBeUndefined();
  });

  it("never covers a message someone has put up", () => {
    let state = step(running(), { type: "message", text: "Altar call next" }, at(100));
    state = step(state, { type: "tick" }, at(245));
    expect(state.message?.text).toBe("Altar call next");
  });

  it("takes itself away if time is added, and comes back near the new end", () => {
    let state = step(running(), { type: "tick" }, at(245));
    expect(state.message?.auto).toBe(true);
    state = step(state, { type: "adjust", ms: 120_000 }, at(246));
    expect(state.message).toBeUndefined();
    state = step(state, { type: "tick" }, at(359));
    expect(state.message).toBeUndefined();
    state = step(state, { type: "tick" }, at(366));
    expect(state.message?.text).toBe("Please wrap up");
  });

  it("skips items no longer than the warning, and stays off when switched off", () => {
    let state = step(running(), { type: "next" }, at(10));
    state = step(state, { type: "tick" }, at(15));
    expect(state.message).toBeUndefined();
    const off = { ...rules, wrapUpAtSeconds: 0 };
    let quiet = step(running(), { type: "tick" }, at(10), off);
    quiet = step(quiet, { type: "tick" }, at(250), off);
    expect(quiet.message).toBeUndefined();
  });

  it("clears the message when the timer moves to another item", () => {
    let state = step(running(), { type: "message", text: "5 minutes" }, at(30));
    state = step(state, { type: "next" }, at(40));
    expect(state.message).toBeUndefined();
    state = step(state, { type: "message", text: "Please wrap up" }, at(45));
    state = step(state, { type: "previous" }, at(50));
    expect(state.message).toBeUndefined();
  });

  it("keeps the message on a new item when that switch is off", () => {
    const keep = { ...rules, clearOnItemChange: false };
    let state = step(running(), { type: "message", text: "5 minutes" }, at(30), keep);
    state = step(state, { type: "next" }, at(40), keep);
    expect(state.message?.text).toBe("5 minutes");
  });

  it("leaves a message alone when the item restarts or the service starts", () => {
    const idle = step(createIdleState(plan, "2026-11-29"), { type: "message", text: "Service starts soon" }, t0 - 60_000);
    const started = step(idle, { type: "startChoice", mode: "fromItem", index: 0 }, t0);
    expect(started.message?.text).toBe("Service starts soon");
    const restarted = step(step(started, { type: "message", text: "Mic check" }, at(5)), { type: "restartItem" }, at(6));
    expect(restarted.message?.text).toBe("Mic check");
  });
});
