import type { AppState } from "../../shared/ipc";
import { formatClock, formatStageTime } from "./format";

type StageViewProps = {
  state: AppState | null;
  className?: string;
  preview?: boolean;
};

export function StageView({ state, className = "", preview = false }: StageViewProps) {
  if (!state) {
    return <div className={`stage-view ${className}`} aria-label="Stage preview">Loading…</div>;
  }

  const { view } = state;
  if (view.blackout) {
    return <div className={`stage-view ${className}`} data-blackout="true" aria-label="Stage is blacked out" />;
  }

  const overrun = view.status === "overrun";
  const waiting = view.status === "waiting" || view.status === "idle";
  const finished = view.status === "finished";
  const firstRow = view.scheduleRows[0];
  const waitingMs = firstRow ? Math.max(0, firstRow.scheduledStart - state.now) : 0;
  const digits = finished
    ? "—"
    : formatStageTime(waiting ? waitingMs : view.timeLeftMs);
  const title = finished
    ? "Service ended"
    : overrun
      ? "TIME UP"
      : waiting
        ? `${state.plan.name} starts in`
        : view.current?.title ?? "Service";
  const next = waiting
    ? firstRow
      ? `First: ${firstRow.item.title} · ${formatClock(firstRow.scheduledStart)}`
      : ""
    : overrun
      ? view.current?.title ?? "ITEM"
      : view.next
      ? `Next: ${view.next.title} (${view.next.minutes} min)`
      : finished
        ? "Thank you"
        : "Final item";

  return (
    <div
      className={`stage-view ${className}`}
      data-over={overrun}
      aria-label={preview ? "Stage preview" : "Stage display"}
    >
      <span className="stage-clock">{formatClock(state.now)}</span>
      {view.status === "paused" ? <span className="stage-paused">PAUSED</span> : null}
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
