import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Clock3,
  EyeOff,
  GripVertical,
  HelpCircle,
  Smartphone,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Square,
} from "lucide-react";
import { StrictMode, useEffect, useRef, useState, type PointerEvent } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import type { AppState, TimerCommand } from "../../shared/ipc";
import "../shared/global.css";
import { formatBehindAhead, formatClock, formatMinutesLate, formatStageTime } from "../shared/format";
import { StageView } from "../shared/stage-view";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Toaster,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipProvider,
} from "../shared/ui";
import { useChime } from "./chime";
import { isLateStart, isLiveView, MINUTE_MS, planWhenLabel, plannedStartOf, send } from "./common";
import { PlanEditorDialog } from "./plan-editor";
import { SettingsDialog, type Section as SettingsSection } from "./settings-dialog";
import { useTheme } from "./theme";
import { Walkthrough } from "./walkthrough";

function HoldButton({ label, amount, disabled }: { label: string; amount: number; disabled?: boolean }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || disabled) return;
    send({ type: "adjust", ms: amount });
    timer.current = setInterval(() => send({ type: "adjust", ms: amount }), 450);
  };
  useEffect(() => stop, []);
  return (
    <Button
      className="h-[64px] w-[76px] text-sm font-semibold"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(event) => {
        if (event.detail === 0) send({ type: "adjust", ms: amount });
      }}
    >
      {label}
    </Button>
  );
}

