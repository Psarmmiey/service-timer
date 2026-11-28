import { ChevronDown, ChevronRight, ClipboardCopy, FileDown, Printer, Sheet, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AppState } from "../../shared/ipc";
import {
  minutesWords,
  clock12,
  duration,
  finishLine,
  longDate,
  signedDuration,
  startLine,
  summarise,
  toWhatsApp,
  type ReportListEntry,
  type ReportSummary,
  type ServiceRecord,
} from "../../shared/report";
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogTitle, Switch } from "../shared/ui";
import { send } from "./common";

const START_WORDS: Record<ReportSummary["startMode"], string> = {
  onTime: "Started with Start",
  automatic: "Started automatically",
  catchUp: "Caught up with the clock",
  fromTop: "Started from the top",
  fromItem: "Started from a chosen item",
};

function overBadge(entry: Pick<ReportListEntry, "overMs" | "endedAt">) {
  if (entry.endedAt === undefined || entry.overMs === undefined) return <Badge className="h-5 border-green-200 bg-green-50 px-1.5 text-[10px] text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">Running</Badge>;
  const over = entry.overMs;
  if (Math.abs(over) < 60_000) return <Badge className="h-5 px-1.5 text-[10px]">On time</Badge>;
  return over > 0
    ? <Badge className="h-5 shrink-0 whitespace-nowrap border-red-200 bg-red-50 px-1.5 text-[10px] text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{minutesWords(over)} over</Badge>
    : <Badge className="h-5 shrink-0 whitespace-nowrap border-green-200 bg-green-50 px-1.5 text-[10px] text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">{minutesWords(over)} early</Badge>;
}

/** "Sun 29 Nov", with the year only when it isn't this year. */
function shortDate(runDate: string): string {
  const [weekday, day, month, year] = longDate(runDate).split(" ");
  return `${weekday!.slice(0, 3)} ${day} ${month!.slice(0, 3)}${Number(year) === new Date().getFullYear() ? "" : ` ${year}`}`;
}

