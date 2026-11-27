export function formatTime(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Countdown for the stage. Overtime shows as +1:30 (default) or -1:30. */
export function formatStageTime(ms: number, overtimeSign: "plus" | "minus" = "plus"): string {
  const overrun = ms <= 0;
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const value = hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
  return overrun ? `${overtimeSign === "minus" ? "-" : "+"}${value}` : value;
}

export function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

export function formatBehindAhead(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  if (minutes === 0) return "On time";
  return `${minutes} min ${ms > 0 ? "behind" : "ahead"}`;
}

export function formatMinutesLate(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
