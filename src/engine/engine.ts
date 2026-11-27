import { catchUpIndex, MINUTE_MS, planStartMs, projectedFinish, scheduledStarts } from "./schedule";
import type { DerivedView, Item, Plan, RunState } from "./types";

export type Command =
  | { type: "start" }
  | { type: "startChoice"; mode: "catchUp" | "fromTop" | "fromItem"; index?: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "next" }
  | { type: "previous" }
  | { type: "adjust"; ms: number }
  | { type: "restartItem" }
  | { type: "stop" }
  | { type: "editPlan"; plan: Plan }
  | { type: "insertAfterCurrent"; item: Item }
  | { type: "reorder"; fromIndex: number; toIndex: number }
  | { type: "moveUp"; index: number }
  | { type: "moveDown"; index: number }
  | { type: "doNext"; index: number }
  | { type: "undoReorder" }
  | { type: "message"; text: string; flash?: boolean }
  | { type: "clearMessage" }
  | { type: "blackout"; on: boolean }
  | { type: "dismissBanner" }
  | { type: "tick" };

/** A start within this window of the planned time counts as on time (FR-15, FR-18). */
export const ON_TIME_WINDOW_MS = 60_000;

export function createIdleState(plan: Plan, runDate: string): RunState {
  return {
    planId: plan.id,
    runDate,
    status: "idle",
    index: 0,
    timing: "item",
    shiftMs: 0,
    skipped: [],
    blackout: false,
  };
}

export function createWaitingState(plan: Plan, runDate: string): RunState {
  return { ...createIdleState(plan, runDate), status: "waiting" };
}

export function isLive(state: RunState): boolean {
  return state.status === "running" || state.status === "paused";
}

/** The items this run follows: run-only changes if any, otherwise the saved plan. */
function itemsFor(state: RunState, plan: Plan): Item[] {
  return state.runItems ?? plan.items;
}

/** Position of the current item, found by id so edits above it can't shift it. */
function locateCurrent(state: RunState, items: Item[]): number {
  if (state.currentItemId) {
    const found = items.findIndex((item) => item.id === state.currentItemId);
    if (found >= 0) return found;
  }
  return Math.min(state.index, items.length - 1);
}

