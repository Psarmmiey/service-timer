import type { Plan } from "./types";

export const MINUTE_MS = 60_000;

export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDateTime(date: string, time: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    throw new Error("Invalid date or time");
  }
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

export function planStartMs(plan: Plan, runDate: string): number {
  return parseLocalDateTime(runDate, plan.startTime);
}

export function scheduledStarts(plan: Plan, runDate: string, shiftMs = 0): number[] {
  let start = planStartMs(plan, runDate) + shiftMs;
  return plan.items.map((item) => {
    const scheduled = start;
    start += item.minutes * MINUTE_MS;
    return scheduled;
  });
}

export function projectedFinish(plan: Plan, runDate: string, shiftMs = 0): number {
  const start = planStartMs(plan, runDate);
  const durations = plan.items.reduce((sum, item) => sum + item.minutes * MINUTE_MS, 0);
  return start + durations + shiftMs;
}

export function catchUpIndex(
  plan: Plan,
  runDate: string,
  now: number,
  shiftMs = 0,
): number {
  if (now >= projectedFinish(plan, runDate, shiftMs)) return -1;
  const starts = scheduledStarts(plan, runDate, shiftMs);
  for (let index = 0; index < plan.items.length; index += 1) {
    const start = starts[index]!;
    const end = start + plan.items[index]!.minutes * MINUTE_MS;
    if (now >= start && (now < end || index === plan.items.length - 1)) return index;
  }
  return -1;
}

export function chooseTodaysPlan(plans: Plan[], now: Date, activePlanId?: string): Plan | undefined {
  const date = localDateString(now);
  const oneOff = plans.filter((plan) => plan.kind === "oneOff" && plan.date === date);
  if (oneOff.length) {
    if (oneOff.length === 1) return oneOff[0];
    return oneOff.find((plan) => plan.id === activePlanId) ?? oneOff[0];
  }

  const recurring = plans.filter(
    (plan) => plan.kind === "recurring" && plan.days.includes(now.getDay()),
  );
  if (recurring.length === 1) return recurring[0];
  if (recurring.length > 1) {
    return recurring.find((plan) => plan.id === activePlanId) ?? recurring[0];
  }
  return undefined;
}
