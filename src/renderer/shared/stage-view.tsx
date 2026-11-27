import type { AppState } from "../../shared/ipc";
import { formatClock, formatStageTime } from "./format";

type StageViewProps = {
  state: AppState | null;
  className?: string;
  preview?: boolean;
};

export function StageView({ state, className = "", preview = false }: StageViewProps) {
  if (!state) {
    return (
      <div
        className={`stage-view ${className}`}
        aria-label={preview ? "Stage preview" : "Stage display"}
      >
        Loading…
      </div>
    );
  }

  const { view } = state;
  if (view.blackout) {
    return <div className={`stage-view ${className}`} data-blackout="true" aria-label="Stage is blacked out" />;
  }

  const overrun = view.status === "overrun";
  const finished = view.status === "finished";
  const firstRow = view.scheduleRows[0];
  const untilStartMs = firstRow ? firstRow.scheduledStart - state.now : 0;
  // Countdown to the start only when auto-start is armed and within 30 minutes (FR-18).
  const countdown = view.status === "waiting" && untilStartMs > 0 && untilStartMs <= 30 * 60_000;
  // Otherwise, before or after the service, the stage shows the clock (Idle and Finished states).
  const clockOnly = !countdown && (view.status === "waiting" || view.status === "idle" || finished);
  const beforeStart = untilStartMs > 0;
  const digits = countdown
    ? formatStageTime(untilStartMs)
    : clockOnly
      ? formatClock(state.now)
      : formatStageTime(view.timeLeftMs);
  const title = finished
    ? "Service ended"
    : overrun
      ? `TIME UP · ${view.current?.title.toUpperCase() ?? "ITEM"}`
      : countdown
        ? `${state.plan.name} starts in`
        : clockOnly
          ? beforeStart && firstRow ? `${state.plan.name} starts at ${formatClock(firstRow.scheduledStart)}` : state.plan.name
          : view.current?.title ?? "Service";
  const next = countdown || (clockOnly && beforeStart)
    ? firstRow
      ? `First: ${firstRow.item.title} · ${formatClock(firstRow.scheduledStart)}`
      : ""
    : clockOnly || overrun
      ? ""
      : view.next
        ? `Next: ${view.next.title} (${view.next.minutes} min)`
        : "Final item";

  return (
    <div
      className={`stage-view ${className}`}
      data-over={overrun}
      data-time-up-style={state.settings.timeUpStyle}
      data-pulse={state.settings.pulse}
      aria-label={preview ? "Stage preview" : "Stage display"}
    >
      {clockOnly ? null : <span className="stage-clock">{formatClock(state.now)}</span>}
      {view.paused ? <span className="stage-paused">PAUSED</span> : null}
      <div className="stage-title" data-over={overrun}>{title}</div>
      <div
        className="stage-digits condensed"
        data-warning={view.colourBand === "warning"}
        data-long={digits.length > 5}
      >
        {digits}
      </div>
      {next ? <div className="stage-next">{next}</div> : null}
      {view.message ? (
        <div className="stage-message" data-flash={view.message.flash}>{view.message.text}</div>
      ) : null}
    </div>
  );
}
