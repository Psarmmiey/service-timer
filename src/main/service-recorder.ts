import { derive, isLive, planStartMs, type Command, type Item, type Plan, type RunState } from "../engine";
import type { RecordItem, ReportSource, ServiceRecord, StartMode } from "../shared/report";

export type Cause = { source: ReportSource; command?: Command };

const itemsOf = (state: RunState, plan: Plan): Item[] => state.runItems ?? plan.items;
const minutes = (ms: number) => `${Math.round(Math.abs(ms) / 60_000)} min`;

function startModeOf(cause: Cause, state: RunState): StartMode {
  const command = cause.command;
  if (command?.type === "startChoice") return command.mode === "catchUp" ? "catchUp" : command.mode === "fromTop" ? "fromTop" : "fromItem";
  if (command?.type === "start") return "onTime";
  return state.banner ? "catchUp" : "automatic";
}

function closeRun(item: RecordItem | undefined, now: number): RecordItem | undefined {
  if (!item) return item;
  const last = item.runs.at(-1);
  if (!last || last.to !== undefined) return item;
  return { ...item, runs: [...item.runs.slice(0, -1), { ...last, to: now }] };
}

/** Line the record up with today's items. New ones are "added on the day", except at the start. */
function syncItems(record: ServiceRecord, state: RunState, plan: Plan, atStart = false): RecordItem[] {
  const current = itemsOf(state, plan);
  const known = new Map(record.items.map((item) => [item.id, item]));
  const next: RecordItem[] = current.map((item) => known.get(item.id) ?? {
    id: item.id,
    title: item.title,
    plannedMinutes: item.minutes,
    runs: [],
    pausedMs: 0,
    adjustedMs: 0,
    ...(atStart ? {} : { addedOnTheDay: true }),
  });
  // Items taken out of today's order are kept in the report, marked as removed.
  for (const item of record.items) {
    if (!current.some((entry) => entry.id === item.id)) next.push(item.runs.length ? item : { ...item, removedOnTheDay: true });
  }
  return next.map((item) => (state.skipped.includes(item.id) && !item.runs.length ? { ...item, skipped: true } : item));
}

function titleOf(state: RunState, plan: Plan, index: number): string {
  return itemsOf(state, plan)[index]?.title ?? "an item";
}

/** Plain words for the timeline; never names. */
function describe(command: Command, before: RunState, after: RunState, plan: Plan, currentTitle: string): string | null {
  switch (command.type) {
    case "pause": return `Paused ${currentTitle}`;
    case "resume": return `Resumed ${currentTitle}`;
    case "adjust": return command.ms > 0 ? `Added ${minutes(command.ms)} to ${currentTitle}` : `Took ${minutes(command.ms)} off ${currentTitle}`;
    case "restartItem": return `Restarted ${currentTitle}`;
    case "doNext": return `Moved ${titleOf(before, plan, command.index)} to next`;
    case "startNow": return `Started ${titleOf(before, plan, command.index)} early`;
    case "moveUp":
    case "moveDown":
    case "reorder": return "Changed the running order";
    case "insertAfterCurrent": return `Added ${command.item.title} (${command.item.minutes} min)`;
    case "removeUpcoming": return `Removed ${titleOf(before, plan, command.index)} for today`;
    case "setRunItemMinutes": return `Changed ${titleOf(before, plan, command.index)} to ${command.minutes} min`;
    case "undoReorder": return "Undid a running order change";
    case "blackout": return after.blackout === before.blackout ? null : after.blackout ? "Blacked out the stage" : "Brought the stage back";
    default: return null;
  }
}

/**
 * Update the record for the current service after any change to the run. Returns the same
 * object when nothing worth recording happened, so the caller only saves real changes.
 */
