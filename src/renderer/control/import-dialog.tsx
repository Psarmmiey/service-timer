import { AlertTriangle, ClipboardPaste } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Item, Plan } from "../../engine";
import { parseRunningOrder } from "../../shared/running-order";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, ToggleGroup, ToggleGroupItem } from "../shared/ui";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateParts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function nextSunday(now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((7 - now.getDay()) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function planNameFor(iso: string): string {
  const date = dateParts(iso);
  return `${WEEKDAYS[date.getDay()]} service, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h! * 60 + m! + Math.round(minutes)) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export type ImportTarget = { mode: "new"; plan: Plan } | { mode: "replace"; items: Item[]; startTime?: string };

/**
 * Paste a running order (usually the WhatsApp message) and turn it into a plan.
 * Shows what was read, and anything it fixed, before anything is saved.
 */
export function RunningOrderImportDialog({
  open,
  onOpenChange,
  initialText = "",
  initialMode = "new",
  plans,
  editing,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialText?: string;
  initialMode?: "new" | "replace";
  plans: Plan[];
  /** The plan open in the editor, whose running order can be replaced. */
  editing: Plan | null;
  onImport: (target: ImportTarget) => void;
}) {
  const [text, setText] = useState(initialText);
  const [mode, setMode] = useState<"new" | "replace">("new");
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setText(initialText);
      setMode(initialMode);
      setNameTouched(false);
    }
  }, [open, initialText, initialMode]);

  const parsed = useMemo(() => parseRunningOrder(text), [text]);

  // Follow the date in the text until the person picks one themselves.
  useEffect(() => {
    const chosen = parsed.date ?? nextSunday();
    setDate(chosen);
    if (!nameTouched) setName(planNameFor(chosen));
  }, [parsed.date]);

  const startTime = parsed.startTime ?? editing?.startTime ?? "11:00";
  let clock = startTime;
  const rows = parsed.items.map((item) => {
    const at = clock;
    clock = addMinutes(clock, item.minutes);
    return { ...item, at };
  });
  const total = parsed.items.reduce((sum, item) => sum + item.minutes, 0);
  const weekday = date ? dateParts(date).getDay() : -1;
  const overridden = plans.filter((plan) => plan.kind === "recurring" && plan.days.includes(weekday));
  const canImport = parsed.items.length > 0 && (mode === "replace" ? Boolean(editing) : Boolean(name.trim() && date));

  const submit = () => {
    const stamp = Date.now();
    const items: Item[] = parsed.items.map((item, index) => ({ id: `item-${stamp}-${index}`, title: item.title, minutes: item.minutes }));
    if (mode === "replace") {
      onImport({ mode: "replace", items, ...(parsed.startTime ? { startTime: parsed.startTime } : {}) });
    } else {
      onImport({
        mode: "new",
        plan: {
          id: `plan-${stamp}`,
          name: name.trim(),
          kind: "oneOff",
          date,
          days: [weekday],
          startTime,
          autoStart: editing?.autoStart ?? true,
          ...(editing?.autoAdvanceSeconds !== undefined ? { autoAdvanceSeconds: editing.autoAdvanceSeconds } : {}),
          items,
          updatedAt: new Date().toISOString(),
        },
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(680px,calc(100vh-48px))] w-[min(980px,calc(100vw-32px))] max-w-none flex-col gap-0 p-0">
        <div className="border-b border-zinc-200 px-5 py-3 pr-12">
          <DialogTitle className="flex items-center gap-2"><ClipboardPaste className="size-4" /> Paste a running order</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs">
            Paste the order of service as it was sent, for example the WhatsApp message. Names of who leads each item are left out.
          </DialogDescription>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2">
          <label className="flex min-h-0 flex-col border-r border-zinc-200 p-4">
            <span className="mb-1 text-sm font-medium">Running order</span>
            <textarea
              aria-label="Running order text"
              className="min-h-0 flex-1 resize-none rounded-md border border-zinc-200 bg-white p-3 font-mono text-xs leading-relaxed outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-950/10"
              placeholder={"1. Opening prayers: 11 - 11.05am (Sis Mercy)\n2. Praise & Worship: 11.05 - 11.25am (Choir)\n…\n\nor one item per line with minutes:\nWelcome 5\nSermon 40"}
              value={text}
              onChange={(event) => setText(event.target.value)}
              autoFocus
            />
          </label>
          <section className="flex min-h-0 flex-col p-4" aria-label="What was read">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">What the timer will use</span>
              <span className="text-xs text-zinc-500">{parsed.items.length ? `${parsed.items.length} items · ${total} min · ${startTime} to ${clock}` : ""}</span>
            </div>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-md border border-zinc-200">
              {rows.length ? (
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index} className="border-b border-zinc-100 last:border-0">
                        <td className="w-14 px-3 py-1.5 tabular-nums text-zinc-500">{row.at}</td>
                        <td className="px-1 py-1.5">{row.title}</td>
                        <td className="w-20 whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{row.minutes} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="p-4 text-sm text-zinc-500">Items appear here as you paste.</p>
              )}
            </div>
            {parsed.notices.length || parsed.unread.length ? (
              <div className="mt-3 max-h-[150px] overflow-y-auto rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status" aria-label="Please check">
                <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-3.5" /> Please check</div>
                <ul className="list-disc space-y-0.5 pl-4">
                  {parsed.notices.map((notice) => <li key={notice}>{notice}</li>)}
                  {parsed.unread.map((line) => <li key={line}>Couldn't read: {line}</li>)}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
        <footer className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-zinc-200 px-5 py-3">
          <ToggleGroup type="single" value={mode} onValueChange={(value) => value && setMode(value as "new" | "replace")} className="flex gap-1" aria-label="Where to put it">
            <ToggleGroupItem value="new" className="h-9">New plan for a date</ToggleGroupItem>
            <ToggleGroupItem value="replace" className="h-9" disabled={!editing}>Replace items in {editing?.name ?? "this plan"}</ToggleGroupItem>
          </ToggleGroup>
          {mode === "new" ? (
            <>
              <label className="grid gap-1 text-xs font-medium">Plan name
                <Input className="w-[220px]" value={name} onChange={(event) => { setName(event.target.value); setNameTouched(true); }} />
              </label>
              <label className="grid gap-1 text-xs font-medium">Date
                <Input type="date" className="w-[150px]" value={date} onChange={(event) => { setDate(event.target.value); if (!nameTouched && event.target.value) setName(planNameFor(event.target.value)); }} />
              </label>
            </>
          ) : null}
          <div className="flex basis-full items-center gap-2">
            <p className="flex-1 text-xs text-zinc-500">
              {mode === "new"
                ? `A one-off plan starting at ${startTime}${overridden.length ? `. On that day it runs instead of ${overridden.map((plan) => plan.name).join(", ")}` : ""}. You can still edit it afterwards.`
                : `The items in ${editing?.name ?? "this plan"} are replaced${parsed.startTime && editing && parsed.startTime !== editing.startTime ? ` and its start time becomes ${parsed.startTime}` : ""}. You can undo straight after.`}
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="default" disabled={!canImport} onClick={submit}>
              {mode === "new" ? "Create plan" : "Replace items"}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
