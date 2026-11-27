import { describe, expect, it } from "vitest";
import { chooseStagePlacement, type DisplayInfo } from "./display-selection";

const primary: DisplayInfo = {
  id: 1,
  isPrimary: true,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
};

const secondary: DisplayInfo = {
  id: 2,
  isPrimary: false,
  bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
};

describe("chooseStagePlacement", () => {
  it("uses saved display id when present", () => {
    const placement = chooseStagePlacement([primary, secondary], secondary.id);
    expect(placement.mode).toBe("stage-window");
    expect(placement.activeDisplayId).toBe(secondary.id);
    expect(placement.bounds).toEqual(secondary.bounds);
  });

  it("defaults to first non-primary display", () => {
    const placement = chooseStagePlacement([primary, secondary]);
    expect(placement.mode).toBe("stage-window");
    expect(placement.activeDisplayId).toBe(secondary.id);
  });

  it("falls back to single-monitor mode when one logical display exists", () => {
    const placement = chooseStagePlacement([primary], secondary.id);
    expect(placement.mode).toBe("single-monitor");
    expect(placement.preferredDisplayId).toBe(secondary.id);
    expect(placement.bounds).toBeUndefined();
  });

  it("returns to saved display when it reappears", () => {
    const unplugged = chooseStagePlacement([primary], secondary.id);
    expect(unplugged.mode).toBe("single-monitor");

    const returned = chooseStagePlacement([primary, secondary], unplugged.preferredDisplayId);
    expect(returned.mode).toBe("stage-window");
    expect(returned.activeDisplayId).toBe(secondary.id);
  });

  it("preserves a missing preferred display when another secondary remains", () => {
    const third: DisplayInfo = {
      id: 3,
      isPrimary: false,
      bounds: { x: 3840, y: 0, width: 1920, height: 1080 },
    };

    const fallback = chooseStagePlacement([primary, third], secondary.id);
    expect(fallback.mode).toBe("stage-window");
    expect(fallback.activeDisplayId).toBe(third.id);
    expect(fallback.preferredDisplayId).toBe(secondary.id);

    const returned = chooseStagePlacement([primary, secondary, third], fallback.preferredDisplayId);
    expect(returned.mode).toBe("stage-window");
    expect(returned.activeDisplayId).toBe(secondary.id);
  });
});