/** Past services and what happened in each, with sharing for WhatsApp, PDF, print and CSV. */
export function ReportsDialog({ state, open, onOpenChange, openId }: { state: AppState; open: boolean; onOpenChange: (open: boolean) => void; openId?: string }) {
  const [showTests, setShowTests] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [record, setRecord] = useState<ServiceRecord | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const list = state.reports.filter((entry) => showTests || !entry.test || entry.id === selected);
  const listKey = state.reports.find((entry) => entry.id === selected);

  useEffect(() => {
    if (open) setSelected(openId ?? state.reports.find((entry) => !entry.test)?.id ?? state.reports[0]?.id);
  }, [open, openId]);

  // Load the chosen record; reload while it is still running so the numbers move.
  useEffect(() => {
    setConfirmDelete(false);
    if (!open || !selected) {
      setRecord(null);
      return;
    }
    let cancelled = false;
    void window.api.getReport(selected).then((loaded) => { if (!cancelled) setRecord(loaded); });
    return () => { cancelled = true; };
  }, [open, selected, listKey?.endedAt, listKey?.endedAt === undefined ? Math.floor(state.now / 10_000) : 0]);

  const summary = record ? summarise(record, state.now) : null;

  const copy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(toWhatsApp(summary));
      toast.success("Copied. Paste it into WhatsApp.");
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(640px,calc(100vh-48px))] w-[min(1040px,calc(100vw-32px))] max-w-none gap-0 p-0">
        <nav className="flex w-[260px] shrink-0 flex-col border-r border-zinc-200" aria-label="Past services">
          <div className="border-b border-zinc-200 px-4 py-3">
            <DialogTitle className="text-base">Service reports</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">What actually happened, against the plan.</DialogDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {list.length ? list.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelected(entry.id)}
                aria-current={entry.id === selected ? "true" : undefined}
                className={`mb-1 w-full rounded-lg px-3 py-2 text-left ${entry.id === selected ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                  <span className="truncate">{shortDate(entry.runDate)}</span>
                  {overBadge(entry)}
                </span>
                <span className="block truncate text-xs text-zinc-500">{entry.planName} · {clock12(entry.startedAt)}{entry.test ? " · test" : ""}</span>
              </button>
            )) : (
              <p className="p-3 text-sm text-zinc-500">No services yet. A report is made for every service the timer runs.</p>
            )}
          </div>
          <label className="flex items-center gap-2 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-600">
            <Switch checked={showTests} onCheckedChange={setShowTests} aria-label="Show test runs" /> Show test runs (under 5 min)
          </label>
        </nav>

        <section className="flex min-w-0 flex-1 flex-col" aria-label="Report">
          {summary && record ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-5 pr-12">
                <h2 className="text-lg font-semibold">{summary.title}</h2>
                <p className="text-sm text-zinc-500">{longDate(summary.date)}{summary.test ? " · test run" : ""}</p>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-zinc-200 p-3">
                    <div className="text-xs text-zinc-500">Started</div>
                    <div className="text-xl font-semibold tabular-nums">{clock12(summary.startedAt)}</div>
                    <div className="text-xs text-zinc-500">{startLine(summary).replace(/^Started \S+ /, "").replace(/[()]/g, "")} · {START_WORDS[summary.startMode]}</div>
                  </div>
                  <div className="rounded-lg border border-zinc-200 p-3">
                    <div className="text-xs text-zinc-500">Finished</div>
                    <div className="text-xl font-semibold tabular-nums">{summary.endedAt ? clock12(summary.endedAt) : "Running"}</div>
                    <div className="text-xs text-zinc-500">Planned {clock12(summary.plannedFinish)}{summary.ending === "stopped" ? " · stopped early" : ""}</div>
                  </div>
                  <div className="rounded-lg border border-zinc-200 p-3">
                    <div className="text-xs text-zinc-500">Against the plan</div>
                    <div className={`text-xl font-semibold tabular-nums ${summary.overMs !== undefined && summary.overMs >= 60_000 ? "text-red-700 dark:text-red-400" : ""}`}>
                      {summary.overMs === undefined ? "Still running" : signedDuration(summary.overMs)}
                    </div>
                    <div className="text-xs text-zinc-500">{finishLine(summary).replace(/^Finished \S+ /, "").replace(/[()]/g, "")}</div>
                  </div>
                </div>

                <table className="mt-5 w-full text-sm" aria-label="Items">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      <th className="py-1.5 pr-2">Item</th>
                      <th className="py-1.5 pr-2">Started</th>
                      <th className="py-1.5 pr-2 text-right">Planned</th>
                      <th className="py-1.5 pr-2 text-right">Actual</th>
                      <th className="py-1.5 text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((row, index) => {
                      const ran = row.status === "done" || row.status === "running";
                      const over = ran && row.diffMs >= 30_000;
                      const under = ran && row.diffMs <= -30_000;
                      return (
                        <tr key={`${row.title}-${index}`} className={`border-b border-zinc-100 ${ran ? "" : "text-zinc-400"}`}>
                          <td className="py-2 pr-2">
                            {row.title}
                            {row.addedOnTheDay ? <span className="ml-2 text-[11px] text-zinc-500">added on the day</span> : null}
                          </td>
                          <td className="py-2 pr-2 tabular-nums text-zinc-500">{row.startedAt ? clock12(row.startedAt) : ""}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{duration(row.plannedMs)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{ran ? duration(row.actualMs) : ""}</td>
                          <td className={`py-2 text-right tabular-nums ${over ? "font-semibold text-red-700 dark:text-red-400" : under ? "text-green-700 dark:text-green-400" : ""}`}>
                            {ran ? (row.status === "running" ? "running" : signedDuration(row.diffMs)) : row.status === "skipped" ? "skipped" : row.status === "removed" ? "removed" : "not reached"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-zinc-500">
                  {[
                    summary.addedMs ? `Time added during the service: ${minutesWords(summary.addedMs)}.` : "",
                    summary.takenOffMs ? `Time taken off: ${minutesWords(summary.takenOffMs)}.` : "",
                    summary.pausedMs >= 60_000 ? `Paused for ${minutesWords(summary.pausedMs)} in total.` : "",
                  ].filter(Boolean).join(" ")}
                </p>

                <button type="button" className="mt-4 flex items-center gap-1 text-sm font-semibold" onClick={() => setTimelineOpen(!timelineOpen)} aria-expanded={timelineOpen}>
                  {timelineOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} What happened ({summary.timeline.length})
                </button>
                {timelineOpen ? (
                  <ol className="mt-2 grid gap-1 text-sm" aria-label="What happened">
                    {summary.timeline.map((entry, index) => (
                      <li key={index} className="flex gap-3">
                        <span className="w-16 shrink-0 tabular-nums text-zinc-500">{clock12(entry.at)}</span>
                        <span className="flex-1">{entry.text}</span>
                        <span className="text-xs text-zinc-400">{entry.by === "timer" ? "automatic" : `on the ${entry.by}`}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
              <footer className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-5 py-3">
                <Button variant="default" onClick={() => void copy()}><ClipboardCopy className="size-4" /> Copy for WhatsApp</Button>
                <Button onClick={() => send({ type: "exportReport", id: record.id, format: "pdf" })}><FileDown className="size-4" /> Save PDF</Button>
                <Button onClick={() => send({ type: "exportReport", id: record.id, format: "print" })}><Printer className="size-4" /> Print…</Button>
                <Button onClick={() => send({ type: "exportReport", id: record.id, format: "csv" })}><Sheet className="size-4" /> Save CSV</Button>
                <div className="flex-1" />
                {record.endedAt === undefined ? null : confirmDelete ? (
                  <span className="flex items-center gap-2 text-xs">
                    Delete this report?
                    <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Keep</Button>
                    <Button size="sm" variant="destructive" onClick={() => { send({ type: "deleteReport", id: record.id }); setSelected(undefined); setConfirmDelete(false); }}>Delete</Button>
                  </span>
                ) : (
                  <Button variant="ghost" className="text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="size-4" /> Delete
                  </Button>
                )}
              </footer>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-zinc-500">
              {state.reports.length ? "Choose a service on the left." : "Reports appear here after the first service."}
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
