/**
 * Service reports: what actually happened in a service, against the plan.
 * Records are anonymous: they say whether something was done on the laptop, a phone or by
 * the timer itself, never who.
 */

export type ReportSource = "laptop" | "phone" | "timer";

export type StartMode = "onTime" | "automatic" | "catchUp" | "fromTop" | "fromItem";

export type RecordItem = {
  id: string;
  title: string;
  /** Minutes in the saved plan, or as added on the day. */
  plannedMinutes: number;
  /** Each stretch of time the item was the current item (more than one if someone went back). */
  runs: { from: number; to?: number }[];
  pausedMs: number;
  /** Time added (positive) or taken off (negative) with ±1 min and Custom. */
  adjustedMs: number;
  skipped?: boolean;
  addedOnTheDay?: boolean;
  removedOnTheDay?: boolean;
};

export type TimelineEntry = { at: number; text: string; by: ReportSource };

export type ServiceRecord = {
  version: 1;
  id: string;
  planId: string;
  planName: string;
  runDate: string;
  plannedStart: number;
  plannedFinish: number;
  startedAt: number;
  startMode: StartMode;
  endedAt?: number;
  ending?: "finished" | "stopped";
  /** While paused: when the pause began. */
  pausedSince?: number;
  items: RecordItem[];
  timeline: TimelineEntry[];
};

/** Light entry for the list of past services. */
export type ReportListEntry = {
  id: string;
  planName: string;
  runDate: string;
  startedAt: number;
  endedAt?: number;
  overMs?: number;
  test: boolean;
};

export type ReportRow = {
  title: string;
  plannedMs: number;
  actualMs: number;
  diffMs: number;
  status: "done" | "running" | "skipped" | "notReached" | "removed";
  addedOnTheDay: boolean;
  startedAt?: number;
};

export type ReportSummary = {
  title: string;
  date: string;
  plannedStart: number;
  startedAt: number;
  lateMs: number;
  startMode: StartMode;
  plannedFinish: number;
  endedAt?: number;
  /** Positive: finished late. Only once the service has ended. */
  overMs?: number;
  ending?: "finished" | "stopped";
  rows: ReportRow[];
  addedMs: number;
  takenOffMs: number;
  pausedMs: number;
  /** Shorter than five minutes: probably someone trying the timer out. */
  test: boolean;
  timeline: TimelineEntry[];
};

const MINUTE = 60_000;
export const TEST_RUN_MS = 5 * MINUTE;

export function itemActualMs(item: RecordItem, now: number): number {
  return item.runs.reduce((sum, run) => sum + Math.max(0, (run.to ?? now) - run.from), 0);
}

export function summarise(record: ServiceRecord, now = Date.now()): ReportSummary {
  const end = record.endedAt ?? now;
  const rows: ReportRow[] = record.items.map((item) => {
    const actualMs = itemActualMs(item, end);
    const plannedMs = item.plannedMinutes * MINUTE;
    const started = item.runs.length > 0;
    const status: ReportRow["status"] = item.removedOnTheDay && !started
      ? "removed"
      : item.skipped && !started
        ? "skipped"
        : !started
          ? "notReached"
          : item.runs.some((run) => run.to === undefined) && !record.endedAt
            ? "running"
            : "done";
    return { title: item.title, plannedMs, actualMs, diffMs: started ? actualMs - plannedMs : 0, status, addedOnTheDay: Boolean(item.addedOnTheDay), startedAt: item.runs[0]?.from };
  });
  // Items in the order they actually happened, then the ones that didn't.
  rows.sort((a, b) => (a.startedAt ?? Number.MAX_SAFE_INTEGER) - (b.startedAt ?? Number.MAX_SAFE_INTEGER));
  const adjusted = record.items.map((item) => item.adjustedMs);
  return {
    title: record.planName,
    date: record.runDate,
    plannedStart: record.plannedStart,
    startedAt: record.startedAt,
    lateMs: record.startedAt - record.plannedStart,
    startMode: record.startMode,
    plannedFinish: record.plannedFinish,
    endedAt: record.endedAt,
    overMs: record.endedAt !== undefined ? record.endedAt - record.plannedFinish : undefined,
    ending: record.ending,
    rows,
    addedMs: adjusted.filter((ms) => ms > 0).reduce((sum, ms) => sum + ms, 0),
    takenOffMs: -adjusted.filter((ms) => ms < 0).reduce((sum, ms) => sum + ms, 0),
    pausedMs: record.items.reduce((sum, item) => sum + item.pausedMs, 0),
    test: end - record.startedAt < TEST_RUN_MS,
    timeline: record.timeline,
  };
}