function ConfirmDialog({ action, onClose }: { action: "restart" | "stop" | null; onClose: () => void }) {
  const restarting = action === "restart";
  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{restarting ? "Restart this item?" : "Stop the timer?"}</DialogTitle>
        <DialogDescription>
          {restarting
            ? "The current item goes back to its full planned time."
            : "The service is marked as ended and the stage shows the clock. You can start again afterwards."}
        </DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              send({ type: restarting ? "restartItem" : "stop" });
              onClose();
            }}
          >
            {restarting ? "Restart item" : "Stop timer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type StartNowTarget = { index: number; title: string; minutes: number; ending?: string; between: string[] };

function StartNowDialog({ target, onClose }: { target: StartNowTarget | null; onClose: () => void }) {
  const between = target?.between ?? [];
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Start {target?.title} now?</DialogTitle>
        <DialogDescription>
          {target?.ending ? `${target.ending} ends now and ` : ""}{target?.title} starts with its full {target?.minutes} min.
          {between.length ? ` ${between.join(", ")} ${between.length === 1 ? "stays" : "stay"} in the order for later.` : ""}
        </DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="default"
            onClick={() => {
              if (target) send({ type: "startNow", index: target.index });
              onClose();
            }}
          >
            Start now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomAdjustDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [minutes, setMinutes] = useState("1");
  const amount = Math.max(0, Math.round((Number(minutes) || 0) * MINUTE_MS));
  const adjust = (direction: 1 | -1) => {
    if (amount <= 0) return;
    send({ type: "adjust", ms: amount * direction });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(420px,calc(100vw-32px))]">
        <DialogTitle>Adjust time</DialogTitle>
        <DialogDescription>Add or take away time on the item running now.</DialogDescription>
        <div className="mt-5">
          <label className="mb-2 block text-sm font-medium" htmlFor="custom-adjust-minutes">Amount</label>
          <div className="flex items-center gap-2">
            <Input id="custom-adjust-minutes" type="number" min="0" step="1" inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} className="h-11" />
            <span className="text-sm text-zinc-500">minutes</span>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button disabled={amount <= 0} onClick={() => adjust(-1)}>Take away</Button>
          <Button variant="default" disabled={amount <= 0} onClick={() => adjust(1)}>Add time</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Starting the service: the late start prompt (FR-16) when more than a minute late,
 * or "start from another item" when on time or early.
 */
function StartDialog({ state, open, mode, onOpenChange }: { state: AppState; open: boolean; mode: "late" | "choose"; onOpenChange: (open: boolean) => void }) {
  const [choice, setChoice] = useState<"catchUp" | "fromTop" | "fromItem">("catchUp");
  const [itemIndex, setItemIndex] = useState("0");
  const plannedStart = plannedStartOf(state);
  const lateMs = Math.max(0, state.now - plannedStart);
  const planEnded = state.now >= state.view.plannedFinish;
  useEffect(() => {
    if (!open) return;
    setChoice(mode === "choose" ? "fromItem" : planEnded ? "fromTop" : "catchUp");
    setItemIndex(mode === "choose" ? "1" : "0");
    // Reset each time the prompt opens so last week's choice is never preselected.
  }, [open]);
  const items = state.plan.items;
  const minutesFrom = (index: number) => items.slice(index).reduce((sum, item) => sum + item.minutes, 0) * MINUTE_MS;
  const finish = choice === "catchUp" ? state.view.plannedFinish : state.now + minutesFrom(choice === "fromTop" ? 0 : Number(itemIndex));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(600px,calc(100vw-32px))]">
        {mode === "late" ? (
          <>
            <DialogTitle>You’re starting {formatMinutesLate(lateMs)} late</DialogTitle>
            <DialogDescription>
              It’s {formatClock(state.now)}. {state.plan.name} was planned to start at {formatClock(plannedStart)}. How should the timer pick up?
            </DialogDescription>
            <ToggleGroup type="single" value={choice} onValueChange={(value) => value && setChoice(value as typeof choice)} className="mt-5 grid gap-2" aria-label="Late start choice">
              <ToggleGroupItem value="catchUp" disabled={planEnded} className="h-auto w-full justify-start p-3 text-left">
                <span>
                  <span className="block text-sm font-semibold">Catch up to the clock <Badge className="ml-2">Recommended</Badge></span>
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    {planEnded ? `Today's plan ended at ${formatClock(state.view.plannedFinish)}, so there is nothing to catch up to.` : "Jump to the item that should be running now and mark earlier items skipped."}
                  </span>
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem value="fromTop" className="h-auto w-full justify-start p-3 text-left">
                <span>
                  <span className="block text-sm font-semibold">Start from the top</span>
                  <span className="mt-1 block text-xs font-normal text-zinc-500">Start the first item with its full time and move the later schedule by {formatMinutesLate(lateMs)}.</span>
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem value="fromItem" className="h-auto w-full justify-start p-3 text-left">
                <span>
                  <span className="block text-sm font-semibold">Start from a chosen item</span>
                  <span className="mt-1 block text-xs font-normal text-zinc-500">Pick any item. It starts now with its full time.</span>
                </span>
              </ToggleGroupItem>
            </ToggleGroup>
          </>
        ) : (
          <>
            <DialogTitle>Start from another item</DialogTitle>
            <DialogDescription>The item you choose starts now with its full time. Items before it are marked skipped.</DialogDescription>
          </>
        )}
        {choice === "fromItem" ? (
          <div className="mt-3">
            <Select value={itemIndex} onValueChange={setItemIndex}>
              <SelectTrigger className="w-full" aria-label="Item to start"><SelectValue placeholder="Choose an item" /></SelectTrigger>
              <SelectContent>
                {items.map((item, index) => <SelectItem key={item.id} value={String(index)}>{item.title} ({item.minutes} min)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="mt-6 flex items-center">
          <span className="flex-1 text-sm text-zinc-500">Finishes at <strong className="text-zinc-950">{formatClock(finish)}</strong></span>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="default"
            className="ml-2"
            onClick={() => {
              send({ type: "startChoice", mode: choice, index: Number(itemIndex) });
              onOpenChange(false);
            }}
          >
            Start
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddItemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("5");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Add item after current</DialogTitle>
        <DialogDescription>The timer keeps running. The new item is only added to today's run.</DialogDescription>
        <form
          className="mt-5 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const duration = Number(minutes);
            if (!title.trim() || !Number.isFinite(duration) || duration <= 0) return;
            send({ type: "insertAfterCurrent", item: { id: `extra-${Date.now()}`, title: title.trim(), minutes: duration } });
            toast.success(`${title.trim()} added after the current item`, {
              duration: 10_000,
              action: { label: "Undo", onClick: () => send({ type: "undoReorder" }) },
            });
            setTitle("");
            onOpenChange(false);
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Title
            <Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus maxLength={80} placeholder="For example, Testimony" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Minutes
            <Input type="number" min="1" max="240" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="default"><Plus className="size-4" /> Add item</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  idle: { label: "Not started", className: "border-zinc-200 bg-zinc-100 text-zinc-700" },
  waiting: { label: "Waiting", className: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300" },
  running: { label: "Running", className: "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300" },
  paused: { label: "Paused", className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  overrun: { label: "Time up", className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" },
  finished: { label: "Service ended", className: "border-zinc-200 bg-zinc-100 text-zinc-600" },
};

function ControlApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [confirm, setConfirm] = useState<"restart" | "stop" | null>(null);
  const [startNowTarget, setStartNowTarget] = useState<StartNowTarget | null>(null);
  const [startDialog, setStartDialog] = useState<"late" | "choose" | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [customAdjustOpen, setCustomAdjustOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(undefined);
  const openSettings = (section?: SettingsSection) => {
    setSettingsSection(section);
    setSettingsOpen(true);
  };
  // Say who has just connected from a phone, so a stranger stands out (FR-22).
  const seenPhones = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!state) return;
    const connected = (state.web.phones ?? []).filter((phone) => phone.connected);
    const previous = seenPhones.current;
    seenPhones.current = new Set(connected.map((phone) => phone.id));
    if (!previous) return;
    for (const phone of connected) {
      if (!previous.has(phone.id)) {
        toast(`${phone.name} connected from a phone`, {
          description: `${phone.device} · ${phone.address}`,
          action: { label: "See phones", onClick: () => openSettings("phone") },
        });
      }
    }
  }, [state?.web.phones]);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [flash, setFlash] = useState(false);
  const messageRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<AppState | null>(null);
  const autoWalkthroughShown = useRef(false);
  stateRef.current = state;
  const theme = useTheme(state?.settings.theme);
  useChime(state);

  useEffect(() => window.api.onState(setState), []);

  // First run: open the walkthrough once, but never in the middle of a service.
  useEffect(() => {
    if (!state || autoWalkthroughShown.current || !state.showWalkthrough || isLiveView(state)) return;
    autoWalkthroughShown.current = true;
    setWalkthroughOpen(true);
  }, [state]);

  const closeWalkthrough = () => {
    setWalkthroughOpen(false);
    const latest = stateRef.current;
    if (latest && !latest.settings.walkthroughSeen) send({ type: "saveSettings", settings: { ...latest.settings, walkthroughSeen: true } });
  };

  const startFor = (latest: AppState) => {
    if (isLateStart(latest)) setStartDialog("late");
    else send({ type: "start" });
  };

  const toggleFor = (latest: AppState) => {
    const status = latest.view.status;
    if (status === "idle" || status === "waiting" || status === "finished") startFor(latest);
    else if (latest.view.paused) send({ type: "resume" });
    else send({ type: "pause" });
  };
  const toggleRef = useRef(toggleFor);
  toggleRef.current = toggleFor;

  const showMessage = (text: string) => {
    const value = text.trim();
    if (value) send({ type: "message", text: value, flash });
  };

  useEffect(() => {
    const inDialog = () => Boolean(document.querySelector("[role='dialog'], [role='alertdialog']"));
    const isTyping = (target: HTMLElement | null) => Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
    const ownsKeys = (target: HTMLElement | null) => Boolean(target?.closest("[role='radiogroup'], [role='group'], [role='tablist'], [role='listbox'], [role='menu'], [role='combobox'], [role='switch'], [role='slider']"));

    const onKeyDown = (event: KeyboardEvent) => {
      const latest = stateRef.current;
      if (!latest || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "e") {
        event.preventDefault();
        setPlansOpen(true);
        return;
      }
      if (key === "escape" && isTyping(target) && !inDialog()) {
        send({ type: "clearMessage" });
        return;
      }
      // Shortcuts never fire while typing, inside a dialog, with modifiers or on key repeat.
      if (isTyping(target) || inDialog() || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (ownsKeys(target) && (key === " " || key.startsWith("arrow"))) return;
      const live = isLiveView(latest);
      switch (key) {
        case " ":
          event.preventDefault();
          toggleRef.current(latest);
          break;
        case "arrowright":
        case "n":
          event.preventDefault();
          if (live) send({ type: "next" });
          break;
        case "arrowleft":
        case "p":
          event.preventDefault();
          send({ type: "previous" });
          break;
        case "+":
        case "=":
          event.preventDefault();
          send({ type: "adjust", ms: MINUTE_MS });
          break;
        case "-":
        case "_":
          event.preventDefault();
          send({ type: "adjust", ms: -MINUTE_MS });
          break;
        case "b":
          event.preventDefault();
          send({ type: "blackout", on: !latest.view.blackout });
          break;
        case "m":
          event.preventDefault();
          messageRef.current?.focus();
          break;
        case "escape":
          event.preventDefault();
          send({ type: "clearMessage" });
          break;
        case "?":
          event.preventDefault();
          setWalkthroughOpen(true);
          break;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === " " && !isTyping(target) && !inDialog() && !ownsKeys(target)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  if (!state) {
    return <main className="flex h-full items-center justify-center text-sm text-zinc-500">Loading service…</main>;
  }

  const { view } = state;
  const live = isLiveView(state);
  const statusKey = view.paused ? "paused" : view.status;
  const status = STATUS_STYLE[statusKey] ?? STATUS_STYLE.idle!;
  const currentRow = view.scheduleRows.find((row) => row.status === "current");
  const firstRow = view.scheduleRows[0];
  const overrun = view.status === "overrun";
  const behind = view.behindAheadMs >= 60_000;
  const dueEnd = state.now + view.timeLeftMs;

  const reorder = (command: TimerCommand, description: string) => {
    send(command);
    toast.success(description, { duration: 10_000, action: { label: "Undo", onClick: () => send({ type: "undoReorder" }) } });
  };

  const saveRunToPlan = () => {
    const items = view.scheduleRows.map((row) => row.item);
    const plans = state.plans.map((plan) => (plan.id === state.plan.id ? { ...plan, items, updatedAt: new Date().toISOString() } : plan));
    send({ type: "savePlans", plans, activePlanId: state.activePlanId });
    toast.success(`Today's order saved to ${state.plan.name}`);
  };

  return (
    <TooltipProvider>
      <main className="flex h-full min-h-0 flex-col bg-zinc-50 text-zinc-950">
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4">
          <div className="flex items-center gap-2 text-sm font-bold"><Clock3 className="size-5" /> Service Timer</div>
          <div className="h-6 w-px bg-zinc-200" />
          <Button size="sm" className="font-medium" onClick={() => setPlansOpen(true)}>{state.plan.name} · {planWhenLabel(state.plan)}</Button>
          <div className="flex items-center gap-2" data-tour="status">
            <Badge className={status.className}>{status.label}</Badge>
            {live ? <Badge className={behind ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" : ""}>{formatBehindAhead(view.behindAheadMs)}</Badge> : null}
            {view.blackout ? <Badge className="border-zinc-950 bg-zinc-950 text-zinc-50"><EyeOff className="mr-1 size-3" /> Stage blacked out</Badge> : null}
            {state.web.running && state.web.clients > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="h-6 rounded-full px-2 text-xs font-medium"
                title={(state.web.phones ?? []).filter((phone) => phone.connected).map((phone) => phone.name).join(", ")}
                aria-label="Connected phones"
                onClick={() => openSettings("phone")}
              >
                <Smartphone className="size-3" /> {state.web.clients} phone{state.web.clients === 1 ? "" : "s"}
              </Button>
            ) : null}
          </div>
          <div className="flex-1" />
          <span className="text-[22px] font-semibold tabular-nums">{formatClock(state.now)}</span>
          <div className="h-6 w-px bg-zinc-200" />
          <Button variant="ghost" size="sm" onClick={() => setPlansOpen(true)} data-tour="plans">Plans</Button>
          <Tooltip label="Walkthrough (?)"><Button aria-label="Walkthrough" variant="ghost" size="icon" onClick={() => setWalkthroughOpen(true)}><HelpCircle className="size-[18px]" /></Button></Tooltip>
          <Tooltip label="Settings">
            <Button aria-label="Settings" variant="ghost" size="icon" className="relative" onClick={() => openSettings()} data-tour="settings">
              <Settings className="size-[18px]" />
              {state.update.state === "ready" ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-blue-500" aria-label="Update ready" /> : null}
            </Button>
          </Tooltip>
        </header>

        {view.banner ? (
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-sky-200 bg-sky-50 px-4 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
            <span className="flex-1">{view.banner}</span>
            {view.bannerAction === "fromTop" ? <Button size="sm" onClick={() => send({ type: "startChoice", mode: "fromTop" })}>Start from the top instead</Button> : null}
            <Button size="sm" variant="ghost" onClick={() => send({ type: "dismissBanner" })}>Dismiss</Button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <section className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex min-h-0 flex-1 gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  <span>{state.display.mode === "stage-window" ? "On stage now" : "Stage preview · no second screen"}</span>
                  {view.blackout ? <span className="text-zinc-950">Blacked out</span> : null}
                </div>
                <div className="min-h-0 flex-1 [container-type:size]">
                  <div
                    data-tour="preview"
                    className="relative mx-auto overflow-hidden rounded-xl ring-1 ring-zinc-200"
                    style={{
                      width: `min(100cqw, calc(100cqh * ${state.display.aspectRatio}))`,
                      height: `min(100cqh, calc(100cqw / ${state.display.aspectRatio}))`,
                    }}
                  >
                    <StageView state={state} preview />
                    {view.blackout ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-[#d4d4d8]">
                        <EyeOff className="size-6" />
                        The stage is blacked out.
                        <Button size="sm" onClick={() => send({ type: "blackout", on: false })}>Show the timer again (B)</Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex w-[300px] shrink-0 flex-col rounded-xl border border-zinc-200 bg-white p-4 text-xs">
                {live ? (
                  <>
                    <strong className="text-base leading-tight">{view.current?.title}</strong>
                    {view.current?.note ? <span className="mt-1 rounded-md bg-zinc-100 px-2 py-1 text-zinc-700">{view.current.note}</span> : null}
                    <span className="mt-2 text-zinc-500">
                      {currentRow?.actualStart ? `Started ${formatClock(currentRow.actualStart)} · ` : ""}{view.current?.minutes} min planned
                    </span>
                    {overrun ? (
                      <span className="mt-1 font-semibold text-red-700 dark:text-red-400">Over by {formatStageTime(Math.max(1000, -view.timeLeftMs))} · was due {formatClock(dueEnd)}</span>
                    ) : (
                      <span className="mt-1 text-zinc-500">{view.paused ? "Paused" : `Ends at ${formatClock(dueEnd)}`}</span>
                    )}
                    <div className="my-3 h-px bg-zinc-100" />
                    <span className="flex justify-between text-zinc-500">Planned finish <strong className="text-zinc-950">{formatClock(view.plannedFinish)}</strong></span>
                    <span className="mt-1 flex justify-between text-zinc-500">
                      Projected finish
                      <strong className={behind ? "text-amber-700 dark:text-amber-400" : "text-zinc-950"}>{formatClock(view.projectedFinish)}</strong>
                    </span>
                  </>
                ) : view.status === "waiting" ? (
                  <>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-sky-700 dark:text-sky-400">Auto-start is on</span>
                    <strong className="mt-1 text-base leading-snug">Nothing to do. The timer starts itself at {firstRow ? formatClock(firstRow.scheduledStart) : state.plan.startTime}.</strong>
                    <span className="mt-1 text-zinc-500">It begins with {firstRow?.item.title ?? "the first item"}. Leave this window open.</span>
                    <div className="mt-auto grid gap-2 pt-3">
                      <Button onClick={() => startFor(state)}><Play className="size-4" /> Start now</Button>
                      <Button onClick={() => setStartDialog("choose")}>Start from another item</Button>
                      <Button variant="ghost" onClick={() => send({ type: "skipAutoStartToday" })}>Turn off auto-start today</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{view.status === "finished" ? "Service ended" : "Not running"}</span>
                    <strong className="mt-1 text-base leading-snug">
                      {view.status === "finished"
                        ? "The service has finished."
                        : state.now < plannedStartOf(state)
                          ? `${state.plan.name} is planned for ${formatClock(plannedStartOf(state))}.`
                          : `${state.plan.name} was planned for ${formatClock(plannedStartOf(state))}.`}
                    </strong>
                    <span className="mt-1 text-zinc-500">
                      {state.plan.autoStart ? "Auto-start is off for today." : "Auto-start is off for this plan, so press Start when you're ready."}
                    </span>
                    <div className="mt-auto grid gap-2 pt-3">
                      <Button variant="default" onClick={() => startFor(state)}><Play className="size-4" /> {view.status === "finished" ? "Start again" : "Start"}</Button>
                      <Button onClick={() => setStartDialog("choose")}>Start from another item</Button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex shrink-0 gap-3">
              <Button
                className="h-[64px] w-[180px] text-base font-semibold"
                data-tour="pause"
                disabled={!live}
                onClick={() => toggleRef.current(state)}
              >
                {view.paused ? <Play className="size-5" /> : <Pause className="size-5" />}
                {view.paused ? "Resume" : "Pause"}
              </Button>
              <HoldButton label="−1 min" amount={-MINUTE_MS} disabled={!live} />
              <HoldButton label="+1 min" amount={MINUTE_MS} disabled={!live} />
              <Button className="h-[64px] w-[76px] flex-col gap-0 text-sm font-semibold" onClick={() => setCustomAdjustOpen(true)} disabled={!live}>
                <span>Custom</span>
                <span className="text-[11px] font-normal text-zinc-500">± time</span>
              </Button>
              <div className="mx-1 w-px bg-zinc-200" />
              <Button
                variant="default"
                data-tour="next"
                className="h-[64px] min-w-[180px] flex-1 flex-col gap-0 text-lg font-semibold"
                onClick={() => send({ type: "next" })}
                disabled={!live}
              >
                <span className="flex items-center gap-1.5">{view.next ? "Next item" : "Finish service"} <ArrowRight className="size-5" /></span>
                <span className="max-w-full truncate text-xs font-normal opacity-70">{live ? view.next?.title ?? "Ends the service" : "Starts when the service is running"}</span>
              </Button>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" onClick={() => send({ type: "previous" })} disabled={!live}><ArrowLeft className="size-4" /> Previous</Button>
              <Button size="sm" onClick={() => setConfirm("restart")} disabled={!live}><RotateCcw className="size-4" /> Restart item</Button>
              <Button size="sm" onClick={() => setConfirm("stop")} disabled={!live}><Square className="size-3.5" /> Stop</Button>
              <div className="mx-1 h-6 w-px bg-zinc-200" />
              <Button
                size="sm"
                data-tour="blackout"
                aria-pressed={view.blackout}
                variant={view.blackout ? "default" : "outline"}
                onClick={() => send({ type: "blackout", on: !view.blackout })}
              >
                <EyeOff className="size-4" /> {view.blackout ? "Show timer" : "Blackout"}
              </Button>
              <span className="ml-auto hidden text-[11px] text-zinc-500 xl:inline">→ next · Space pause · +/− minute · B blackout · ? help</span>
            </div>

            <section className="shrink-0 rounded-xl border border-zinc-200 bg-white p-3" data-tour="message">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Message to stage</h2>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
                  <Switch checked={flash} onCheckedChange={setFlash} aria-label="Flash stage message" /> Flash
                </label>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <ToggleGroup type="single" value={view.message?.text ?? ""} className="flex shrink-0 gap-2">
                  {["Please wrap up", "5 minutes", "2 minutes", "Time for altar call"].map((preset) => (
                    <ToggleGroupItem key={preset} value={preset} onClick={() => showMessage(preset)}>{preset}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Input
                  ref={messageRef}
                  aria-label="Custom message"
                  className="h-8 min-w-28"
                  maxLength={120}
                  placeholder="Custom message…"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") showMessage(message); }}
                />
                <Button size="sm" variant="default" onClick={() => showMessage(message)}>Show</Button>
                <Button size="sm" disabled={!view.message} onClick={() => send({ type: "clearMessage" })}>Clear</Button>
              </div>
            </section>

            {state.display.mode === "single-monitor" && state.display.banner ? (
              <div className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {state.display.banner}
              </div>
            ) : null}
          </section>

          <aside className="flex w-[410px] min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white" data-tour="schedule">
            <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
              <div>
                <h2 className="text-sm font-semibold">Schedule</h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">{view.scheduleRows.length} items · finishes {formatClock(view.projectedFinish)}</p>
              </div>
              <div className="flex gap-2">
                {view.hasRunChanges ? <Button size="sm" onClick={saveRunToPlan}>Save to plan</Button> : null}
                <Button size="sm" onClick={() => setPlansOpen(true)}>Edit plan</Button>
              </div>
            </div>
            <div className="grid grid-cols-[20px_40px_40px_1fr_auto] gap-2 px-4 pb-1 text-[10px] font-semibold tracking-wider text-zinc-500">
              <span /><span>PLAN</span><span>ACTUAL</span><span>ITEM</span><span />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
              {view.scheduleRows.map((row) => {
                const upcoming = row.status === "upcoming" && live;
                const current = row.status === "current";
                return (
                  <div
                    key={row.item.id}
                    draggable={upcoming}
                    tabIndex={upcoming ? 0 : -1}
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", String(row.index))}
                    onDragOver={(event) => upcoming && event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = Number(event.dataTransfer.getData("text/plain"));
                      if (Number.isInteger(from) && from !== row.index) reorder({ type: "reorder", fromIndex: from, toIndex: row.index }, "Schedule reordered");
                    }}
                    onKeyDown={(event) => {
                      if (!event.altKey) return;
                      if (event.key === "ArrowUp") { event.preventDefault(); reorder({ type: "moveUp", index: row.index }, "Item moved up"); }
                      if (event.key === "ArrowDown") { event.preventDefault(); reorder({ type: "moveDown", index: row.index }, "Item moved down"); }
                    }}
                    className={`grid min-h-12 grid-cols-[20px_40px_40px_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                      current ? "bg-zinc-100 font-semibold" : row.status === "done" ? "text-zinc-400" : "text-zinc-700"
                    }`}
                  >
                    <span>{upcoming ? <GripVertical className="size-4 cursor-grab text-zinc-400" /> : null}</span>
                    <span className="tabular-nums">{formatClock(row.scheduledStart)}</span>
                    <span className="tabular-nums text-zinc-500">{row.actualStart ? formatClock(row.actualStart) : ""}</span>
                    <span className="min-w-0">
                      <span className={`block truncate ${row.skipped ? "line-through" : ""}`} title={row.item.title}>{row.item.title}</span>
                      <span className="block font-normal text-zinc-500">{row.item.minutes} min</span>
                    </span>
                    {row.status === "upcoming" && !live ? <span /> : upcoming ? (
                      <span className="flex items-center gap-1">
                        <Tooltip label="Move up"><Button aria-label={`Move ${row.item.title} up`} variant="ghost" size="icon" className="size-8" onClick={() => reorder({ type: "moveUp", index: row.index }, "Item moved up")}><ArrowUp className="size-4" /></Button></Tooltip>
                        <Tooltip label="Move down"><Button aria-label={`Move ${row.item.title} down`} variant="ghost" size="icon" className="size-8" onClick={() => reorder({ type: "moveDown", index: row.index }, "Item moved down")}><ArrowDown className="size-4" /></Button></Tooltip>
                        <Button aria-label={`Do ${row.item.title} next`} size="sm" className="h-8 px-2" onClick={() => reorder({ type: "doNext", index: row.index }, `${row.item.title} is next`)}>Do next</Button>
                        <Tooltip label="Start now"><Button aria-label={`Start ${row.item.title} now`} variant="ghost" size="icon" className="size-8" onClick={() => setStartNowTarget({
                          index: row.index,
                          title: row.item.title,
                          minutes: row.item.minutes,
                          ending: view.current?.title,
                          between: view.scheduleRows.filter((other) => other.status === "upcoming" && other.index < row.index).map((other) => other.item.title),
                        })}><Play className="size-4" /></Button></Tooltip>
                      </span>
                    ) : (
                      <Badge className={`h-6 px-2 text-[11px] ${current && overrun ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" : current ? "border-zinc-950 bg-zinc-950 text-zinc-50" : ""}`}>
                        {current ? (overrun ? "Time up" : view.paused ? "Paused" : "Now") : row.skipped ? "Skipped" : row.status === "done" ? <><Check className="mr-1 size-3" /> Done</> : `${row.item.minutes} min`}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-zinc-100 p-3">
              <Button className="h-10 w-full border-dashed" disabled={!live} onClick={() => setAddItemOpen(true)} data-tour="add-item"><Plus className="size-4" /> Add item after current</Button>
              <p className="mt-2 text-[10px] text-zinc-500">Drag upcoming items, or move them with Alt+↑ and Alt+↓.</p>
            </div>
          </aside>
        </div>
      </main>

      <ConfirmDialog action={confirm} onClose={() => setConfirm(null)} />
      <StartNowDialog target={startNowTarget} onClose={() => setStartNowTarget(null)} />
      <StartDialog state={state} open={startDialog !== null} mode={startDialog ?? "late"} onOpenChange={(open) => !open && setStartDialog(null)} />
      <AddItemDialog open={addItemOpen} onOpenChange={setAddItemOpen} />
      <CustomAdjustDialog open={customAdjustOpen} onOpenChange={setCustomAdjustOpen} />
      <PlanEditorDialog state={state} open={plansOpen} onOpenChange={setPlansOpen} />
      <SettingsDialog state={state} open={settingsOpen} onOpenChange={setSettingsOpen} startSection={settingsSection} onReplayWalkthrough={() => setWalkthroughOpen(true)} />
      <Walkthrough open={walkthroughOpen} onClose={closeWalkthrough} />
      <Toaster theme={theme} />
    </TooltipProvider>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ControlApp />
    </StrictMode>,
  );
}
