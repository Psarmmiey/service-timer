import { ChevronDown, ChevronRight, ClipboardPaste, Download, GripVertical, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Item, Plan } from "../../engine";
import type { AppState } from "../../shared/ipc";
import { csvToRunningOrderText } from "../../shared/running-order";
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
  ToggleGroup,
  ToggleGroupItem,
} from "../shared/ui";
import { DAY_NAMES, isLiveView, nextRunLabel, send } from "./common";
import { RunningOrderImportDialog, type ImportTarget } from "./import-dialog";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

/** Validate an imported plan file and give it and its items fresh ids. */
export function normaliseImportedPlan(value: unknown, sequence = 0): Plan | null {
  if (!isRecord(value)) return null;
  if (typeof value.name !== "string" || !value.name.trim()) return null;
  if (!isTime(value.startTime)) return null;
  if (!Array.isArray(value.days) || !value.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) return null;
  if (typeof value.autoStart !== "boolean") return null;
  if (value.autoAdvanceSeconds !== undefined && (!isFiniteNumber(value.autoAdvanceSeconds) || value.autoAdvanceSeconds < 0)) return null;
  if (!Array.isArray(value.items)) return null;
  if (value.kind !== "recurring" && value.kind !== "oneOff") return null;
  if (value.kind === "oneOff" && !isDate(value.date)) return null;
  const stamp = Date.now();
  const items: Item[] = [];
  for (const [index, item] of value.items.entries()) {
    if (!isRecord(item)) return null;
    if (typeof item.title !== "string" || !item.title.trim()) return null;
    if (!isFiniteNumber(item.minutes) || item.minutes < 0.5) return null;
    if (item.note !== undefined && typeof item.note !== "string") return null;
    if (item.warnAtSeconds !== undefined && (!isFiniteNumber(item.warnAtSeconds) || item.warnAtSeconds < 0)) return null;
    items.push({
      id: `item-${stamp}-${sequence}-${index}`,
      title: item.title.trim(),
      minutes: item.minutes,
      ...(item.note ? { note: item.note } : {}),
      ...(item.warnAtSeconds !== undefined ? { warnAtSeconds: item.warnAtSeconds } : {}),
    });
  }
  return {
    id: `plan-${stamp}-${sequence}`,
    name: value.name.trim(),
    startTime: value.startTime,
    days: [...new Set(value.days as number[])].sort((a, b) => a - b),
    autoStart: value.autoStart,
    ...(value.autoAdvanceSeconds !== undefined ? { autoAdvanceSeconds: value.autoAdvanceSeconds as number } : {}),
    items,
    updatedAt: new Date().toISOString(),
    kind: value.kind,
    ...(typeof value.date === "string" ? { date: value.date } : {}),
  };
}

/**
 * Read a Service Timer file: a backup of all plans ({ plans: [...] }), a list of plans,
 * or one exported plan. Returns null if nothing in it is a valid plan.
 */
export function readPlansFile(value: unknown): { plans: Plan[]; skipped: number } | null {
  const list = Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as { plans?: unknown }).plans) ? (value as { plans: unknown[] }).plans : [value];
  const plans = list.map((entry, index) => normaliseImportedPlan(entry, index)).filter((plan): plan is Plan => plan !== null);
  return plans.length ? { plans, skipped: list.length - plans.length } : null;
}

/** Give an imported plan a name that isn't already taken, such as "Sunday service (2)". */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  for (let count = 2; ; count += 1) if (!taken.includes(`${name} (${count})`)) return `${name} (${count})`;
}

function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Minutes field that only commits a valid value on blur or Enter, never a half-typed one. */
export function MinutesInput({ value, onCommit, label }: { value: number; onCommit: (minutes: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const minutes = Number(text);
    if (Number.isFinite(minutes) && minutes >= 0.5 && minutes <= 600) {
      const rounded = Math.round(minutes * 2) / 2;
      if (rounded !== value) onCommit(rounded);
      setText(String(rounded));
    } else {
      setText(String(value));
    }
  };
  return (
    <Input
      aria-label={label}
      type="number"
      min="0.5"
      step="0.5"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setText(String(value));
      }}
    />
  );
}

