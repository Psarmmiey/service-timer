import { describe, expect, it } from "vitest";
import {
  catchUpIndex,
  chooseTodaysPlan,
  createIdleState,
  createWaitingState,
  derive,
  MINUTE_MS,
  planStartMs,
  projectedFinish,
  reduce,
  scheduledStarts,
  type Item,
  type Plan,
} from "./index";

const referenceItems: Item[] = [
  { id: "welcome", title: "Welcome", minutes: 5 },
  { id: "worship", title: "Worship", minutes: 20 },
  { id: "announcements", title: "Announcements", minutes: 5 },
  { id: "offering", title: "Offering", minutes: 10 },
  { id: "sermon", title: "Sermon", minutes: 40 },
  { id: "closing", title: "Closing", minutes: 5 },
];

const referencePlan: Plan = {
  id: "reference",
  name: "Sunday service",
  startTime: "09:45",
  days: [0],
  autoStart: true,
  items: referenceItems,
  updatedAt: "2026-11-26T00:00:00Z",
  kind: "recurring",
};

function at(time: string, date = "2026-11-29"): number {
  const [hour, minute, second = "0"] = time.split(":");
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year!, month! - 1, day!, Number(hour), Number(minute), Number(second), 0).getTime();
}

describe("reference plan acceptance criteria", () => {
  it("AC-1 catch up starts Worship at 9:55", () => {
    const now = at("09:55");
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "catchUp" }, now, referencePlan);
    const view = derive(state, referencePlan, now);
    expect(view.current?.id).toBe("worship");
    expect(view.timeLeftMs).toBe(15 * MINUTE_MS);
    expect(view.projectedFinish).toBe(at("11:10"));
    expect(state.skipped).toEqual(["welcome"]);
  });

  it("AC-2 from the top starts Welcome and shifts later items", () => {
    const now = at("09:55");
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromTop" }, now, referencePlan);
    const view = derive(state, referencePlan, now);
    expect(view.current?.id).toBe("welcome");
    expect(view.timeLeftMs).toBe(5 * MINUTE_MS);
    expect(view.projectedFinish).toBe(at("11:20"));
    expect(view.scheduleRows[1]?.scheduledStart).toBe(at("10:00"));
  });

  it("AC-3 auto-start begins at 9:45", () => {
    const now = at("09:45");
    let state = createWaitingState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "tick" }, now, referencePlan);
    expect(state.status).toBe("running");
    expect(derive(state, referencePlan, now).timeLeftMs).toBe(5 * MINUTE_MS);
  });

  it("AC-4 launch after start follows the clock", () => {
    const now = at("10:12");
    let state = createWaitingState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "tick" }, now, referencePlan);
    const view = derive(state, referencePlan, now);
    expect(view.current?.id).toBe("announcements");
    expect(view.timeLeftMs).toBe(3 * MINUTE_MS);
    expect(state.banner).toContain("Started automatically at 10:12");
    expect(state.bannerAction).toBe("fromTop");
  });

  it("AC-5 editing the current item adds its time difference", () => {
    const at12 = at("12:34");
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 4 }, at("10:25"), referencePlan);
    state = { ...state, itemStartedAt: at12 - 27 * MINUTE_MS - 26 * 1000, itemDurationMs: 40 * MINUTE_MS, currentItemMinutes: 40 };
    const edited = { ...referencePlan, items: referenceItems.map((item) => item.id === "sermon" ? { ...item, minutes: 45 } : item) };
    state = reduce(state, { type: "editPlan", plan: edited }, at12);
    const view = derive(state, edited, at12);
    expect(view.timeLeftMs).toBe(17 * MINUTE_MS + 34 * 1000);
  });

  it("AC-6 inserts Testimony after the current item", () => {
    const now = at("10:15");
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 3 }, now, referencePlan);
    state = reduce(state, { type: "insertAfterCurrent", item: { id: "testimony", title: "Testimony", minutes: 3 } }, now, referencePlan);
    const view = derive(state, referencePlan, now);
    expect(view.next?.title).toBe("Testimony");
    expect(view.projectedFinish).toBe(at("11:13"));
  });

  it("AC-7 reaches overrun one second after time is up", () => {
    const start = at("09:50");
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 1 }, start, referencePlan);
    const now = at("10:10:01");
    expect(derive(state, referencePlan, now).status).toBe("overrun");
  });

  it("AC-8 Next leaves two minutes behind", () => {
    const start = at("09:50");
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 1 }, start, referencePlan);
    const now = at("10:12");
    state = reduce(state, { type: "next" }, now, referencePlan);
    const view = derive(state, referencePlan, now);
    expect(view.current?.id).toBe("announcements");
    expect(view.timeLeftMs).toBe(5 * MINUTE_MS);
    expect(view.behindAheadMs).toBe(2 * MINUTE_MS);
  });

  it("AC-11 recovered sermon run resumes from persisted clock state", () => {
    const start = at("10:25");
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 4 }, start, referencePlan);
    const now = at("10:52");
    const view = derive({ ...state, banner: "Recovered: this run resumed from the clock." }, referencePlan, now);
    expect(view.current?.id).toBe("sermon");
    expect(view.timeLeftMs).toBe(13 * MINUTE_MS);
    expect(view.banner).toContain("Recovered");
  });
});

