import type { AppState } from "../../shared/ipc";

/** Milliseconds until the whole-second digits change, counting down (positive) or up (overtime). */
export function msUntilNextSecond(ms: number): number {
  return ms > 0 ? (ms % 1000) + 10 : 1000 - (-ms % 1000) + 10;
}

/**
 * The main process sends state four times a second. Between updates, keep counting from the
 * moment it was sent, so each second flips on time (and at the same moment as on phones).
 */
export function projectState(state: AppState, nowMs = Date.now()): AppState {
  const elapsed = Math.max(0, nowMs - state.now);
  if (!elapsed) return state;
  const view = state.view;
  const counting = (view.status === "running" || view.status === "overrun") && !view.paused;
  if (!counting) return { ...state, now: state.now + elapsed };
  const timeLeftMs = view.timeLeftMs - elapsed;
  const overrun = view.status === "overrun" || timeLeftMs <= 0;
  return {
    ...state,
    now: state.now + elapsed,
    view: { ...view, timeLeftMs, status: overrun ? "overrun" : view.status, colourBand: overrun ? "over" : view.colourBand },
  };
}
