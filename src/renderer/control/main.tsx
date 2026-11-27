import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Clock3,
  GripVertical,
  MoreVertical,
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
import { formatBehindAhead, formatClock, formatMinutesLate } from "../shared/format";
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

const MINUTE_MS = 60_000;

function send(command: TimerCommand) {
  window.api.send(command);
}

function HoldButton({
  label,
  amount,
}: {
  label: string;
  amount: number;
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    send({ type: "adjust", ms: amount });
    timer.current = setInterval(() => send({ type: "adjust", ms: amount }), 450);
  };

  useEffect(() => stop, []);

  return (
    <Button
      className="h-[60px] w-[76px] text-sm font-semibold"
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

function ConfirmDialog({
  action,
  onClose,
}: {
  action: "restart" | "stop" | null;
  onClose: () => void;
}) {
  const restarting = action === "restart";
  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{restarting ? "Restart this item?" : "Stop the timer?"}</DialogTitle>
        <DialogDescription>
          {restarting
            ? "The current item will return to its full planned duration."
            : "The service will be marked as ended. This cannot be undone."}
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

function CustomAdjustDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
        <DialogDescription>Enter a custom amount to add or subtract.</DialogDescription>
        <div className="mt-5">
          <label className="mb-2 block text-sm font-medium" htmlFor="custom-adjust-minutes">Amount</label>
          <div className="flex items-center gap-2">
            <Input
              id="custom-adjust-minutes"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className="h-11"
            />
            <span className="text-sm text-zinc-500">minutes</span>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" disabled={amount <= 0} onClick={() => adjust(-1)}>Subtract</Button>
          <Button disabled={amount <= 0} onClick={() => adjust(1)}>Add time</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LateStartDialog({
  state,
  open,
  onOpenChange,
}: {
  state: AppState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [choice, setChoice] = useState<"catchUp" | "fromTop" | "fromItem">("catchUp");
  const [itemIndex, setItemIndex] = useState("0");
  const plannedStart = state.view.scheduleRows[0]?.scheduledStart ?? state.now;
  const lateMs = Math.max(0, state.now - plannedStart);
  const finish = state.view.projectedFinish + (choice === "fromTop" ? lateMs : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(600px,calc(100vw-32px))]">
        <DialogTitle>You’re starting {formatMinutesLate(lateMs)} late</DialogTitle>
        <DialogDescription>
          It’s {formatClock(state.now)}. {state.plan.name} was planned to start at {formatClock(plannedStart)}. How should the timer pick up?
        </DialogDescription>
        <ToggleGroup
          type="single"
          value={choice}
          onValueChange={(value) => value && setChoice(value as typeof choice)}
          className="mt-5 grid gap-2"
          aria-label="Late start choice"
        >
          <ToggleGroupItem value="catchUp" className="h-auto w-full justify-start p-3 text-left">
            <span>
              <span className="block text-sm font-semibold">Catch up to the clock <Badge className="ml-2">Recommended</Badge></span>
              <span className="mt-1 block text-xs font-normal text-zinc-500">Jump to the item that should be running now and mark earlier items skipped.</span>
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
        {choice === "fromItem" ? (
          <div className="mt-3">
            <Select value={itemIndex} onValueChange={setItemIndex}>
              <SelectTrigger className="w-full" aria-label="Item to start">
                <SelectValue placeholder="Choose an item" />
              </SelectTrigger>
              <SelectContent>
                {state.plan.items.map((item, index) => (
                  <SelectItem key={item.id} value={String(index)}>{item.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="mt-6 flex items-center">
          <span className="flex-1 text-sm text-zinc-500">Finish time: <strong className="text-zinc-950">{formatClock(finish)}</strong></span>
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

function AddItemDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("5");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Add item after current</DialogTitle>
        <DialogDescription>The timer will keep running. The new item is only added to this run.</DialogDescription>
        <form
          className="mt-5 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const duration = Number(minutes);
            if (!title.trim() || !Number.isFinite(duration) || duration <= 0) return;
            send({
              type: "insertAfterCurrent",
              item: {
                id: `extra-${Date.now()}`,
                title: title.trim(),
                minutes: duration,
              },
            });
            toast.success("Item added after the current item", {
              duration: 10_000,
              action: { label: "Undo", onClick: () => send({ type: "undoReorder" }) },
            });
            setTitle("");
            onOpenChange(false);
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Title
            <Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus maxLength={80} />
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

function ControlApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [confirm, setConfirm] = useState<"restart" | "stop" | null>(null);
  const [lateStartOpen, setLateStartOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [customAdjustOpen, setCustomAdjustOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [flash, setFlash] = useState(false);
  const messageRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<AppState | null>(null);
  stateRef.current = state;

  useEffect(() => window.api.onState(setState), []);

  const active = state && ["running", "paused", "overrun"].includes(state.view.status);
  const paused = state?.view.status === "paused";
  const waiting = state && (state.view.status === "idle" || state.view.status === "waiting");

  const start = () => {
    if (!state) return;
    const plannedStart = state.view.scheduleRows[0]?.scheduledStart ?? state.now;
    if (state.now - plannedStart > 60_000) {
      setLateStartOpen(true);
    } else {
      send({ type: "start" });
    }
  };

  const toggleMain = () => {
    if (waiting) start();
    else if (paused) send({ type: "resume" });
    else if (active) send({ type: "pause" });
  };

  const showMessage = (text: string) => {
    const value = text.trim();
    if (!value) return;
    send({ type: "message", text: value, flash });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const latest = stateRef.current;
      if (!latest) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) {
        if (event.key === "Escape") {
          event.preventDefault();
          send({ type: "clearMessage" });
        }
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === "e") {
          event.preventDefault();
          toast.info("Plan editing will be available in the plan editor.");
        }
        return;
      }
      if (event.altKey) return;
      switch (event.key.toLowerCase()) {
        case " ":
          event.preventDefault();
          if (latest.view.status === "idle" || latest.view.status === "waiting") {
            const plannedStart = latest.view.scheduleRows[0]?.scheduledStart ?? latest.now;
            if (latest.now - plannedStart > 60_000) setLateStartOpen(true);
            else send({ type: "start" });
          } else if (latest.view.status === "paused") {
            send({ type: "resume" });
          } else if (["running", "paused", "overrun"].includes(latest.view.status)) {
            send({ type: "pause" });
          }
          break;
        case "arrowright":
        case "n":
          event.preventDefault();
          send({ type: "next" });
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
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!state) {
    return <main className="flex h-full items-center justify-center text-sm text-zinc-500">Loading service…</main>;
  }

  const currentRow = state.view.scheduleRows.find((row) => row.status === "current");
  const onStatus = state.view.status === "overrun" ? "Time up" : paused ? "Paused" : state.view.status;

  const reorder = (command: TimerCommand, description: string) => {
    send(command);
    toast.success(description, {
      duration: 10_000,
      action: { label: "Undo", onClick: () => send({ type: "undoReorder" }) },
    });
  };

  return (
    <TooltipProvider>
      <main className="flex h-full min-h-0 flex-col bg-zinc-50">
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4">
          <div className="flex items-center gap-2 text-sm font-bold"><Clock3 className="size-5" /> Service Timer</div>
          <div className="h-6 w-px bg-zinc-200" />
          <Button size="sm" className="font-medium">{state.plan.name} · Sun {state.plan.startTime}</Button>
          <Badge className={state.view.status === "overrun" ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800"}>{onStatus}</Badge>
          <Badge>{formatBehindAhead(state.view.behindAheadMs)}</Badge>
          <div className="flex-1" />
          <span className="text-[22px] font-semibold tabular-nums">{formatClock(state.now)}</span>
          <div className="h-6 w-px bg-zinc-200" />
          <Tooltip label="Plans"><Button variant="ghost" size="sm">Plans</Button></Tooltip>
          <Tooltip label="Settings"><Button aria-label="Settings" variant="ghost" size="icon"><Settings className="size-[18px]" /></Button></Tooltip>
        </header>

        {state.view.banner ? (
          <div className="flex h-9 shrink-0 items-center border-b border-blue-200 bg-blue-50 px-4 text-xs text-blue-900">{state.view.banner}</div>
        ) : null}

        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <section className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex h-[212px] shrink-0 gap-3">
              <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl">
                <div className="absolute left-3 top-2 z-10 text-[10px] font-semibold tracking-widest text-zinc-500">
                  ON STAGE · {state.display.mode === "stage-window" ? `DISPLAY ${state.display.stageDisplayId ?? 2}` : "PREVIEW"}
                </div>
                <StageView state={state} preview />
              </div>
              <div className="flex w-[220px] shrink-0 flex-col rounded-xl border border-zinc-200 bg-white p-3 text-xs">
                <strong className="text-sm">{active ? state.view.current?.title : state.plan.items[0]?.title}</strong>
                <span className="mt-1 text-zinc-500">
                  {active && currentRow?.actualStart
                    ? `Started ${formatClock(currentRow.actualStart)} · ${state.view.current?.minutes} min`
                    : `Starts ${state.plan.startTime}`}
                </span>
                <span className="mt-1 text-zinc-500">
                  {active ? `Ends at ${formatClock(state.now + Math.max(0, state.view.timeLeftMs))}` : "Waiting to start"}
                </span>
                <div className="my-2 h-px bg-zinc-100" />
                <span className="text-zinc-500">Projected finish <strong className="float-right text-zinc-950">{formatClock(state.view.projectedFinish)}</strong></span>
                <span className="mt-1 text-zinc-500">Timing <strong className="float-right text-zinc-950">{formatBehindAhead(state.view.behindAheadMs)}</strong></span>
              </div>
            </div>

            <div className="flex shrink-0 gap-3">
              <Button variant="outline" className="h-[60px] w-[220px] text-base font-semibold" onClick={toggleMain} disabled={state.view.status === "finished"}>
                {paused || waiting ? <Play className="size-5" /> : <Pause className="size-5" />}
                {waiting ? "Start now" : paused ? "Resume" : "Pause"}
              </Button>
              <HoldButton label="−1 min" amount={-MINUTE_MS} />
              <HoldButton label="+1 min" amount={MINUTE_MS} />
              <Button variant="outline" className="h-[60px] w-[76px] flex-col gap-0 text-sm font-semibold" onClick={() => setCustomAdjustOpen(true)} disabled={!active}>
                <span>Custom</span>
                <span className="text-[11px] font-normal text-zinc-500">± time</span>
              </Button>
              <div className="mx-1 w-px bg-zinc-200" />
              <Button variant="default" className="h-[60px] min-w-[150px] flex-1 flex-col gap-0 text-base font-semibold" onClick={() => send({ type: "next" })} disabled={!active}>
                <span className="flex items-center gap-1">Next item <ArrowRight className="size-4" /></span>
                <span className="max-w-full truncate text-[11px] font-normal text-zinc-500">{state.view.next?.title ?? "Finish service"}</span>
              </Button>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" onClick={() => send({ type: "previous" })} disabled={!active}><ArrowLeft className="size-4" /> Previous</Button>
              <Button size="sm" onClick={() => setConfirm("restart")} disabled={!active}><RotateCcw className="size-4" /> Restart item</Button>
              <Button size="sm" onClick={() => setConfirm("stop")} disabled={!active}><Square className="size-3.5" /> Stop</Button>
              <span className="ml-auto hidden text-[11px] text-zinc-500 xl:inline">Space start/pause · → next · +/− minute · B blackout</span>
            </div>

            <section className="min-h-0 shrink-0 rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Message to stage</h2>
                <div className="flex items-center gap-4 text-xs text-zinc-600">
                  <label className="flex cursor-pointer items-center gap-2">
                    <Switch checked={flash} onCheckedChange={setFlash} aria-label="Flash stage message" /> Flash
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <Switch
                      checked={state.view.blackout}
                      onCheckedChange={(on) => send({ type: "blackout", on })}
                      aria-label="Blackout stage"
                    />
                    Blackout stage
                  </label>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <ToggleGroup type="single" value={state.view.message?.text ?? ""} className="flex shrink-0 gap-2">
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter") showMessage(message);
                  }}
                />
                <Button size="sm" variant="default" onClick={() => showMessage(message)}>Show</Button>
                <Button size="sm" disabled={!state.view.message} onClick={() => send({ type: "clearMessage" })}>Clear</Button>
              </div>
            </section>

            {state.display.mode === "single-monitor" && state.display.banner ? (
              <div className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {state.display.banner}
              </div>
            ) : null}
          </section>

          <aside className="flex w-[400px] min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <div>
                <h2 className="text-sm font-semibold">Schedule</h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">{state.view.scheduleRows.length} items · finishes {formatClock(state.view.projectedFinish)}</p>
              </div>
              <Button size="sm" onClick={() => toast.info("Plan editing will be available in the plan editor.")}>Edit plan</Button>
            </div>
            <div className="grid grid-cols-[44px_44px_1fr_auto] gap-2 px-4 pb-1 text-[10px] font-semibold tracking-wider text-zinc-500">
              <span>PLAN</span><span>ACTUAL</span><span>ITEM</span><span>STATUS</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
              {state.view.scheduleRows.map((row) => {
                const upcoming = row.status === "upcoming" && active;
                return (
                  <div
                    key={row.item.id}
                    draggable={Boolean(upcoming)}
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
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        reorder({ type: "moveUp", index: row.index }, "Item moved up");
                      } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        reorder({ type: "moveDown", index: row.index }, "Item moved down");
                      }
                    }}
                    className={`grid min-h-11 grid-cols-[20px_44px_44px_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                      row.status === "current" && active ? "bg-zinc-100 font-medium" : "text-zinc-600"
                    }`}
                  >
                    <span>{upcoming ? <GripVertical className="size-4 cursor-grab text-zinc-400" /> : null}</span>
                    <span className="tabular-nums">{formatClock(row.scheduledStart)}</span>
                    <span className="tabular-nums text-zinc-500">{row.actualStart ? formatClock(row.actualStart) : "—"}</span>
                    <span className="min-w-0 truncate" title={row.item.title}>{row.item.title}</span>
                    {upcoming ? (
                      <span className="flex items-center gap-0.5">
                        <Tooltip label="Move up"><Button aria-label={`Move ${row.item.title} up`} variant="ghost" size="icon" className="size-7" onClick={() => reorder({ type: "moveUp", index: row.index }, "Item moved up")}><ArrowUp className="size-3.5" /></Button></Tooltip>
                        <Tooltip label="Move down"><Button aria-label={`Move ${row.item.title} down`} variant="ghost" size="icon" className="size-7" onClick={() => reorder({ type: "moveDown", index: row.index }, "Item moved down")}><ArrowDown className="size-3.5" /></Button></Tooltip>
                        <Tooltip label="Do next"><Button aria-label={`Do ${row.item.title} next`} variant="ghost" size="icon" className="size-7" onClick={() => reorder({ type: "doNext", index: row.index }, "Item moved next")}><MoreVertical className="size-3.5" /></Button></Tooltip>
                      </span>
                    ) : (
                      <Badge className="h-5 px-1.5 text-[10px]">{row.status === "current" && active ? "Current" : row.status === "done" ? <><Check className="mr-1 size-3" /> Done</> : `${row.item.minutes} min`}</Badge>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-zinc-100 p-3">
              <Button className="w-full border-dashed" disabled={!active} onClick={() => setAddItemOpen(true)}><Plus className="size-4" /> Add item after current</Button>
              <p className="mt-2 text-[10px] text-zinc-500">Upcoming items can be dragged or moved with Alt+↑ and Alt+↓.</p>
            </div>
          </aside>
        </div>
      </main>

      <ConfirmDialog action={confirm} onClose={() => setConfirm(null)} />
      <LateStartDialog state={state} open={lateStartOpen} onOpenChange={setLateStartOpen} />
      <AddItemDialog open={addItemOpen} onOpenChange={setAddItemOpen} />
      <CustomAdjustDialog open={customAdjustOpen} onOpenChange={setCustomAdjustOpen} />
      <Toaster />
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
