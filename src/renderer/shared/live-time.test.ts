import { describe, expect, it } from "vitest";
import type { AppState } from "../../shared/ipc";
import { formatStageTime } from "./format";
import { msUntilNextSecond, projectState } from "./live-time";

const sentAt = 1_000_000;
function stateWith(view: Partial<AppState["view"]>): AppState {
  return { now: sentAt, view: { status: "running", paused: false, timeLeftMs: 65_400, colourBand: "normal", scheduleRows: [], ...view } } as unknown as AppState;
}

describe("counting between updates", () => {
  it("keeps counting down from when the update was sent", () => {
    const live = projectState(stateWith({}), sentAt + 450);
    expect(live.view.timeLeftMs).toBe(64_950);
    expect(live.now).toBe(sentAt + 450);
    expect(formatStageTime(live.view.timeLeftMs)).toBe("1:04");
  });

  it("turns into time up at zero without waiting for the next update", () => {
    const live = projectState(stateWith({ timeLeftMs: 200 }), sentAt + 300);
    expect(live.view.status).toBe("overrun");
    expect(live.view.colourBand).toBe("over");
    expect(live.view.timeLeftMs).toBe(-100);
  });

  it("holds still while paused, but the clock moves on", () => {
    const live = projectState(stateWith({ paused: true }), sentAt + 5_000);
    expect(live.view.timeLeftMs).toBe(65_400);
    expect(live.now).toBe(sentAt + 5_000);
  });

  it("wakes up just after the seconds change, counting down or up", () => {
    expect(msUntilNextSecond(65_400)).toBe(410);
    expect(msUntilNextSecond(65_000)).toBe(10);
    expect(msUntilNextSecond(-1_300)).toBe(710);
  });
});
