import { ChevronLeft, ChevronRight, ClipboardCopy, FileDown, Printer, Sheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ON_TIME_FINISH_MS,
  ON_TIME_START_MS,
  periodCharts,
  periodFor,
  periodRange,
  periodWhatsApp,
  shiftPeriod,
  summarisePeriod,
  type Period,
  type PeriodKind,
} from "../../shared/period-report";
import { minutesWords, type ServiceRecord } from "../../shared/report";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../shared/ui";
import { send } from "./common";

const ALL = "__all__";

function lateWords(ms: number) {
  return Math.abs(ms) < 60_000 ? "on time" : `${minutesWords(ms)} ${ms > 0 ? "late" : "early"}`;
}
function overWords(ms: number) {
  return Math.abs(ms) < 60_000 ? "on time" : `${minutesWords(ms)} ${ms > 0 ? "over" : "early"}`;
}

/** Monthly, quarterly or yearly report with charts. */
export function PeriodView({ kind, refreshKey }: { kind: PeriodKind; refreshKey: number }) {
  const [period, setPeriod] = useState<Period>(() => periodFor(kind));
  const [plan, setPlan] = useState<string>(ALL);
  const [records, setRecords] = useState<ServiceRecord[] | null>(null);

  useEffect(() => setPeriod(periodFor(kind)), [kind]);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = periodRange(period);
    setRecords(null);
    void window.api.getReportsBetween(from, to).then((loaded) => { if (!cancelled) setRecords(loaded); });
    return () => { cancelled = true; };
  }, [period, refreshKey]);

  const summary = useMemo(() => (records ? summarisePeriod(records, period, plan === ALL ? undefined : plan) : null), [records, period, plan]);
  const charts = useMemo(() => (summary && summary.services.length ? periodCharts(summary) : []), [summary]);
  const isCurrent = periodRange(period).to >= periodRange(periodFor(kind)).to;
  const n = summary?.services.length ?? 0;
  const exportAs = (format: "pdf" | "print" | "csv") => send({ type: "exportPeriod", period, planName: plan === ALL ? undefined : plan, format });

  const copy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(periodWhatsApp(summary));
      toast.success("Copied. Paste it into WhatsApp.");
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Period report">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-5 py-2.5">
        <Button variant="ghost" size="icon" className="size-8" aria-label="Earlier" onClick={() => setPeriod(shiftPeriod(period, -1))}><ChevronLeft className="size-4" /></Button>
        <h2 className="min-w-[220px] text-center text-base font-semibold" aria-live="polite">{summary?.label ?? ""}</h2>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Later" disabled={isCurrent} onClick={() => setPeriod(shiftPeriod(period, 1))}><ChevronRight className="size-4" /></Button>
        <div className="flex-1" />
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger className="h-8 w-[220px]" aria-label="Which services"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All services</SelectItem>
            {(summary?.planNames ?? []).map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 pr-8">
        {!summary ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : !n ? (
          <p className="py-16 text-center text-sm text-zinc-500">No services were recorded in {summary.label}. Short test runs are left out.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border border-zinc-200 p-3"><div className="text-xs text-zinc-500">Services</div><div className="text-xl font-semibold">{n}</div><div className="text-xs text-zinc-500">recorded</div></div>
              <div className="rounded-lg border border-zinc-200 p-3"><div className="text-xs text-zinc-500">Started on time</div><div className="text-xl font-semibold">{summary.startedOnTime} of {n}</div><div className="text-xs text-zinc-500">on average {lateWords(summary.avgLateMs)}</div></div>
              <div className="rounded-lg border border-zinc-200 p-3"><div className="text-xs text-zinc-500">Finished on time</div><div className={`text-xl font-semibold ${summary.finishedOnTime < n / 2 ? "text-red-700 dark:text-red-400" : ""}`}>{summary.finishedOnTime} of {n}</div><div className="text-xs text-zinc-500">on average {overWords(summary.avgOverMs)}</div></div>
              <div className="rounded-lg border border-zinc-200 p-3"><div className="text-xs text-zinc-500">Time over in total</div><div className="text-xl font-semibold">{minutesWords(summary.totalOverMs)}</div><div className="text-xs text-zinc-500">across {summary.label.replace(/ \(.*\)$/, "")}</div></div>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              On time means starting no more than {ON_TIME_START_MS / 60_000} min late and finishing no more than {ON_TIME_FINISH_MS / 60_000} min over the plan.
            </p>

            {charts.map((chart) => (
              <figure key={chart.id} className="mt-5 text-zinc-950" data-chart={chart.id} dangerouslySetInnerHTML={{ __html: chart.svg }} />
            ))}

            <h3 className="mt-6 text-sm font-semibold">Items</h3>
            <table className="mt-2 w-full text-sm" aria-label="Items over the period">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="py-1.5 pr-2">Item</th>
                  <th className="py-1.5 pr-2 text-right">Times</th>
                  <th className="py-1.5 pr-2 text-right">Planned</th>
                  <th className="py-1.5 pr-2 text-right">Average actual</th>
                  <th className="py-1.5 pr-2 text-right">Difference</th>
                  <th className="py-1.5 text-right">Ran over</th>
                </tr>
              </thead>
              <tbody>
                {summary.items.map((item) => {
                  const diff = Math.round(item.avgDiffMs / 60_000);
                  return (
                    <tr key={item.title} className="border-b border-zinc-100">
                      <td className="py-2 pr-2">{item.title}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{item.count}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{minutesWords(item.avgPlannedMs)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{minutesWords(item.avgActualMs)}</td>
                      <td className={`py-2 pr-2 text-right tabular-nums ${diff >= 1 ? "font-semibold text-red-700 dark:text-red-400" : diff <= -1 ? "text-green-700 dark:text-green-400" : ""}`}>{diff > 0 ? `+${diff} min` : diff < 0 ? `−${-diff} min` : "on time"}</td>
                      <td className="py-2 text-right tabular-nums">{item.timesOver} of {item.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-5 py-3">
        <Button variant="default" disabled={!n} onClick={() => void copy()}><ClipboardCopy className="size-4" /> Copy for WhatsApp</Button>
        <Button disabled={!n} onClick={() => exportAs("pdf")}><FileDown className="size-4" /> Save PDF</Button>
        <Button disabled={!n} onClick={() => exportAs("print")}><Printer className="size-4" /> Print…</Button>
        <Button disabled={!n} onClick={() => exportAs("csv")}><Sheet className="size-4" /> Save CSV</Button>
      </footer>
    </section>
  );
}
