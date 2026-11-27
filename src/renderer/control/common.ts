import type { Plan } from "../../engine";
import type { AppState, TimerCommand } from "../../shared/ipc";

export const MINUTE_MS = 60_000;
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function send(command: TimerCommand) {
  window.api.send(command);
}

function shortDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${date.toLocaleString("en-GB", { month: "short" })}`;
}

export function planWhenLabel(plan: Plan): string {
  if (plan.kind === "oneOff" && plan.date) {
    const [year, month, day] = plan.date.split("-").map(Number);
    return `${shortDate(new Date(year!, month! - 1, day!))} ${plan.startTime}`;
  }
  const days = [...plan.days].sort((a, b) => a - b).map((day) => DAY_NAMES[day]).join(", ");
  return `${days || "No days"} ${plan.startTime}`;
}

/** When a plan next runs, for the plan library (FR-12a). */
export function nextRunLabel(plan: Plan, now = new Date()): string {
  const [hour, minute] = plan.startTime.split(":").map(Number);
  if (plan.kind === "oneOff") {
    if (!plan.date) return "No date set";
    const [year, month, day] = plan.date.split("-").map(Number);
    const at = new Date(year!, month! - 1, day!, hour, minute);
    return at.getTime() + 3 * 60 * MINUTE_MS < now.getTime() ? "Date has passed" : `Next: ${shortDate(at)}, ${plan.startTime}`;
  }
  if (!plan.days.length) return "No days chosen";
  for (let offset = 0; offset < 8; offset += 1) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute);
    if (plan.days.includes(at.getDay()) && at.getTime() > now.getTime()) {
      return offset === 0 ? `Next: today, ${plan.startTime}` : `Next: ${shortDate(at)}, ${plan.startTime}`;
    }
  }
  return "";
}

export function plannedStartOf(state: AppState): number {
  return state.view.scheduleRows[0]?.scheduledStart ?? state.now;
}

/** More than a minute after the planned start, Start must go through the late start prompt (FR-16). */
export function isLateStart(state: AppState): boolean {
  return state.now - plannedStartOf(state) > 60_000;
}

export function isLiveView(state: AppState): boolean {
  return state.view.status === "running" || state.view.status === "overrun" || state.view.paused;
}
