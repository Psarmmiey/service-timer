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
  | { type: "tick" };

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

function startItem(state: RunState, plan: Plan, index: number, now: number, timing: "item" | "clock") {
  const items = state.runItems ?? plan.items;
  const item = items[index];
  const effectivePlan = state.runItems ? { ...plan, items: state.runItems } : plan;
  if (!item) return { ...state, status: "finished" as const };
  let left = item.minutes * MINUTE_MS;
  if (timing === "clock") {
    const starts = scheduledStarts(effectivePlan, state.runDate, state.shiftMs);
    left = starts[index]! + left - now;
  }
  return {
    ...state,
    status: "running" as const,
    index,
    timing,
    currentItemId: item.id,
    currentItemMinutes: item.minutes,
    itemStartedAt: now,
    itemDurationMs: left,
    pausedLeftMs: undefined,
    actualStarts: { ...state.actualStarts, [item.id]: now },
  };
}

export function reduce(state: RunState, command: Command, now: number, plan?: Plan): RunState {
  if (command.type === "tick") {
    if (state.status === "waiting" && plan) {
      const start = planStartMs(plan, state.runDate) + state.shiftMs;
      if (now >= start) {
        if (now - start === 0) return startItem(state, plan, 0, now, "clock");
        const index = catchUpIndex(plan, state.runDate, now, state.shiftMs);
        if (index < 0) return { ...state, status: "idle" };
        const skipped = plan.items.slice(0, index).map((item) => item.id);
        const started = startItem({ ...state, skipped }, plan, index, now, "clock");
        return { ...started, banner: "Started automatically following the clock. Start from the top instead" };
      }
    }
    if (state.status === "running" && plan?.autoAdvanceSeconds !== undefined) {
      const view = derive(state, plan, now);
      if (view.status === "overrun" && -view.timeLeftMs >= plan.autoAdvanceSeconds * 1000) {
        if (state.index < plan.items.length - 1) return reduce({ ...state, status: "running" }, { type: "next" }, now, plan);
      }
    }
    return state;
  }

  if (command.type === "start") {
    if (!plan) return state;
    const start = planStartMs(plan, state.runDate);
    const lateness = now - start;
    if (lateness > 60_000) return state;
    if (lateness < -60_000) {
      return startItem({ ...state, shiftMs: lateness, timing: "item" }, plan, 0, now, "item");
    }
    return startItem(state, plan, 0, now, "item");
  }

  if (command.type === "startChoice") {
    if (!plan) return state;
    if (command.mode === "catchUp") {
      const index = catchUpIndex(plan, state.runDate, now, state.shiftMs);
      if (index < 0) return { ...state, status: "idle" };
      const skipped = plan.items.slice(0, index).map((item) => item.id);
      return startItem({ ...state, skipped }, plan, index, now, "clock");
    }
    if (command.mode === "fromTop") {
      const start = planStartMs(plan, state.runDate);
      const shift = Math.max(0, now - start);
      return startItem({ ...state, shiftMs: shift, skipped: [] }, plan, 0, now, "item");
    }
    if (command.mode === "fromItem") {
      const index = command.index ?? 0;
      if (index < 0 || index >= plan.items.length) return state;
      return startItem({ ...state, skipped: plan.items.slice(0, index).map((item) => item.id) }, plan, index, now, "item");
    }
  }

  if (command.type === "pause") {
    if (state.status !== "running" || !plan) return state;
    const left = derive(state, plan, now).timeLeftMs;
    return { ...state, status: "paused", pausedLeftMs: left };
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
    if (!plan || (state.status !== "running" && state.status !== "paused")) return state;
    if (state.index >= plan.items.length - 1) return { ...state, status: "finished" };
    let shiftMs = state.shiftMs;
    if (plan.items[state.index]) {
      const view = derive(state, plan, now);
      if (view.status === "overrun") shiftMs += -view.timeLeftMs;
    }
    const nextState = { ...state, index: state.index + 1, shiftMs };
    return startItem(nextState, plan, nextState.index, now, "item");
  }

  if (command.type === "previous") {
    if (!plan) return state;
    const index = state.index > 0 ? state.index - 1 : 0;
    return startItem({ ...state, skipped: [] }, plan, index, now, "item");
  }

  if (command.type === "adjust") {
    if (!plan || (state.status !== "running" && state.status !== "paused")) return state;
    if (state.status === "paused") {
      return { ...state, pausedLeftMs: Math.max(-365 * 24 * 60 * MINUTE_MS, (state.pausedLeftMs ?? 0) + command.ms), timing: "item" };
    }
    const view = derive(state, plan, now);
    const duration = view.timeLeftMs + command.ms;
    return { ...state, timing: "item", itemStartedAt: now, itemDurationMs: duration };
  }

  if (command.type === "restartItem") {
    if (!plan) return state;
    const item = plan.items[state.index];
    if (!item) return state;
    return {
      ...state,
      status: "running",
      timing: "item",
      itemStartedAt: now,
      itemDurationMs: item.minutes * MINUTE_MS,
      pausedLeftMs: undefined,
    };
  }

  if (command.type === "stop") {
    return { ...state, status: "finished", pausedLeftMs: undefined };
  }

  if (command.type === "editPlan") {
    const oldIndex = state.index;
    const items = command.plan.items;
    if (state.status !== "idle" && state.status !== "waiting" && state.status !== "finished") {
      const currentItem = items[oldIndex];
      if (!currentItem) {
        const nextIndex = Math.min(oldIndex, items.length - 1);
        if (nextIndex < 0) return { ...state, status: "finished" };
        return startItem({ ...state, index: nextIndex, planId: command.plan.id }, command.plan, nextIndex, now, "item");
      }
      if (state.index === oldIndex) {
        const oldView = derive(state, { ...command.plan, items: state.runItems ?? command.plan.items }, now);
        const oldDuration = oldView.timeLeftMs;
        const effectiveOldItem = (state.runItems ?? command.plan.items)[oldIndex];
        const oldMinutes = state.currentItemMinutes ?? effectiveOldItem?.minutes ?? currentItem.minutes;
        const difference = (currentItem.minutes - oldMinutes) * MINUTE_MS;
        const duration = oldDuration + difference;
        return {
          ...state,
          planId: command.plan.id,
          runItems: undefined,
          timing: "item",
          itemDurationMs: duration,
          itemStartedAt: now,
        };
      }
    }
    return { ...state, planId: command.plan.id, runItems: undefined };
  }

  if (command.type === "insertAfterCurrent") {
    if (!plan || state.status === "idle" || state.status === "waiting" || state.status === "finished") return state;
    const items = [...(state.runItems ?? plan.items)];
    items.splice(state.index + 1, 0, command.item);
    return { ...state, runItems: items, undoReorder: { items: state.runItems ?? plan.items, expiresAt: now + 10_000 } };
  }

  if (command.type === "reorder" || command.type === "moveUp" || command.type === "moveDown" || command.type === "doNext") {
    if (!plan || state.status === "idle" || state.status === "waiting" || state.status === "finished") return state;
    let fromIndex = "fromIndex" in command ? command.fromIndex : command.index;
    let toIndex = "toIndex" in command ? command.toIndex : fromIndex;
    if (command.type === "moveUp") toIndex = Math.max(state.index + 1, fromIndex - 1);
    if (command.type === "moveDown") {
      const currentItems = state.runItems ?? plan.items;
      toIndex = Math.min(currentItems.length - 1, fromIndex + 1);
    }
    if (command.type === "doNext") {
      fromIndex = command.index;
      toIndex = state.index + 1;
    }
    if (fromIndex <= state.index || toIndex <= state.index || fromIndex === toIndex) return state;
    const currentItems = state.runItems ?? plan.items;
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
  return state;
}

export function derive(state: RunState, plan: Plan, now: number): DerivedView {
  const effectivePlan = state.runItems ? { ...plan, items: state.runItems } : plan;
  const effectiveIndex = state.currentItemId
    ? effectivePlan.items.findIndex((item) => item.id === state.currentItemId)
    : state.index;
  const currentIndex = effectiveIndex >= 0 ? effectiveIndex : state.index;
  const starts = scheduledStarts(effectivePlan, state.runDate, state.shiftMs);
  const totalFinish = projectedFinish(effectivePlan, state.runDate, state.shiftMs);
  const baselineFinish = projectedFinish(effectivePlan, state.runDate, 0);
  const scheduleRows = effectivePlan.items.map((item, rowIndex) => ({
    index: rowIndex,
    item,
    scheduledStart: starts[rowIndex]!,
    actualStart: state.actualStarts?.[item.id],
    status: rowIndex < currentIndex ? "done" as const : rowIndex === currentIndex ? "current" as const : "upcoming" as const,
  }));

  let status: DerivedView["status"] = state.status;
  let timeLeftMs = 0;
  const current = effectivePlan.items[currentIndex] ?? null;
  const next = currentIndex + 1 < effectivePlan.items.length ? effectivePlan.items[currentIndex + 1]! : null;

  if (state.status === "running" || state.status === "paused") {
    if (state.status === "paused") timeLeftMs = state.pausedLeftMs ?? state.itemDurationMs ?? 0;
    else if (state.timing === "clock") {
      const end = starts[currentIndex]! + (current?.minutes ?? 0) * MINUTE_MS;
      timeLeftMs = end - now;
    } else {
      const duration = state.itemDurationMs ?? (current ? current.minutes * MINUTE_MS : 0);
      timeLeftMs = duration - (now - (state.itemStartedAt ?? now));
    }
  }

  if (state.status === "running" && timeLeftMs <= 0) status = "overrun";
  if (state.status === "paused" && (state.pausedLeftMs ?? 0) <= 0) status = "overrun";

  const warnAt = (current?.warnAtSeconds ?? 120) * 1000;
  const colourBand =
    status === "overrun" ? "over" : timeLeftMs > 0 && timeLeftMs <= warnAt ? "warning" : "normal";

  return {
    status,
    current,
    next,
    timeLeftMs,
    colourBand,
    scheduleRows,
    behindAheadMs: totalFinish - baselineFinish,
    projectedFinish: totalFinish,
    message: state.message,
    blackout: state.blackout,
    banner: state.banner,
  };
}