export function listEntry(record: ServiceRecord): ReportListEntry {
  const summary = summarise(record, record.endedAt ?? record.startedAt);
  return {
    id: record.id,
    planName: record.planName,
    runDate: record.runDate,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    overMs: summary.overMs,
    test: summary.test,
  };
}

// ---------- Formatting ----------

export function clock12(ms: number): string {
  const date = new Date(ms);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes}${hours < 12 ? "am" : "pm"}`;
}

/** 24:30, or 1:02:05 for an hour or more. */
export function duration(ms: number): string {
  const total = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Whole minutes for people: "12 min", "1 h 5 min", "under a minute". */
export function minutesWords(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / MINUTE);
  if (minutes === 0) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`;
}

/** +4:30 over, −2:00 under, with a real minus sign. */
export function signedDuration(ms: number): string {
  if (Math.abs(ms) < 30_000) return "on time";
  return `${ms > 0 ? "+" : "−"}${duration(ms)}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Sunday 29 November 2026" (written out, so it reads the same on every computer). */
export function longDate(runDate: string): string {
  const [year, month, day] = runDate.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  return `${WEEKDAYS[date.getDay()]} ${day} ${MONTHS[month! - 1]} ${year}`;
}

/** "13 min over", "5 min early", "On time": in words, so it can't be read as a clock time. */
export function overallWords(overMs: number): string {
  if (Math.abs(overMs) < 60_000) return "On time";
  return `${minutesWords(overMs)} ${overMs > 0 ? "over" : "early"}`;
}

export function startLine(summary: ReportSummary): string {
  const late = summary.lateMs;
  const when = Math.abs(late) < 60_000 ? "on time" : late > 0 ? `${minutesWords(late)} late` : `${minutesWords(late)} early`;
  return `Started ${clock12(summary.startedAt)} (${when})`;
}

export function finishLine(summary: ReportSummary): string {
  if (summary.endedAt === undefined || summary.overMs === undefined) return `Planned to finish ${clock12(summary.plannedFinish)}; still running`;
  const over = summary.overMs;
  const how = Math.abs(over) < 60_000 ? "on time" : over > 0 ? `${minutesWords(over)} over` : `${minutesWords(over)} early`;
  return `Finished ${clock12(summary.endedAt)} (${how}; planned ${clock12(summary.plannedFinish)})`;
}

function rowNote(row: ReportRow): string {
  if (row.status === "skipped") return "skipped";
  if (row.status === "notReached") return "not reached";
  if (row.status === "removed") return "removed on the day";
  const minutes = Math.round(row.actualMs / MINUTE);
  const diff = Math.round(row.diffMs / MINUTE);
  const base = `${minutes} min`;
  const extra = diff === 0 ? "" : diff > 0 ? ` (+${diff})` : ` (−${-diff})`;
  return `${base}${extra}${row.addedOnTheDay ? ", added on the day" : ""}`;
}

/** Short summary for pasting into WhatsApp (bold uses *asterisks*). */
export function toWhatsApp(summary: ReportSummary): string {
  const lines = [`*${summary.title}, ${longDate(summary.date)}*`, `${startLine(summary)}`, `${finishLine(summary)}`, ""];
  summary.rows.forEach((row, index) => lines.push(`${index + 1}. ${row.title}: ${rowNote(row)}`));
  const extras: string[] = [];
  if (summary.addedMs) extras.push(`Time added during the service: ${minutesWords(summary.addedMs)}`);
  if (summary.takenOffMs) extras.push(`Time taken off: ${minutesWords(summary.takenOffMs)}`);
  if (summary.pausedMs >= 60_000) extras.push(`Paused for ${minutesWords(summary.pausedMs)} in total`);
  if (extras.length) lines.push("", ...extras);
  lines.push("", "Minutes in brackets are over (+) or under (−) the plan.");
  return lines.join("\n");
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row per item, for a spreadsheet. */
export function toCsv(summary: ReportSummary): string {
  const header = ["Service", "Date", "Item", "Started", "Planned (min)", "Actual (min)", "Difference (min)", "Status"];
  const rows = summary.rows.map((row) => [
    summary.title,
    summary.date,
    row.title,
    row.startedAt ? clock12(row.startedAt) : "",
    (row.plannedMs / MINUTE).toFixed(1),
    row.status === "done" || row.status === "running" ? (row.actualMs / MINUTE).toFixed(1) : "",
    row.status === "done" || row.status === "running" ? (row.diffMs / MINUTE).toFixed(1) : "",
    row.status === "notReached" ? "not reached" : row.status === "removed" ? "removed on the day" : row.addedOnTheDay ? `${row.status}, added on the day` : row.status,
  ]);
  return [header, ...rows].map((cells) => cells.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

/** A one-page printable report (also used for PDF). */
export function toHtml(summary: ReportSummary): string {
  const rows = summary.rows.map((row, index) => {
    const ran = row.status === "done" || row.status === "running";
    const diffClass = !ran || Math.abs(row.diffMs) < 30_000 ? "" : row.diffMs > 0 ? "over" : "under";
    return `<tr><td>${index + 1}</td><td>${escapeHtml(row.title)}${row.addedOnTheDay ? ' <span class="tag">added on the day</span>' : ""}</td><td>${row.startedAt ? clock12(row.startedAt) : ""}</td><td class="num">${duration(row.plannedMs)}</td><td class="num">${ran ? duration(row.actualMs) : ""}</td><td class="num ${diffClass}">${ran ? signedDuration(row.diffMs) : row.status === "skipped" ? "skipped" : row.status === "removed" ? "removed" : "not reached"}</td></tr>`;
  }).join("");
  const extras = [
    summary.addedMs ? `Time added during the service: ${minutesWords(summary.addedMs)}.` : "",
    summary.takenOffMs ? `Time taken off: ${minutesWords(summary.takenOffMs)}.` : "",
    summary.pausedMs >= 60_000 ? `Paused for ${minutesWords(summary.pausedMs)} in total.` : "",
  ].filter(Boolean).join(" ");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${escapeHtml(summary.title)}, ${escapeHtml(longDate(summary.date))}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #18181b; font-size: 11pt; }
  h1 { font-size: 18pt; margin: 0 0 2pt; } .date { color: #52525b; margin: 0 0 12pt; }
  .facts { display: flex; gap: 24pt; margin-bottom: 12pt; } .facts div { font-size: 10pt; color: #52525b; } .facts b { display: block; font-size: 13pt; color: #18181b; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 5pt 6pt; border-bottom: 1px solid #e4e4e7; }
  th { font-size: 9pt; text-transform: uppercase; letter-spacing: .04em; color: #71717a; } .num { text-align: right; font-variant-numeric: tabular-nums; }
  .over { color: #b91c1c; font-weight: 600; } .under { color: #15803d; } .tag { font-size: 8pt; color: #71717a; }
  .extras { margin-top: 10pt; font-size: 10pt; } footer { margin-top: 18pt; font-size: 8pt; color: #a1a1aa; }
</style></head><body>
<h1>${escapeHtml(summary.title)}</h1><p class="date">${escapeHtml(longDate(summary.date))}</p>
<div class="facts"><div>Started<b>${clock12(summary.startedAt)}</b>${escapeHtml(startLine(summary).replace(/^Started \S+ /, ""))}</div>
<div>Finished<b>${summary.endedAt ? clock12(summary.endedAt) : "still running"}</b>${summary.endedAt ? `planned ${clock12(summary.plannedFinish)}` : ""}</div>
<div>Overall<b class="${summary.overMs !== undefined && summary.overMs >= 60_000 ? "over" : ""}">${summary.overMs === undefined ? "Still running" : overallWords(summary.overMs)}</b>against the planned finish</div></div>
<table><thead><tr><th>#</th><th>Item</th><th>Started</th><th class="num">Planned</th><th class="num">Actual</th><th class="num">Difference</th></tr></thead><tbody>${rows}</tbody></table>
${extras ? `<p class="extras">${escapeHtml(extras)}</p>` : ""}
<footer>Service Timer report. Over (+) and under (−) are against each item's planned time.</footer>
</body></html>`;
}
