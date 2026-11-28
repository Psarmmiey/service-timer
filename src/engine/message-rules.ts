import { derive, isLive } from "./engine";
import type { Plan, RunState } from "./types";

export type MessageRules = {
  /** Show a message when this many seconds are left on an item; 0 turns it off. */
  wrapUpAtSeconds: number;
  wrapUpText: string;
  /** Clear the stage message whenever the timer moves to another item. */
  clearOnItemChange: boolean;
};

const itemKey = (state: RunState): string | null => (isLive(state) ? state.currentItemId ?? `#${state.index}` : null);

/**
 * Stage message rules applied after every change to the run (a command, a phone, or the clock):
 * clear the message on a new item, and show "Please wrap up" near the end of each item.
 */
export function applyMessageRules(previous: RunState, next: RunState, plan: Plan, now: number, rules: MessageRules): RunState {
  let state = next;
  const before = itemKey(previous);
  const after = itemKey(state);

  // Moving to another item (Next, automatic advance, Start now, Previous) starts with a clean stage.
  if (rules.clearOnItemChange && before && after && before !== after && state.message) {
    state = { ...state, message: undefined };
  }

  const atMs = Math.max(0, rules.wrapUpAtSeconds) * 1000;
  const text = rules.wrapUpText.trim();
  if (!after || !atMs || !text) return state;

  const view = derive(state, plan, now);
  const left = view.timeLeftMs;
  const itemMs = (view.current?.minutes ?? 0) * 60_000;

  if (left > atMs) {
    // Time was added (or the item restarted): take an automatic message away and show it again later.
    if (state.message?.auto) state = { ...state, message: undefined };
    if (state.wrapUpShownFor === after) state = { ...state, wrapUpShownFor: undefined };
    return state;
  }

  const due = state.status === "running" && left > 0 && itemMs > atMs && state.wrapUpShownFor !== after;
  // Never cover a message someone has put up.
  if (due && !state.message) {
    state = { ...state, message: { text, flash: false, auto: true }, wrapUpShownFor: after };
  } else if (due) {
    state = { ...state, wrapUpShownFor: after };
  }
  return state;
}