const WARN_OPTIONS = [
  { value: "default", label: "default" },
  { value: "60", label: "1 min" },
  { value: "120", label: "2 min" },
  { value: "180", label: "3 min" },
  { value: "300", label: "5 min" },
  { value: "0", label: "never" },
];

const ADVANCE_OPTIONS = [
  { value: "off", label: "Off: press Next" },
  { value: "30", label: "30 seconds after time up" },
  { value: "60", label: "1 minute after time up" },
  { value: "120", label: "2 minutes after time up" },
];

function ItemRow({
  item,
  index,
  onChange,
  onDelete,
  onMove,
}: {
  item: Item;
  index: number;
  onChange: (patch: Partial<Item>) => void;
  onDelete: () => void;
  onMove: (from: number, to: number) => void;
}) {
  const [open, setOpen] = useState(Boolean(item.note));
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className={`rounded-lg border bg-white p-2 ${dragOver ? "border-zinc-950" : "border-zinc-200"}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const from = Number(event.dataTransfer.getData("text/plan-item"));
        if (Number.isInteger(from) && from !== index) onMove(from, index);
      }}
    >
      <div className="grid grid-cols-[24px_1fr_88px_30px_36px] items-center gap-2">
        <span
          draggable
          onDragStart={(event) => event.dataTransfer.setData("text/plan-item", String(index))}
          className="flex cursor-grab justify-center text-zinc-400"
          aria-label={`Drag ${item.title} to reorder`}
          title="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </span>
        <Input aria-label={`Item ${index + 1} title`} value={item.title} onChange={(event) => onChange({ title: event.target.value })} />
        <div className="flex items-center gap-1">
          <MinutesInput label={`Item ${index + 1} minutes`} value={item.minutes} onCommit={(minutes) => onChange({ minutes })} />
          <span className="text-xs text-zinc-500">min</span>
        </div>
        <Button variant="ghost" size="icon" className="size-8" aria-label={open ? "Hide details" : "Show note and warning"} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="size-9 text-zinc-500" aria-label={`Delete ${item.title}`} onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      {open ? (
        <div className="mt-2 grid grid-cols-[24px_1fr_160px] items-center gap-2">
          <span />
          <Input aria-label={`Item ${index + 1} note`} placeholder="Note for the operator (not shown on stage)" value={item.note ?? ""} onChange={(event) => onChange({ note: event.target.value || undefined })} />
          <Select
            value={item.warnAtSeconds === undefined ? "default" : String(item.warnAtSeconds)}
            onValueChange={(value) => onChange({ warnAtSeconds: value === "default" ? undefined : Number(value) })}
          >
            <SelectTrigger aria-label={`Item ${index + 1} amber warning`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {WARN_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>Amber: {option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

export function PlanEditorDialog({
  state,
  open,
  onOpenChange,
}: {
  state: AppState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [plans, setPlans] = useState<Plan[]>(state.plans);
  // The plan being edited. This is not the active plan: only "Set as active plan" changes that.
  const [selectedId, setSelectedId] = useState(state.activePlanId);
  const [draft, setDraft] = useState<Plan | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Plan[] | null>(null);
  const activePlanId = state.activePlanId;
  const runningPlanId = isLiveView(state) ? state.plan.id : null;
  const plansKey = JSON.stringify(state.plans);

  // Only resync when the saved plans really change, not on every 250 ms state broadcast.
  useEffect(() => {
    if (!pending.current) setPlans(state.plans);
  }, [plansKey]);

  useEffect(() => {
    if (open) {
      setSelectedId(state.activePlanId);
      setDraft(null);
    }
  }, [open]);

  useEffect(() => {
    if (!draft) setDraft(plans.find((plan) => plan.id === selectedId) ?? plans[0] ?? null);
  }, [draft, plans, selectedId]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const save = (next: Plan[], nextActiveId = activePlanId) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    pending.current = null;
    setPlans(next);
    send({ type: "savePlans", plans: next, activePlanId: nextActiveId });
  };

  const flush = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (pending.current) {
      send({ type: "savePlans", plans: pending.current, activePlanId });
      pending.current = null;
    }
  };

  const updateDraft = (patch: Partial<Plan>) => {
    if (!draft) return;
    const next = { ...draft, ...patch, updatedAt: new Date().toISOString() };
    setDraft(next);
    const nextPlans = plans.map((plan) => (plan.id === next.id ? next : plan));
    setPlans(nextPlans);
    pending.current = nextPlans;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 400);
  };

  const select = (plan: Plan) => {
    flush();
    setSelectedId(plan.id);
    setDraft(plan);
  };

  const updateItem = (index: number, patch: Partial<Item>) => {
    if (!draft) return;
    updateDraft({ items: draft.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)) });
  };

  const moveItem = (from: number, to: number) => {
    if (!draft) return;
    const items = [...draft.items];
    const [moved] = items.splice(from, 1);
    if (!moved) return;
    items.splice(to, 0, moved);
    updateDraft({ items });
  };

  const deleteItem = (index: number) => {
    if (!draft) return;
    const removed = draft.items[index];
    if (!removed) return;
    updateDraft({ items: draft.items.filter((_, itemIndex) => itemIndex !== index) });
    toast.success(`Deleted ${removed.title}`, {
      duration: 10_000,
      action: {
        label: "Undo",
        onClick: () => setDraft((latest) => {
          if (!latest || latest.items.some((item) => item.id === removed.id)) return latest;
          const restored = { ...latest, items: [...latest.items.slice(0, index), removed, ...latest.items.slice(index)], updatedAt: new Date().toISOString() };
          setPlans((current) => {
            const nextPlans = current.map((plan) => (plan.id === restored.id ? restored : plan));
            send({ type: "savePlans", plans: nextPlans, activePlanId });
            return nextPlans;
          });
          return restored;
        }),
      },
    });
  };

  const addPlan = (plan: Plan, message?: string) => {
    flush();
    save([...plans, plan]);
    setSelectedId(plan.id);
    setDraft(plan);
    if (message) toast.success(message);
  };

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteMode, setPasteMode] = useState<"new" | "replace">("new");
  const openPaste = (text = "", mode: "new" | "replace" = "new") => {
    flush();
    setPasteText(text);
    setPasteMode(mode);
    setPasteOpen(true);
  };

  /** .json is a Service Timer file; .csv and .txt are running orders to check before saving. */
  const importFile = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((text) => {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".csv")) {
        const converted = csvToRunningOrderText(text);
        if (converted.error) toast.error(converted.error);
        else openPaste(converted.text);
        return;
      }
      if (!lower.endsWith(".json")) {
        openPaste(text);
        return;
      }
      let read: ReturnType<typeof readPlansFile> = null;
      try {
        read = readPlansFile(JSON.parse(text));
      } catch {
        read = null;
      }
      if (!read) {
        toast.error("That file isn't a Service Timer plan or backup.");
        return;
      }
      flush();
      const taken = plans.map((plan) => plan.name);
      const imported = read.plans.map((plan) => {
        const named = { ...plan, name: uniqueName(plan.name, taken) };
        taken.push(named.name);
        return named;
      });
      save([...plans, ...imported]);
      setSelectedId(imported[0]!.id);
      setDraft(imported[0]!);
      const label = imported.length === 1 ? `Imported ${imported[0]!.name}` : `Imported ${imported.length} plans`;
      toast.success(read.skipped ? `${label}. ${read.skipped} couldn't be read.` : label, {
        duration: 10_000,
        action: { label: "Undo", onClick: () => save(plans) },
      });
    });
  };

  const fileStem = (name: string) => name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "plan";

  const exportJson = () => {
    if (!draft) return;
    flush();
    download(`${fileStem(draft.name)}.json`, draft);
  };

  const backUpAll = () => {
    flush();
    const today = new Date();
    const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    download(`service-timer-backup-${stamp}.json`, { app: "Service Timer", version: 1, exportedAt: today.toISOString(), activePlanId, plans });
    toast.success(`Saved a backup of ${plans.length} plan${plans.length === 1 ? "" : "s"}`);
  };

  const applyImport = (target: ImportTarget) => {
    if (target.mode === "new") {
      addPlan({ ...target.plan, name: uniqueName(target.plan.name, plans.map((plan) => plan.name)) }, `Created ${target.plan.name} with ${target.plan.items.length} items`);
      return;
    }
    if (!draft) return;
    const before = draft;
    updateDraft({ items: target.items, ...(target.startTime ? { startTime: target.startTime } : {}) });
    toast.success(`Replaced the running order of ${before.name}`, {
      duration: 10_000,
      action: {
        label: "Undo",
        onClick: () => {
          setDraft(before);
          setPlans((current) => {
            const nextPlans = current.map((plan) => (plan.id === before.id ? before : plan));
            send({ type: "savePlans", plans: nextPlans, activePlanId });
            return nextPlans;
          });
        },
      },
    });
  };

  const deletePlan = () => {
    if (!draft || plans.length <= 1) return;
    if (draft.id === runningPlanId) {
      toast.error("This plan is running. Stop the service before deleting it.");
      return;
    }
    const removed = draft;
    const remaining = plans.filter((plan) => plan.id !== removed.id);
    const nextActiveId = removed.id === activePlanId ? remaining[0]!.id : activePlanId;
    save(remaining, nextActiveId);
    setSelectedId(remaining[0]!.id);
    setDraft(remaining[0]!);
    toast.success(`Deleted ${removed.name}`, {
      duration: 10_000,
      action: { label: "Undo", onClick: () => save([...remaining, removed], removed.id === activePlanId ? removed.id : nextActiveId) },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) flush(); onOpenChange(next); }}>
      <DialogContent side="right" aria-describedby="plans-description">
        <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-3 pr-12">
          <DialogTitle>Service plans</DialogTitle>
          <DialogDescription id="plans-description" className="mt-0 text-xs">
            Changes save automatically. The timer keeps running while you edit.
          </DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[230px] shrink-0 flex-col border-r border-zinc-200 p-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="default"
                onClick={() => addPlan({
                  id: `plan-${Date.now()}`,
                  name: "New plan",
                  startTime: "09:45",
                  days: [0],
                  autoStart: true,
                  items: [{ id: `item-${Date.now()}`, title: "Welcome", minutes: 5 }],
                  updatedAt: new Date().toISOString(),
                  kind: "recurring",
                })}
              >
                <Plus className="size-4" /> New
              </Button>
              <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-zinc-200 px-3 text-sm font-medium hover:bg-zinc-100" title="A Service Timer .json file or backup, or a .csv running order">
                <Upload className="size-4" /> Import
                <input className="hidden" type="file" aria-label="Import a file" accept=".json,.csv,.txt,application/json,text/csv,text/plain" onChange={(event) => { importFile(event.target.files?.[0]); event.target.value = ""; }} />
              </label>
            </div>
            <Button className="mt-2 w-full" onClick={() => openPaste()}>
              <ClipboardPaste className="size-4" /> Paste running order
            </Button>
            <div className="mt-3 grid min-h-0 gap-1 overflow-y-auto">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className={`rounded-lg px-3 py-2 text-left ${plan.id === draft?.id ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
                  onClick={() => select(plan)}
                >
                  <span className="flex flex-wrap items-center gap-1 text-sm font-semibold">
                    {plan.name}
                    {plan.id === activePlanId ? <Badge className="h-5 px-1.5 text-[10px]">Active</Badge> : null}
                    {plan.id === runningPlanId ? <Badge className="h-5 border-green-200 bg-green-50 px-1.5 text-[10px] text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">Running</Badge> : null}
                  </span>
                  <span className="block text-xs text-zinc-500">{plan.kind === "recurring" ? "Recurring" : "One-off"} · {plan.items.length} items</span>
                  <span className="block text-xs text-zinc-500">{nextRunLabel(plan)}</span>
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="mt-auto justify-start text-zinc-600" onClick={backUpAll} title="Save every plan to one file, for moving laptops or keeping a copy">
              <Download className="size-4" /> Back up all plans
            </Button>
          </aside>
          {draft ? (
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <label className="block text-sm font-medium">
                  Plan name
                  <Input className="mt-1 h-10 text-base font-semibold" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
                </label>
                <div className="mt-4 flex flex-wrap items-end gap-4">
                  <ToggleGroup type="single" value={draft.kind} onValueChange={(value) => value && updateDraft({ kind: value as Plan["kind"] })} className="flex gap-1">
                    <ToggleGroupItem value="recurring" className="h-9">Recurring</ToggleGroupItem>
                    <ToggleGroupItem value="oneOff" className="h-9">One-off date</ToggleGroupItem>
                  </ToggleGroup>
                  <label className="grid gap-1 text-sm font-medium">Start time
                    <Input type="time" className="w-[120px]" value={draft.startTime} onChange={(event) => event.target.value && updateDraft({ startTime: event.target.value })} />
                  </label>
                  {draft.kind === "oneOff" ? (
                    <label className="grid gap-1 text-sm font-medium">Date
                      <Input type="date" className="w-[160px]" value={draft.date ?? ""} onChange={(event) => updateDraft({ date: event.target.value })} />
                    </label>
                  ) : null}
                </div>
                {draft.kind === "recurring" ? (
                  <div className="mt-4">
                    <span className="mb-1 block text-sm font-medium">Days</span>
                    <div className="flex gap-1">
                      {DAY_NAMES.map((day, index) => (
                        <Button
                          key={day}
                          size="sm"
                          aria-pressed={draft.days.includes(index)}
                          variant={draft.days.includes(index) ? "default" : "outline"}
                          onClick={() => updateDraft({ days: draft.days.includes(index) ? draft.days.filter((value) => value !== index) : [...draft.days, index].sort() })}
                        >
                          {day}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={draft.autoStart} onCheckedChange={(checked) => updateDraft({ autoStart: checked })} />
                    Start automatically at {draft.startTime}
                  </label>
                  <label className="grid gap-1 text-sm font-medium">Move to the next item
                    <Select
                      value={draft.autoAdvanceSeconds === undefined ? "off" : String(draft.autoAdvanceSeconds)}
                      onValueChange={(value) => updateDraft({ autoAdvanceSeconds: value === "off" ? undefined : Number(value) })}
                    >
                      <SelectTrigger aria-label="Move to the next item"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ADVANCE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Running order</h3>
                  <span className="text-xs text-zinc-500">
                    {draft.items.length} items · {draft.items.reduce((sum, item) => sum + item.minutes, 0)} min · drag to reorder
                  </span>
                </div>
                <div className="mt-2 grid gap-2">
                  {draft.items.map((item, index) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      onChange={(patch) => updateItem(index, patch)}
                      onDelete={() => deleteItem(index)}
                      onMove={moveItem}
                    />
                  ))}
                  <Button
                    variant="outline"
                    className="border-dashed"
                    onClick={() => updateDraft({ items: [...draft.items, { id: `item-${Date.now()}`, title: "New item", minutes: 5 }] })}
                  >
                    <Plus className="size-4" /> Add item
                  </Button>
                </div>
              </div>
              <footer className="flex items-center gap-2 border-t border-zinc-200 px-5 py-3">
                <Button
                  variant="default"
                  disabled={draft.id === activePlanId || Boolean(runningPlanId)}
                  title={runningPlanId ? "You can change the active plan after the service" : undefined}
                  onClick={() => { flush(); save(plans, draft.id); toast.success(`${draft.name} is now the active plan`); }}
                >
                  {draft.id === activePlanId ? "Active plan" : "Set as active plan"}
                </Button>
                <Button onClick={() => addPlan({
                  ...draft,
                  id: `plan-${Date.now()}`,
                  name: `${draft.name} copy`,
                  items: draft.items.map((item, index) => ({ ...item, id: `item-${Date.now()}-${index}` })),
                  updatedAt: new Date().toISOString(),
                }, "Plan duplicated")}>Duplicate</Button>
                <Button onClick={exportJson} title="Save this plan to a .json file">Export</Button>
                <Button onClick={() => openPaste("", "replace")} title="Replace this plan's items from a pasted running order">Paste items</Button>
                <div className="flex-1" />
                <Button variant="ghost" className="text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950" disabled={plans.length <= 1} onClick={deletePlan}>
                  <Trash2 className="size-4" /> Delete plan
                </Button>
              </footer>
            </section>
          ) : null}
        </div>
        <RunningOrderImportDialog open={pasteOpen} onOpenChange={setPasteOpen} initialText={pasteText} initialMode={pasteMode} plans={plans} editing={draft} onImport={applyImport} />
      </DialogContent>
    </Dialog>
  );
}
