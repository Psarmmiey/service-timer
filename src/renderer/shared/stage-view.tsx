import { useLayoutEffect, useRef, useState } from "react";
import type { AppState } from "../../shared/ipc";
import { formatClock, formatStageTime } from "./format";

type StageViewProps = {
  state: AppState | null;
  className?: string;
  preview?: boolean;
};

/**
 * Fit a single line of digits into its box: as large as possible, never wider than
 * 94% or taller than the box. Only re-measures when the shape of the text changes
 * (e.g. 9:59 to 10:00), not every second, so the size doesn't jitter.
 */
/** Digits are squeezed horizontally a little, so wide times like 12:26 can be taller. */
const SQUEEZE = 0.86;

function useFitText(text: string, styleKey: string) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<number | null>(null);
  const shape = text.replace(/\d/g, "0");

  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;
    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      const width = measure.offsetWidth * SQUEEZE;
      const height = measure.offsetHeight;
      const boxWidth = box.clientWidth;
      const boxHeight = box.clientHeight;
      if (!width || !height || !boxWidth || !boxHeight) return;
      const next = Math.max(8, Math.floor(100 * Math.min((boxWidth * 0.94) / width, boxHeight / height)));
      setSize((previous) => (previous === next ? previous : next));
      // Lets tests (and anything else) know the digits have been fitted to this box size.
      box.dataset.fitted = `${boxWidth}x${boxHeight}`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    void document.fonts?.ready.then(fit);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [shape, styleKey]);

  return { boxRef, measureRef, size, shape };
}

export function StageView({ state, className = "", preview = false }: StageViewProps) {
  const label = preview ? "Stage preview" : "Stage display";
  const view = state?.view;
  const overrun = view?.status === "overrun";
  const finished = view?.status === "finished";
  const firstRow = view?.scheduleRows[0];
  const untilStartMs = state && firstRow ? firstRow.scheduledStart - state.now : 0;
  // Countdown to the start only when auto-start is armed and within 30 minutes (FR-18).
  const countdown = view?.status === "waiting" && untilStartMs > 0 && untilStartMs <= 30 * 60_000;
  // Otherwise, before or after the service, the stage shows the clock (Idle and Finished).
  const clockOnly = Boolean(view) && !countdown && (view!.status === "waiting" || view!.status === "idle" || finished);
  const digits = !state || !view
    ? ""
    : countdown
      ? formatStageTime(untilStartMs, state.settings.overtimeSign)
      : clockOnly
        ? formatClock(state.now)
        : formatStageTime(view.timeLeftMs, state.settings.overtimeSign);
  // Anything that changes the space around the digits refits them before the next paint.
  const fit = useFitText(digits, `${overrun}|${view?.paused}|${view?.message?.text.length ?? -1}|${view?.blackout}`);

  if (!state || !view) {
    return <div className={`stage-view ${className}`} aria-label={label}>Loading…</div>;
  }

  if (view.blackout) {
    return <div className={`stage-view ${className}`} data-blackout="true" aria-label={preview ? "Stage preview, blacked out" : "Stage is blacked out"} />;
  }

  const beforeStart = untilStartMs > 0;
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
      data-message={Boolean(view.message)}
      data-time-up-style={state.settings.timeUpStyle}
      data-pulse={state.settings.pulse}
      data-flash-zero={state.settings.flashAtZero !== false}
      aria-label={label}
    >
      {clockOnly ? null : <span className="stage-clock">{formatClock(state.now)}</span>}
      <div className="stage-top">
        <div className="stage-title" data-over={overrun} title={title}>{title}</div>
      </div>
      {view.paused ? <div className="stage-paused">PAUSED</div> : null}
      <div className="stage-digits-box" ref={fit.boxRef}>
        <span className="stage-measure condensed" ref={fit.measureRef} aria-hidden="true">{fit.shape}</span>
        <div
          className="stage-digits condensed"
          data-warning={view.colourBand === "warning"}
          data-danger={view.colourBand === "danger"}
          data-paused={view.paused}
          data-clock={clockOnly}
          data-long={digits.length > 5}
          style={{ transform: `scaleX(${SQUEEZE})`, ...(fit.size ? { fontSize: `${fit.size}px` } : {}) }}
        >
          {digits}
        </div>
      </div>
      {view.message ? (
        <div className="stage-message" data-flash={view.message.flash} data-long={view.message.text.length > 60}>{view.message.text}</div>
      ) : null}
      {next ? <div className="stage-next">{next}</div> : <div className="stage-next" aria-hidden="true">&nbsp;</div>}
    </div>
  );
}