export function observe(record: ServiceRecord | null, before: RunState, after: RunState, plan: Plan, now: number, cause: Cause): ServiceRecord | null {
  const wasLive = isLive(before);
  const live = isLive(after);

  // A new service starts.
  if (!wasLive && live) {
    const view = derive(after, plan, now);
    const startedAt = after.itemStartedAt ?? now;
    const fresh: ServiceRecord = {
      version: 1,
      id: `${after.runDate}-${plan.id}-${startedAt}`,
      planId: plan.id,
      planName: plan.name,
      runDate: after.runDate,
      plannedStart: planStartMs(plan, after.runDate),
      plannedFinish: view.plannedFinish,
      startedAt,
      startMode: startModeOf(cause, after),
      items: [],
      timeline: [],
    };
    const items = syncItems(fresh, after, plan, true).map((item) => (item.id === after.currentItemId ? { ...item, runs: [{ from: startedAt }] } : item));
    const currentTitle = items.find((item) => item.id === after.currentItemId)?.title ?? "";
    return { ...fresh, items, timeline: [{ at: startedAt, text: `Service started with ${currentTitle}`, by: cause.source }] };
  }
  if (!record) return record;

  let next = record;
  const currentTitle = record.items.find((item) => item.id === before.currentItemId)?.title ?? "the item";
  const note = (text: string) => {
    next = { ...next, timeline: [...next.timeline, { at: now, text, by: cause.source }] };
  };

  // The order or items for today changed.
  if (after.runItems !== before.runItems || after.skipped !== before.skipped) next = { ...next, items: syncItems(next, after, plan) };

  // Time added or taken off belongs to the item running at the time.
  if (cause.command?.type === "adjust" && after !== before && before.currentItemId) {
    const ms = cause.command.ms;
    next = { ...next, items: next.items.map((item) => (item.id === before.currentItemId ? { ...item, adjustedMs: item.adjustedMs + ms } : item)) };
  }

  // Pauses.
  const pausedBefore = before.status === "paused";
  const pausedAfter = after.status === "paused";
  if (!pausedBefore && pausedAfter) next = { ...next, pausedSince: now };
  if (pausedBefore && !pausedAfter && next.pausedSince !== undefined) {
    const pausedMs = now - next.pausedSince;
    next = { ...next, pausedSince: undefined, items: next.items.map((item) => (item.id === before.currentItemId ? { ...item, pausedMs: item.pausedMs + pausedMs } : item)) };
  }

  // A different item, or the same one restarted: close the old stretch and open a new one.
  const restarted = cause.command?.type === "restartItem" && after !== before;
  if (live && (after.currentItemId !== before.currentItemId || restarted)) {
    next = {
      ...next,
      items: next.items.map((item) => {
        let updated = item.id === before.currentItemId ? closeRun(item, now)! : item;
        if (item.id === after.currentItemId) updated = { ...updated, skipped: false, runs: [...updated.runs, { from: now }] };
        return updated;
      }),
    };
    const title = next.items.find((item) => item.id === after.currentItemId)?.title;
    if (cause.command?.type === "previous") note(`Went back to ${title}`);
    else if (!restarted && cause.source === "timer" && after.currentItemId !== before.currentItemId) note(`Moved on to ${title} automatically`);
  }

  if (cause.command) {
    const text = describe(cause.command, before, after, plan, currentTitle);
    if (text && after !== before) note(text);
  }
  if (after.message?.text !== before.message?.text && after.message) note(`Message: ${after.message.text}${after.message.auto ? " (automatic)" : ""}`);

  // The service ends.
  if (wasLive && !live) {
    const pausedMs = next.pausedSince !== undefined ? now - next.pausedSince : 0;
    next = {
      ...next,
      endedAt: now,
      ending: cause.command?.type === "stop" ? "stopped" : "finished",
      pausedSince: undefined,
      items: next.items.map((item) => {
        const closed = closeRun(item, now)!;
        return item.id === before.currentItemId && pausedMs ? { ...closed, pausedMs: closed.pausedMs + pausedMs } : closed;
      }),
    };
    note(cause.command?.type === "stop" ? "Service stopped" : "Service finished");
  }

  return next;
}
