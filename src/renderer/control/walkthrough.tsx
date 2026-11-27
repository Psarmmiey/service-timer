import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../shared/ui";

type Step = { target?: string; title: string; body: string };

export const WALKTHROUGH_STEPS: Step[] = [
  {
    title: "Welcome to Service Timer",
    body: "This window is for whoever runs the timer. The screen near the stage only shows the countdown. This tour takes about two minutes, and you can replay it any time from the ? button or Settings.",
  },
  { target: "preview", title: "What the stage shows", body: "This is exactly what the speaker sees right now, in the same shape as the stage screen." },
  { target: "status", title: "Status at a glance", body: "Running, Paused or Time up, and whether the service is ahead of or behind the plan." },
  { target: "next", title: "Next item", body: "The main button. Press it when one part of the service ends and the next begins. Shortcut: → or N." },
  { target: "pause", title: "Pause and adjust", body: "Pause or resume with Space. Use −1 min and +1 min if someone needs a little more or less time. Hold to repeat." },
  { target: "schedule", title: "Today's schedule", body: "Planned and actual start times. Move upcoming items with the arrows, or press Do next. The item running now is locked." },
  { target: "add-item", title: "Something unplanned?", body: "Add item after current puts a testimony or an extra song straight after what's happening now. The timer keeps running." },
  { target: "message", title: "Message the speaker", body: "Send \"Please wrap up\" or your own words to the stage. Esc clears it." },
  { target: "blackout", title: "Blackout", body: "Turns the stage screen black, for example during a video. Press B or this button again to bring the timer back." },
  { target: "plans", title: "Plans", body: "Set up Sunday's running order, start time and auto-start. With auto-start on, the timer starts itself even if nobody is here." },
  { target: "settings", title: "Settings and help", body: "Choose the stage screen, time up alerts, light or dark theme, and phone control, so someone can run the timer from their phone. You can replay this walkthrough here too. That's it: you're ready." },
];

const CARD_WIDTH = 340;

export function Walkthrough({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = WALKTHROUGH_STEPS[index]!;
  const last = index === WALKTHROUGH_STEPS.length - 1;

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const element = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      setRect(element ? element.getBoundingClientRect() : null);
    };
    measure();
    nextRef.current?.focus();
    window.addEventListener("resize", measure);
    const timer = setInterval(measure, 400);
    return () => {
      window.removeEventListener("resize", measure);
      clearInterval(timer);
    };
  }, [open, step.target]);

  if (!open) return null;

  const go = (delta: number) => {
    const next = index + delta;
    if (next < 0) return;
    if (next >= WALKTHROUGH_STEPS.length) onClose();
    else setIndex(next);
  };

  const cardHeight = cardRef.current?.offsetHeight ?? 190;
  let position: { left: number; top: number };
  if (!rect) {
    position = { left: (window.innerWidth - CARD_WIDTH) / 2, top: (window.innerHeight - cardHeight) / 2 };
  } else {
    const below = rect.bottom + 14;
    const above = rect.top - 14 - cardHeight;
    const top = below + cardHeight <= window.innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, (window.innerHeight - cardHeight) / 2);
    const fitsBeside = rect.height > window.innerHeight * 0.5;
    const left = fitsBeside
      ? rect.left - CARD_WIDTH - 16 > 8 ? rect.left - CARD_WIDTH - 16 : Math.min(rect.right + 16, window.innerWidth - CARD_WIDTH - 8)
      : Math.min(Math.max(8, rect.left + rect.width / 2 - CARD_WIDTH / 2), window.innerWidth - CARD_WIDTH - 8);
    position = { left, top: fitsBeside ? Math.min(Math.max(8, rect.top + 24), window.innerHeight - cardHeight - 8) : top };
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkthrough-title"
      className="fixed inset-0 z-[70]"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); onClose(); }
        if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
      }}
    >
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-sky-400 transition-all duration-200"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: "0 0 0 9999px rgb(0 0 0 / 60%)" }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/60" />
      )}
      <div
        ref={cardRef}
        className="fixed rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl transition-all duration-200"
        style={{ width: CARD_WIDTH, ...position }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Step {index + 1} of {WALKTHROUGH_STEPS.length}</div>
        <h2 id="walkthrough-title" className="mt-1 text-base font-semibold">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>{last ? "Close" : "Skip tour"}</Button>
          <div className="flex-1" />
          {index > 0 ? <Button size="sm" onClick={() => go(-1)}>Back</Button> : null}
          <Button ref={nextRef} size="sm" variant="default" onClick={() => go(1)}>{last ? "Finish" : "Next"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
