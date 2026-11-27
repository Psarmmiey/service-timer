import { describe, expect, it } from "vitest";
import { formatBehindAhead, formatClock, formatMinutesLate, formatStageTime, formatTime } from "./format";

describe("renderer time formatting", () => {
  it("formats stage countdowns and overruns", () => {
    expect(formatStageTime(125_000)).toBe("2:05");
    expect(formatStageTime(3_605_000)).toBe("1:00:05");
    expect(formatStageTime(0)).toBe("+0:00");
    expect(formatStageTime(-65_000)).toBe("+1:05");
  });

  it("keeps the existing signed format for control calculations", () => {
    expect(formatTime(-65_000)).toBe("-01:05");
  });

  it("formats wall clocks and schedule differences", () => {
    expect(formatClock(new Date(2026, 0, 1, 9, 5).getTime())).toMatch(/9:05/);
    expect(formatBehindAhead(180_000)).toBe("3 min behind");
    expect(formatBehindAhead(-120_000)).toBe("2 min ahead");
    expect(formatBehindAhead(0)).toBe("On time");
    expect(formatMinutesLate(61_000)).toBe("1 minute");
  });
});