function clockLabel(ms: number): string {
  const date = new Date(ms);
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Fresh run: clears anything left from an earlier run today. */
function freshRun(state: RunState): RunState {
  return {
    ...state,
    skipped: [],
    runItems: undefined,
    runOnlyIds: undefined,
    undoReorder: undefined,
    actualStarts: {},
    banner: undefined,
    bannerAction: undefined,
  };
}

function startItem(state: RunState, plan: Plan, index: number, now: number, timing: "item" | "clock"): RunState {
  const items = itemsFor(state, plan);
  const item = items[index];
  if (!item) return { ...state, status: "finished", pausedLeftMs: undefined };
  let left = item.minutes * MINUTE_MS;
  if (timing === "clock") {
    const starts = scheduledStarts({ ...plan, items }, state.runDate, state.shiftMs);
    left = starts[index]! + left - now;
  }
  return {
    ...state,
    status: "running",
    index,
    timing,
    currentItemId: item.id,
    currentItemMinutes: item.minutes,
    itemStartedAt: now,
    itemDurationMs: left,
    pausedLeftMs: undefined,
    actualStarts: { ...state.actualStarts, [item.id]: now },
    banner: undefined,
    bannerAction: undefined,
  };
}

function timeLeft(state: RunState, plan: Plan, now: number): number {
  return derive(state, plan, now).timeLeftMs;
}

export function reduce(state: RunState, command: Command, now: number, plan?: Plan): RunState {
  if (command.type === "tick") {
    if (state.status === "waiting" && plan) {
      if (!plan.autoStart) return { ...state, status: "idle" };
      const start = planStartMs(plan, state.runDate) + state.shiftMs;
      if (now < start) return state;
      if (now - start < ON_TIME_WINDOW_MS) return startItem(freshRun(state), plan, 0, now, "clock");
      const index = catchUpIndex(plan, state.runDate, now, state.shiftMs);
      if (index < 0) return { ...state, status: "idle" };
      const skipped = plan.items.slice(0, index).map((item) => item.id);
      const started = startItem({ ...freshRun(state), skipped }, plan, index, now, "clock");
      return {
        ...started,
        banner: `Started automatically at ${clockLabel(now)}, following the clock.`,
        bannerAction: "fromTop",
      };
    }
    if (state.status === "running" && plan?.autoAdvanceSeconds !== undefined) {
      const items = itemsFor(state, plan);
      const view = derive(state, plan, now);
      if (view.status === "overrun" && -view.timeLeftMs >= plan.autoAdvanceSeconds * 1000) {
        if (locateCurrent(state, items) < items.length - 1) return reduce(state, { type: "next" }, now, plan);
      }
    }
    return state;
  }

  if (command.type === "start") {
    if (!plan || isLive(state)) return state;
    const lateness = now - planStartMs(plan, state.runDate);
    // More than a minute late: the operator must choose in the late start prompt (FR-16).
    if (lateness > ON_TIME_WINDOW_MS) return state;
    const shiftMs = lateness < -ON_TIME_WINDOW_MS ? lateness : 0;
    return startItem({ ...freshRun(state), shiftMs }, plan, 0, now, "item");
  }

  if (command.type === "startChoice") {
    if (!plan) return state;
    // While live, only the "Start from the top instead" offer after an automatic catch-up is allowed.
    const fromTopOffer = command.mode === "fromTop" && state.bannerAction === "fromTop";
    if (isLive(state) && !fromTopOffer) return state;
    const fresh = freshRun(state);
    if (command.mode === "catchUp") {
      const index = catchUpIndex(plan, state.runDate, now, 0);
      if (index < 0) return { ...fresh, status: "idle", shiftMs: 0 };
      const skipped = plan.items.slice(0, index).map((item) => item.id);
      return startItem({ ...fresh, shiftMs: 0, skipped }, plan, index, now, "clock");
    }
    if (command.mode === "fromTop") {
      const shiftMs = Math.max(0, now - planStartMs(plan, state.runDate));
      return startItem({ ...fresh, shiftMs }, plan, 0, now, "item");
    }
    const index = command.index ?? 0;
    if (index < 0 || index >= plan.items.length) return state;
    const skipped = plan.items.slice(0, index).map((item) => item.id);
    return startItem({ ...fresh, shiftMs: 0, skipped }, plan, index, now, "item");
  }

  if (command.type === "pause") {
    if (state.status !== "running" || !plan) return state;
    return { ...state, status: "paused", pausedLeftMs: timeLeft(state, plan, now) };
  }

  if (command.type === "resume") {
    if (state.status !== "paused") return state;
    return {
      ...state,
      status: "running",
      timing: "item",
      itemStartedAt: now,
      itemDurationMs: state.pausedLeftMs,
      pausedLeftMs: undefined,
    };
  }

  if (command.type === "next") {
    if (!plan || !isLive(state)) return state;
    const items = itemsFor(state, plan);
    const index = locateCurrent(state, items);
    if (index >= items.length - 1) {
      return { ...state, status: "finished", pausedLeftMs: undefined, banner: undefined, bannerAction: undefined };
    }
    return startItem(state, plan, index + 1, now, "item");
  }

  if (command.type === "previous") {
    if (!plan || !(isLive(state) || state.status === "finished")) return state;
    const items = itemsFor(state, plan);
    if (!items.length) return state;
    const index = state.status === "finished" ? items.length - 1 : Math.max(0, locateCurrent(state, items) - 1);
    const id = items[index]!.id;
    return startItem({ ...state, skipped: state.skipped.filter((skippedId) => skippedId !== id) }, plan, index, now, "item");
  }

  if (command.type === "adjust") {
    if (!plan || !isLive(state)) return state;
    if (state.status === "paused") {
      return { ...state, pausedLeftMs: (state.pausedLeftMs ?? 0) + command.ms, timing: "item" };
    }
    return { ...state, timing: "item", itemStartedAt: now, itemDurationMs: timeLeft(state, plan, now) + command.ms };
  }

  if (command.type === "restartItem") {
    if (!plan || !isLive(state)) return state;
    const items = itemsFor(state, plan);
    const item = items[locateCurrent(state, items)];
    if (!item) return state;
    return {
      ...state,
      status: "running",
      timing: "item",
      itemStartedAt: now,
      itemDurationMs: item.minutes * MINUTE_MS,
      currentItemMinutes: item.minutes,
      pausedLeftMs: undefined,
    };
  }

  if (command.type === "stop") {
    return { ...state, status: "finished", pausedLeftMs: undefined, banner: undefined, bannerAction: undefined };
  }

  if (command.type === "editPlan") {
    return editPlan(state, command.plan, now, plan);
  }

  if (command.type === "insertAfterCurrent") {
    if (!plan || !isLive(state)) return state;
    const before = itemsFor(state, plan);
    const items = [...before];
    items.splice(locateCurrent(state, before) + 1, 0, command.item);
    return {
      ...state,
      runItems: items,
      runOnlyIds: [...(state.runOnlyIds ?? []), command.item.id],
      undoReorder: { items: before, expiresAt: now + 10_000 },
    };
  }

  if (command.type === "reorder" || command.type === "moveUp" || command.type === "moveDown" || command.type === "doNext") {
    if (!plan || !isLive(state)) return state;
    const currentItems = itemsFor(state, plan);
    const current = locateCurrent(state, currentItems);
    let fromIndex = "fromIndex" in command ? command.fromIndex : command.index;
    let toIndex = "toIndex" in command ? command.toIndex : fromIndex;
    if (command.type === "moveUp") toIndex = Math.max(current + 1, fromIndex - 1);
    if (command.type === "moveDown") toIndex = Math.min(currentItems.length - 1, fromIndex + 1);
    if (command.type === "doNext") {
      fromIndex = command.index;
      toIndex = current + 1;
    }
    // The current item is locked and finished items stay put (FR-14a).
    if (fromIndex <= current || toIndex <= current || fromIndex === toIndex) return state;
    if (fromIndex >= currentItems.length || toIndex >= currentItems.length) return state;
    const items = [...currentItems];
    const [moved] = items.splice(fromIndex, 1);
    if (!moved) return state;
    items.splice(toIndex, 0, moved);
    return { ...state, runItems: items, undoReorder: { items: currentItems, expiresAt: now + 10_000 } };
  }

  if (command.type === "undoReorder") {
    if (!state.undoReorder || now > state.undoReorder.expiresAt) return { ...state, undoReorder: undefined };
    return { ...state, runItems: state.undoReorder.items, undoReorder: undefined };
  }

  if (command.type === "message") {
    return { ...state, message: { text: command.text, flash: command.flash ?? false } };
  }
  if (command.type === "clearMessage") return { ...state, message: undefined };
  if (command.type === "blackout") return { ...state, blackout: command.on };
  if (command.type === "dismissBanner") return { ...state, banner: undefined, bannerAction: undefined };
  return state;
}

/**
 * Apply an edit of the saved plan to a live run (FR-13). The current item is tracked by id,
 * run-only inserts and reorders are kept, and the countdown never stops.
 */
function editPlan(state: RunState, newPlan: Plan, now: number, oldPlan?: Plan): RunState {
  if (!isLive(state)) {
    return { ...state, planId: newPlan.id, runItems: undefined, runOnlyIds: undefined, undoReorder: undefined };
  }

  let runItems: Item[] | undefined;
  if (state.runItems) {
    const byId = new Map(newPlan.items.map((item) => [item.id, item]));
    const runOnly = new Set(state.runOnlyIds ?? []);
    const merged: Item[] = [];
    for (const item of state.runItems) {
      const updated = byId.get(item.id);
      if (updated) merged.push(updated);
      else if (runOnly.has(item.id)) merged.push(item);
    }
    newPlan.items.forEach((item, index) => {
      if (merged.some((existing) => existing.id === item.id)) return;
      const previousId = newPlan.items[index - 1]?.id;
      const at = previousId ? merged.findIndex((existing) => existing.id === previousId) + 1 : 0;
      merged.splice(at, 0, item);
    });
    runItems = merged;
  }

  const items = runItems ?? newPlan.items;
  const base: RunState = { ...state, planId: newPlan.id, runItems, undoReorder: undefined };
  const index = state.currentItemId ? items.findIndex((item) => item.id === state.currentItemId) : -1;

  if (index < 0) {
    // The current item was deleted: move to the item now in its place, with its full time.
    if (!items.length) return { ...base, status: "finished", pausedLeftMs: undefined };
    return startItem(base, newPlan, Math.min(state.index, items.length - 1), now, "item");
  }

  const current = items[index]!;
  const oldMinutes = state.currentItemMinutes ?? current.minutes;
  const differenceMs = (current.minutes - oldMinutes) * MINUTE_MS;
  if (differenceMs === 0) return { ...base, index };
  if (state.status === "paused") {
    return { ...base, index, currentItemMinutes: current.minutes, pausedLeftMs: (state.pausedLeftMs ?? 0) + differenceMs };
  }
  const left = timeLeft(state, oldPlan ?? newPlan, now);
  return {
    ...base,
    index,
    currentItemMinutes: current.minutes,
    timing: "item",
    itemStartedAt: now,
    itemDurationMs: left + differenceMs,
  };
}

export function derive(state: RunState, plan: Plan, now: number): DerivedView {
  const items = itemsFor(state, plan);
  const effectivePlan = { ...plan, items };
  const live = isLive(state);
  const currentIndex = items.length ? locateCurrent(state, items) : -1;
  const starts = scheduledStarts(effectivePlan, state.runDate, state.shiftMs);
  const plannedFinish = projectedFinish(plan, state.runDate, 0);

  const scheduleRows = items.map((item, rowIndex) => ({
    index: rowIndex,
    item,
    scheduledStart: starts[rowIndex]!,
    actualStart: state.actualStarts?.[item.id],
    status: state.status === "finished" || rowIndex < currentIndex
      ? "done" as const
      : rowIndex === currentIndex && live ? "current" as const : "upcoming" as const,
  }));

  let status: DerivedView["status"] = state.status;
  let timeLeftMs = 0;
  const current = currentIndex >= 0 ? items[currentIndex] ?? null : null;
  const next = currentIndex >= 0 && currentIndex + 1 < items.length ? items[currentIndex + 1]! : null;

  if (live) {
    if (state.status === "paused") timeLeftMs = state.pausedLeftMs ?? state.itemDurationMs ?? 0;
    else if (state.timing === "clock") {
      timeLeftMs = starts[currentIndex]! + (current?.minutes ?? 0) * MINUTE_MS - now;
    } else {
      const duration = state.itemDurationMs ?? (current ? current.minutes * MINUTE_MS : 0);
      timeLeftMs = duration - (now - (state.itemStartedAt ?? now));
    }
    if (timeLeftMs <= 0) status = "overrun";
  }

  // Projected finish follows what is actually happening: time left on the current item
  // (or overrun so far) plus everything still to come.
  const remainingMs = items.slice(currentIndex + 1).reduce((sum, item) => sum + item.minutes * MINUTE_MS, 0);
  const finish = live
    ? now + Math.max(0, timeLeftMs) + remainingMs
    : projectedFinish(effectivePlan, state.runDate, state.shiftMs);

  const warnAt = (current?.warnAtSeconds ?? 120) * 1000;
  const colourBand =
    status === "overrun" ? "over" : live && timeLeftMs > 0 && timeLeftMs <= warnAt ? "warning" : "normal";

  return {
    status,
    paused: state.status === "paused",
    current,
    next,
    timeLeftMs,
    colourBand,
    scheduleRows,
    behindAheadMs: finish - plannedFinish,
    projectedFinish: finish,
    plannedFinish,
    message: state.message,
    blackout: state.blackout,
    banner: state.banner,
    bannerAction: state.bannerAction,
  };
}