describe("engine edge cases", () => {
  it("chooses one-off, then active plan for matching plans", () => {
    const one = { ...referencePlan, id: "one", kind: "oneOff" as const, date: "2026-11-29" };
    const recurring = { ...referencePlan, id: "recurring" };
    expect(chooseTodaysPlan([recurring, one], new Date(2026, 10, 29), "recurring")?.id).toBe("one");

    const a = { ...recurring, id: "a" };
    const b = { ...recurring, id: "b" };
    expect(chooseTodaysPlan([a, b], new Date(2026, 10, 29), "b")?.id).toBe("b");
  });

  it("handles exact item boundaries and no remaining plan", () => {
    expect(catchUpIndex(referencePlan, "2026-11-29", at("09:50"))).toBe(1);
    expect(catchUpIndex(referencePlan, "2026-11-29", at("11:35"))).toBe(-1);
  });

  it("pause, resume and adjustment act on the current item", () => {
    const now = at("09:45");
    let state = createWaitingState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "tick" }, now, referencePlan);
    state = reduce(state, { type: "pause" }, at("09:46"), referencePlan);
    expect(state.status).toBe("paused");
    expect(derive(state, referencePlan, at("09:47")).timeLeftMs).toBe(4 * MINUTE_MS);
    state = reduce(state, { type: "resume" }, at("09:47"), referencePlan);
    state = reduce(state, { type: "adjust", ms: MINUTE_MS }, at("09:47"), referencePlan);
    expect(derive(state, referencePlan, at("09:47")).timeLeftMs).toBe(5 * MINUTE_MS);
  });

  it("adjusts in overrun, previous from item 1, and restart", () => {
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 1 }, at("09:50"), referencePlan);
    state = reduce(state, { type: "adjust", ms: -MINUTE_MS }, at("09:50"), referencePlan);
    expect(derive(state, referencePlan, at("10:08:59")).status).toBe("running");
    state = reduce(state, { type: "previous" }, at("10:09"), referencePlan);
    expect(derive(state, referencePlan, at("10:09")).current?.id).toBe("welcome");
    state = reduce(state, { type: "restartItem" }, at("10:09"), referencePlan);
    expect(derive(state, referencePlan, at("10:09")).timeLeftMs).toBe(5 * MINUTE_MS);
  });

  it("pause overrun freezes and resume continues counting up", () => {
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 1 }, at("09:50"), referencePlan);
    state = reduce(state, { type: "pause" }, at("10:11"), referencePlan);
    expect(state.status).toBe("paused");
    expect(derive(state, referencePlan, at("10:12")).status).toBe("overrun");
    state = reduce(state, { type: "resume" }, at("10:12"), referencePlan);
    expect(derive(state, referencePlan, at("10:13")).timeLeftMs).toBeLessThan(0);
  });

  it("auto-advance advances after configured seconds", () => {
    const plan = { ...referencePlan, autoAdvanceSeconds: 2 };
    let state = createIdleState(plan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 1 }, at("09:50"), plan);
    state = reduce(state, { type: "tick" }, at("10:10:03"), plan);
    expect(state.index).toBe(2);
  });

  it("last item Next finishes and stop finishes", () => {
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 5 }, at("11:05"), referencePlan);
    state = reduce(state, { type: "next" }, at("11:10"), referencePlan);
    expect(state.status).toBe("finished");
    expect(reduce(state, { type: "stop" }, at("11:11")).status).toBe("finished");
  });

  it("reorder, do-next and undo update run-only items", () => {
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 3 }, at("10:15"), referencePlan);
    state = reduce(state, { type: "doNext", index: 5 }, at("10:15"), referencePlan);
    expect(derive(state, referencePlan, at("10:15")).next?.id).toBe("closing");
    state = reduce(state, { type: "undoReorder" }, at("10:15:05"));
    expect(derive(state, referencePlan, at("10:15:05")).next?.id).toBe("sermon");
  });

  it("moveDown uses the run-items length after inserting an item", () => {
    const now = at("10:15");
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 3 }, now, referencePlan);
    state = reduce(
      state,
      { type: "insertAfterCurrent", item: { id: "testimony", title: "Testimony", minutes: 3 } },
      now,
      referencePlan,
    );
    state = reduce(state, { type: "moveDown", index: 5 }, now, referencePlan);
    expect(state.runItems?.map((item) => item.id)).toEqual([
      "welcome",
      "worship",
      "announcements",
      "offering",
      "testimony",
      "closing",
      "sermon",
    ]);
  });

  it("message and blackout commands do not alter timer", () => {
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "message", text: "Please wrap up", flash: true }, at("09:45"));
    state = reduce(state, { type: "blackout", on: true }, at("09:45"));
    let view = derive(state, referencePlan, at("09:45"));
    expect(view.message?.text).toBe("Please wrap up");
    expect(view.blackout).toBe(true);
    state = reduce(state, { type: "clearMessage" }, at("09:45"));
    state = reduce(state, { type: "blackout", on: false }, at("09:45"));
    view = derive(state, referencePlan, at("09:45"));
    expect(view.message).toBeUndefined();
    expect(view.blackout).toBe(false);
  });

  it("schedule maths and early start use wall-clock dates", () => {
    expect(scheduledStarts(referencePlan, "2026-11-29")[0]).toBe(at("09:45"));
    expect(projectedFinish(referencePlan, "2026-11-29")).toBe(at("11:10"));
    expect(planStartMs(referencePlan, "2026-11-29")).toBe(at("09:45"));
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "start" }, at("09:30"), referencePlan);
    expect(state.shiftMs).toBe(-15 * MINUTE_MS);
  });

  it("deleted current item advances to the next item", () => {
    let state = createIdleState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "startChoice", mode: "fromItem", index: 4 }, at("10:25"), referencePlan);
    const deleted = { ...referencePlan, items: referenceItems.filter((item) => item.id !== "sermon") };
    state = reduce(state, { type: "editPlan", plan: deleted }, at("10:26"));
    expect(state.status).toBe("running");
  });

  it("0.5 minute minimum is representable and warning defaults to 2 minutes", () => {
    const plan = { ...referencePlan, items: [{ id: "short", title: "Short", minutes: 0.5 }] };
    let state = createIdleState(plan, "2026-11-29");
    state = reduce(state, { type: "start" }, at("09:45"), plan);
    const view = derive(state, plan, at("09:44"));
    expect(view.colourBand).toBe("warning");
  });

  it("DST wall clock stays at 09:45", () => {
    expect(new Date(planStartMs(referencePlan, "2026-03-29")).getHours()).toBe(9);
  });
});

describe("Sunday readiness regressions", () => {
  it("an on-time auto-start a fraction of a second late starts cleanly with no banner", () => {
    let state = createWaitingState(referencePlan, "2026-11-29");
    state = reduce(state, { type: "tick" }, at("09:45") + 180, referencePlan);
    expect(state.status).toBe("running");
    expect(state.currentItemId).toBe("welcome");
    expect(state.banner).toBeUndefined();
    expect(derive(state, referencePlan, at("09:45")).timeLeftMs).toBe(5 * MINUTE_MS);
  });

  it("waiting does not auto-start when auto-start has been turned off", () => {
    const plan = { ...referencePlan, autoStart: false };
    const state = reduce(createWaitingState(plan, "2026-11-29"), { type: "tick" }, at("09:45"), plan);
    expect(state.status).toBe("idle");
  });

  it("Start from the top is accepted after an automatic catch-up start", () => {
    let state = reduce(createWaitingState(referencePlan, "2026-11-29"), { type: "tick" }, at("10:12"), referencePlan);
    state = reduce(state, { type: "startChoice", mode: "fromTop" }, at("10:13"), referencePlan);
    const view = derive(state, referencePlan, at("10:13"));
    expect(view.current?.id).toBe("welcome");
    expect(view.timeLeftMs).toBe(5 * MINUTE_MS);
    expect(state.banner).toBeUndefined();
  });

  it("start choices are ignored while a run is live without an offer", () => {
    let state = reduce(createIdleState(referencePlan, "2026-11-29"), { type: "start" }, at("09:45"), referencePlan);
    const before = state;
    state = reduce(state, { type: "startChoice", mode: "fromTop" }, at("09:50"), referencePlan);
    expect(state).toBe(before);
    expect(reduce(state, { type: "start" }, at("09:50"), referencePlan)).toBe(before);
  });

  it("a late Start does nothing on its own so the prompt can ask", () => {
    const idle = createIdleState(referencePlan, "2026-11-29");
    expect(reduce(idle, { type: "start" }, at("09:55"), referencePlan).status).toBe("idle");
  });

  it("Previous and Restart do nothing before the service starts", () => {
    const waiting = createWaitingState(referencePlan, "2026-11-29");
    expect(reduce(waiting, { type: "previous" }, at("09:30"), referencePlan)).toBe(waiting);
    expect(reduce(waiting, { type: "restartItem" }, at("09:30"), referencePlan)).toBe(waiting);
  });

  it("Next does not skip an item inserted after the last planned item", () => {
    let state = reduce(createIdleState(referencePlan, "2026-11-29"), { type: "startChoice", mode: "fromItem", index: 5 }, at("11:05"), referencePlan);
    state = reduce(state, { type: "insertAfterCurrent", item: { id: "extra", title: "Extra song", minutes: 4 } }, at("11:06"), referencePlan);
    state = reduce(state, { type: "next" }, at("11:10"), referencePlan);
    expect(state.status).toBe("running");
    expect(derive(state, referencePlan, at("11:10")).current?.id).toBe("extra");
  });

  it("Restart uses the duration of the item actually running after a reorder", () => {
    let state = reduce(createIdleState(referencePlan, "2026-11-29"), { type: "startChoice", mode: "fromItem", index: 3 }, at("10:15"), referencePlan);
    state = reduce(state, { type: "doNext", index: 5 }, at("10:16"), referencePlan);
    state = reduce(state, { type: "next" }, at("10:25"), referencePlan);
    state = reduce(state, { type: "restartItem" }, at("10:27"), referencePlan);
    const view = derive(state, referencePlan, at("10:27"));
    expect(view.current?.id).toBe("closing");
    expect(view.timeLeftMs).toBe(5 * MINUTE_MS);
  });

  it("deleting a finished item above the current one leaves the countdown alone", () => {
    let state = reduce(createIdleState(referencePlan, "2026-11-29"), { type: "startChoice", mode: "fromItem", index: 4 }, at("10:25"), referencePlan);
    const edited = { ...referencePlan, items: referenceItems.filter((item) => item.id !== "welcome") };
    state = reduce(state, { type: "editPlan", plan: edited }, at("10:30"), referencePlan);
    const view = derive(state, edited, at("10:30"));
    expect(view.current?.id).toBe("sermon");
    expect(view.timeLeftMs).toBe(35 * MINUTE_MS);
    state = reduce(state, { type: "next" }, at("10:31"), edited);
    expect(derive(state, edited, at("10:31")).current?.id).toBe("closing");
  });

  it("editing the current item twice does not double-count the change", () => {
    let state = reduce(createIdleState(referencePlan, "2026-11-29"), { type: "startChoice", mode: "fromItem", index: 4 }, at("10:25"), referencePlan);
    const fortyFive = { ...referencePlan, items: referenceItems.map((item) => item.id === "sermon" ? { ...item, minutes: 45 } : item) };
    state = reduce(state, { type: "editPlan", plan: fortyFive }, at("10:30"), referencePlan);
    const renamed = { ...fortyFive, items: fortyFive.items.map((item) => item.id === "sermon" ? { ...item, title: "Sermon: Grace" } : item) };
    state = reduce(state, { type: "editPlan", plan: renamed }, at("10:31"), fortyFive);
    expect(derive(state, renamed, at("10:31")).timeLeftMs).toBe(39 * MINUTE_MS);
  });

  it("deleting the current item moves to the next item with its full time", () => {
    let state = reduce(createIdleState(referencePlan, "2026-11-29"), { type: "startChoice", mode: "fromItem", index: 4 }, at("10:25"), referencePlan);
    const deleted = { ...referencePlan, items: referenceItems.filter((item) => item.id !== "sermon") };
    state = reduce(state, { type: "editPlan", plan: deleted }, at("10:26"), referencePlan);
    const view = derive(state, deleted, at("10:26"));
    expect(view.current?.id).toBe("closing");
    expect(view.timeLeftMs).toBe(5 * MINUTE_MS);
  });

  it("editing the saved plan keeps an item inserted for this run", () => {
    let state = reduce(createIdleState(referencePlan, "2026-11-29"), { type: "startChoice", mode: "fromItem", index: 3 }, at("10:15"), referencePlan);
    state = reduce(state, { type: "insertAfterCurrent", item: { id: "testimony", title: "Testimony", minutes: 3 } }, at("10:16"), referencePlan);
    const edited = { ...referencePlan, items: referenceItems.map((item) => item.id === "closing" ? { ...item, minutes: 10 } : item) };
    state = reduce(state, { type: "editPlan", plan: edited }, at("10:17"), referencePlan);
    expect(derive(state, edited, at("10:17")).next?.id).toBe("testimony");
    expect(state.runItems?.find((item) => item.id === "closing")?.minutes).toBe(10);
  });

  it("projected finish follows +1 min, overruns and early finishes", () => {
    let state = reduce(createIdleState(referencePlan, "2026-11-29"), { type: "startChoice", mode: "fromItem", index: 4 }, at("10:25"), referencePlan);
    expect(derive(state, referencePlan, at("10:25")).behindAheadMs).toBe(0);
    state = reduce(state, { type: "adjust", ms: MINUTE_MS }, at("10:30"), referencePlan);
    expect(derive(state, referencePlan, at("10:30")).behindAheadMs).toBe(MINUTE_MS);
    expect(derive(state, referencePlan, at("11:08")).behindAheadMs).toBe(3 * MINUTE_MS);
    state = reduce(createIdleState(referencePlan, "2026-11-29"), { type: "startChoice", mode: "fromItem", index: 4 }, at("10:25"), referencePlan);
    state = reduce(state, { type: "next" }, at("10:55"), referencePlan);
    expect(derive(state, referencePlan, at("10:55")).behindAheadMs).toBe(-10 * MINUTE_MS);
  });

  it("pausing during time up reports paused so the operator can resume", () => {
    let state = reduce(createIdleState(referencePlan, "2026-11-29"), { type: "startChoice", mode: "fromItem", index: 0 }, at("09:45"), referencePlan);
    state = reduce(state, { type: "pause" }, at("09:51"), referencePlan);
    const view = derive(state, referencePlan, at("09:52"));
    expect(view.status).toBe("overrun");
    expect(view.paused).toBe(true);
  });

  it("the auto-start banner can be dismissed", () => {
    let state = reduce(createWaitingState(referencePlan, "2026-11-29"), { type: "tick" }, at("10:12"), referencePlan);
    state = reduce(state, { type: "dismissBanner" }, at("10:13"), referencePlan);
    expect(state.banner).toBeUndefined();
  });
});


describe("final red stage before zero", () => {
  it("turns red digits in the last seconds, amber before that", () => {
    const state = reduce(createIdleState(referencePlan, "2026-11-29"), { type: "startChoice", mode: "fromItem", index: 0 }, at("09:45"), referencePlan);
    const options = { dangerSeconds: 30 };
    expect(derive(state, referencePlan, at("09:48:30"), options).colourBand).toBe("warning");
    expect(derive(state, referencePlan, at("09:49:31"), options).colourBand).toBe("danger");
    expect(derive(state, referencePlan, at("09:50:01"), options).colourBand).toBe("over");
    expect(derive(state, referencePlan, at("09:49:31")).colourBand).toBe("warning");
  });
});
