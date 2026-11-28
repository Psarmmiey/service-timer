/**
 * Monthly, quarterly and yearly reports: many services summed up, with charts.
 * Charts are plain SVG strings, so the app and the PDF show exactly the same picture.
 */
import { clock12, longDate, minutesWords, summarise, type ServiceRecord } from "./report";

export type PeriodKind = "month" | "quarter" | "year";
export type Period = { kind: PeriodKind; year: number; /** Month 0 to 11, or quarter 0 to 3. Ignored for a year. */ index: number };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));
const MINUTE = 60_000;
/** Started on time: no more than this late. */
export const ON_TIME_START_MS = 2 * MINUTE;
/** Finished on time: no more than this over. */
export const ON_TIME_FINISH_MS = 5 * MINUTE;

export function periodFor(kind: PeriodKind, date = new Date()): Period {
  return { kind, year: date.getFullYear(), index: kind === "month" ? date.getMonth() : kind === "quarter" ? Math.floor(date.getMonth() / 3) : 0 };
}

export function shiftPeriod(period: Period, delta: number): Period {
  if (period.kind === "year") return { ...period, year: period.year + delta };
  const size = period.kind === "month" ? 12 : 4;
  const total = period.year * size + period.index + delta;
  return { ...period, year: Math.floor(total / size), index: ((total % size) + size) % size };
}

/** First and last day, as YYYY-MM-DD, inclusive. */
export function periodRange(period: Period): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const startMonth = period.kind === "month" ? period.index : period.kind === "quarter" ? period.index * 3 : 0;
  const months = period.kind === "month" ? 1 : period.kind === "quarter" ? 3 : 12;
  const endMonth = startMonth + months - 1;
  const lastDay = new Date(period.year, endMonth + 1, 0).getDate();
  return { from: `${period.year}-${pad(startMonth + 1)}-01`, to: `${period.year}-${pad(endMonth + 1)}-${pad(lastDay)}` };
}

export function periodLabel(period: Period): string {
  if (period.kind === "month") return `${MONTHS[period.index]} ${period.year}`;
  if (period.kind === "quarter") return `Q${period.index + 1} ${period.year} (${SHORT_MONTHS[period.index * 3]} to ${SHORT_MONTHS[period.index * 3 + 2]})`;
  return String(period.year);
}

export type ServiceStat = { id: string; date: string; planName: string; lateMs: number; overMs: number; durationMs: number; plannedDurationMs: number };
export type ItemStat = { title: string; count: number; avgPlannedMs: number; avgActualMs: number; avgDiffMs: number; timesOver: number; worstDiffMs: number };
export type MonthStat = { label: string; services: number; avgLateMs: number; avgOverMs: number };

export type PeriodSummary = {
  period: Period;
  label: string;
  planName?: string;
  services: ServiceStat[];
  items: ItemStat[];
  months: MonthStat[];
  startedOnTime: number;
  finishedOnTime: number;
  avgLateMs: number;
  avgOverMs: number;
  totalOverMs: number;
  /** Plans that ran in the period, for the filter. */
  planNames: string[];
};

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

/** Finished, non-test services in the period (and plan, if given), summed up. */
export function summarisePeriod(records: ServiceRecord[], period: Period, planName?: string): PeriodSummary {
  const { from, to } = periodRange(period);
  const inPeriod = records
    .filter((record) => record.endedAt !== undefined && record.runDate >= from && record.runDate <= to)
    .map((record) => ({ record, summary: summarise(record) }))
    .filter(({ summary }) => !summary.test);
  const planNames = [...new Set(inPeriod.map(({ record }) => record.planName))].sort();
  const chosen = inPeriod.filter(({ record }) => !planName || record.planName === planName).sort((a, b) => a.record.startedAt - b.record.startedAt);

  const services: ServiceStat[] = chosen.map(({ record, summary }) => ({
    id: record.id,
    date: record.runDate,
    planName: record.planName,
    lateMs: summary.lateMs,
    overMs: summary.overMs ?? 0,
    durationMs: (record.endedAt ?? record.startedAt) - record.startedAt,
    plannedDurationMs: record.plannedFinish - record.plannedStart,
  }));

  // The same item across services, matched by its title.
  const byTitle = new Map<string, { title: string; planned: number[]; actual: number[]; diffs: number[] }>();
  for (const { summary } of chosen) {
    for (const row of summary.rows) {
      if (row.status !== "done") continue;
      const key = row.title.trim().toLowerCase();
      const entry = byTitle.get(key) ?? { title: row.title.trim(), planned: [], actual: [], diffs: [] };
      entry.planned.push(row.plannedMs);
      entry.actual.push(row.actualMs);
      entry.diffs.push(row.diffMs);
      byTitle.set(key, entry);
    }
  }
  const items: ItemStat[] = [...byTitle.values()]
    .map((entry) => ({
      title: entry.title,
      count: entry.diffs.length,
      avgPlannedMs: average(entry.planned),
      avgActualMs: average(entry.actual),
      avgDiffMs: average(entry.diffs),
      timesOver: entry.diffs.filter((diff) => diff >= MINUTE).length,
      worstDiffMs: Math.max(...entry.diffs),
    }))
    .sort((a, b) => b.avgDiffMs - a.avgDiffMs);

  const months: MonthStat[] = [];
  if (period.kind !== "month") {
    const first = period.kind === "quarter" ? period.index * 3 : 0;
    const count = period.kind === "quarter" ? 3 : 12;
    for (let month = first; month < first + count; month += 1) {
      const prefix = `${period.year}-${String(month + 1).padStart(2, "0")}`;
      const inMonth = services.filter((service) => service.date.startsWith(prefix));
      months.push({ label: SHORT_MONTHS[month]!, services: inMonth.length, avgLateMs: average(inMonth.map((s) => s.lateMs)), avgOverMs: average(inMonth.map((s) => s.overMs)) });
    }
  }

  return {
    period,
    label: periodLabel(period),
    planName,
    services,
    items,
    months,
    startedOnTime: services.filter((service) => service.lateMs <= ON_TIME_START_MS).length,
    finishedOnTime: services.filter((service) => service.overMs <= ON_TIME_FINISH_MS).length,
    avgLateMs: average(services.map((service) => service.lateMs)),
    avgOverMs: average(services.map((service) => service.overMs)),
    totalOverMs: services.reduce((sum, service) => sum + Math.max(0, service.overMs), 0),
    planNames,
  };
}

// ---------- Charts (SVG) ----------

const RED = "#dc2626";
const GREEN = "#16a34a";
const GREY = "#a1a1aa";
const DARK = "#3f3f46";

function escapeXml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

/** Minutes either side of zero: "+7", "−3", "0". */
function signedMinutes(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  return minutes > 0 ? `+${minutes}` : minutes < 0 ? `−${-minutes}` : "0";
}

/**
 * Bars above and below a zero line: over in red, under (or early) in green, with the minutes
 * on each bar. Labels run along the bottom.
 */
export function signedBarChart(bars: { label: string; ms: number }[], options: { title: string; width?: number; height?: number; goodWhenNegative?: boolean }): string {
  const width = options.width ?? 960;
  const height = options.height ?? 230;
  const top = 34;
  const bottom = 40;
  const left = 36;
  const plotH = height - top - bottom;
  const maxAbs = Math.max(MINUTE * 5, ...bars.map((bar) => Math.abs(bar.ms)));
  const hasNegative = bars.some((bar) => bar.ms < 0);
  const zeroY = top + (hasNegative ? plotH / 2 : plotH);
  const scale = (hasNegative ? plotH / 2 : plotH) / maxAbs;
  const slot = (width - left - 8) / Math.max(1, bars.length);
  const barW = Math.min(46, slot * 0.6);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escapeXml(options.title)}" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif">`,
    `<text x="0" y="16" font-size="14" font-weight="600" fill="currentColor">${escapeXml(options.title)}</text>`,
    `<line x1="${left}" x2="${width}" y1="${zeroY}" y2="${zeroY}" stroke="${GREY}" stroke-width="1"/>`,
    `<text x="${left - 6}" y="${zeroY + 4}" font-size="10" text-anchor="end" fill="${GREY}">0</text>`,
  ];
  bars.forEach((bar, index) => {
    const x = left + slot * index + (slot - barW) / 2;
    const h = Math.max(1.5, Math.abs(bar.ms) * scale);
    const y = bar.ms >= 0 ? zeroY - h : zeroY;
    const colour = Math.abs(bar.ms) < MINUTE ? GREY : bar.ms > 0 ? RED : GREEN;
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${colour}"/>`);
    const valueY = bar.ms >= 0 ? y - 4 : y + h + 12;
    parts.push(`<text x="${(x + barW / 2).toFixed(1)}" y="${valueY.toFixed(1)}" font-size="11" font-weight="600" text-anchor="middle" fill="currentColor">${signedMinutes(bar.ms)}</text>`);
    parts.push(`<text x="${(x + barW / 2).toFixed(1)}" y="${height - 22}" font-size="10" text-anchor="middle" fill="${GREY}">${escapeXml(bar.label)}</text>`);
  });
  parts.push(`<text x="${width}" y="${height - 4}" font-size="10" text-anchor="end" fill="${GREY}">Minutes. Red is over (or late), green is under (or early).</text>`);
  parts.push("</svg>");
  return parts.join("");
}

/** For each item: planned (grey) and average actual (red if over, dark if not), side by side. */
export function itemChart(items: ItemStat[], options: { title: string; width?: number }): string {
  const width = options.width ?? 960;
  const rowH = 30;
  const top = 34;
  const labelW = 190;
  const shown = items.slice(0, 14);
  const height = top + shown.length * rowH + 26;
  const maxMs = Math.max(MINUTE * 5, ...shown.flatMap((item) => [item.avgPlannedMs, item.avgActualMs]));
  const scale = (width - labelW - 60) / maxMs;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escapeXml(options.title)}" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif">`,
    `<text x="0" y="16" font-size="14" font-weight="600" fill="currentColor">${escapeXml(options.title)}</text>`,
  ];
  shown.forEach((item, index) => {
    const y = top + index * rowH;
    const over = item.avgDiffMs >= MINUTE;
    const name = item.title.length > 28 ? `${item.title.slice(0, 27)}…` : item.title;
    parts.push(`<text x="${labelW - 8}" y="${y + 17}" font-size="12" text-anchor="end" fill="currentColor">${escapeXml(name)}</text>`);
    parts.push(`<rect x="${labelW}" y="${y + 3}" width="${(item.avgPlannedMs * scale).toFixed(1)}" height="9" rx="2" fill="${GREY}" opacity="0.6"/>`);
    parts.push(`<rect x="${labelW}" y="${y + 14}" width="${(item.avgActualMs * scale).toFixed(1)}" height="9" rx="2" fill="${over ? RED : DARK}"/>`);
    parts.push(`<text x="${(labelW + Math.max(item.avgPlannedMs, item.avgActualMs) * scale + 6).toFixed(1)}" y="${y + 17}" font-size="11" font-weight="600" fill="${over ? RED : "currentColor"}">${signedMinutes(item.avgDiffMs)}</text>`);
  });
  parts.push(`<rect x="${labelW}" y="${height - 16}" width="10" height="8" fill="${GREY}" opacity="0.6"/><text x="${labelW + 14}" y="${height - 8}" font-size="10" fill="${GREY}">Planned</text>`);
  parts.push(`<rect x="${labelW + 70}" y="${height - 16}" width="10" height="8" fill="${DARK}"/><text x="${labelW + 84}" y="${height - 8}" font-size="10" fill="${GREY}">Average actual (red when over by a minute or more)</text>`);
  parts.push("</svg>");
  return parts.join("");
}

/** The charts for a period, in the order they're shown. */
/** width: drawing width in pixels (about 960 for the app, 680 for an A4 page). */
export function periodCharts(summary: PeriodSummary, width = 960): { id: string; svg: string }[] {
  const shortDay = (date: string) => {
    const [, month, day] = date.split("-").map(Number);
    return `${day} ${SHORT_MONTHS[month! - 1]}`;
  };
  const charts = [
    { id: "finish", svg: signedBarChart(summary.services.map((s) => ({ label: shortDay(s.date), ms: s.overMs })), { title: "How far each service finished over or under the plan", width, height: width < 800 ? 185 : 230 }) },
    { id: "start", svg: signedBarChart(summary.services.map((s) => ({ label: shortDay(s.date), ms: s.lateMs })), { title: "How late (or early) each service started", width, height: width < 800 ? 185 : 230 }) },
  ];
  if (summary.months.length) {
    charts.push({ id: "months", svg: signedBarChart(summary.months.map((m) => ({ label: m.services ? m.label : `${m.label} (none)`, ms: m.avgOverMs })), { title: "Average finish over the plan, by month", width, height: width < 800 ? 185 : 230 }) });
  }
  if (summary.items.length) charts.push({ id: "items", svg: itemChart(summary.items, { title: "Each item: planned against average actual", width }) });
  return charts;
}

// ---------- Sharing ----------

function overWords(ms: number): string {
  return Math.abs(ms) < MINUTE ? "on time" : `${minutesWords(ms)} ${ms > 0 ? "over" : "early"}`;
}

function lateWords(ms: number): string {
  return Math.abs(ms) < MINUTE ? "on time" : `${minutesWords(ms)} ${ms > 0 ? "late" : "early"}`;
}

export function periodWhatsApp(summary: PeriodSummary): string {
  const n = summary.services.length;
  const lines = [`*Service report: ${summary.label}*${summary.planName ? ` (${summary.planName})` : ""}`];
  if (!n) return [...lines, "No services were recorded in this period."].join("\n");
  lines.push(
    `${n} service${n === 1 ? "" : "s"}`,
    `Started on time: ${summary.startedOnTime} of ${n} (on average ${lateWords(summary.avgLateMs)})`,
    `Finished on time: ${summary.finishedOnTime} of ${n} (on average ${overWords(summary.avgOverMs)})`,
  );
  const over = summary.items.filter((item) => item.avgDiffMs >= MINUTE).slice(0, 5);
  if (over.length) {
    lines.push("", "Items that ran over most:");
    for (const item of over) lines.push(`- ${item.title}: ${minutesWords(item.avgActualMs)} on average, planned ${minutesWords(item.avgPlannedMs)} (+${Math.round(item.avgDiffMs / MINUTE)})`);
  }
  lines.push("", `On time means starting no more than ${ON_TIME_START_MS / MINUTE} min late and finishing no more than ${ON_TIME_FINISH_MS / MINUTE} min over.`);
  return lines.join("\n");
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Every item in every service of the period, one row each, for a spreadsheet. */
export function periodCsv(records: ServiceRecord[], summary: PeriodSummary): string {
  const ids = new Set(summary.services.map((service) => service.id));
  const header = ["Date", "Service", "Service started", "Late (min)", "Finished over (min)", "Item", "Planned (min)", "Actual (min)", "Difference (min)", "Status"];
  const rows: (string | number)[][] = [];
  for (const record of records.filter((entry) => ids.has(entry.id)).sort((a, b) => a.startedAt - b.startedAt)) {
    const service = summarise(record);
    for (const row of service.rows) {
      const ran = row.status === "done";
      rows.push([
        record.runDate,
        record.planName,
        clock12(record.startedAt),
        (service.lateMs / MINUTE).toFixed(1),
        ((service.overMs ?? 0) / MINUTE).toFixed(1),
        row.title,
        (row.plannedMs / MINUTE).toFixed(1),
        ran ? (row.actualMs / MINUTE).toFixed(1) : "",
        ran ? (row.diffMs / MINUTE).toFixed(1) : "",
        row.status === "notReached" ? "not reached" : row.status,
      ]);
    }
  }
  return [header, ...rows].map((cells) => cells.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function periodHtml(summary: PeriodSummary): string {
  const n = summary.services.length;
  const charts = periodCharts(summary, 680).map((chart) => `<div class="chart">${chart.svg}</div>`).join("");
  const items = summary.items.map((item) => `<tr><td>${escapeXml(item.title)}</td><td class="num">${item.count}</td><td class="num">${minutesWords(item.avgPlannedMs)}</td><td class="num">${minutesWords(item.avgActualMs)}</td><td class="num ${item.avgDiffMs >= MINUTE ? "over" : item.avgDiffMs <= -MINUTE ? "under" : ""}">${signedMinutes(item.avgDiffMs)}</td><td class="num">${item.timesOver} of ${item.count}</td></tr>`).join("");
  const services = summary.services.map((s) => `<tr><td>${escapeXml(longDate(s.date))}</td><td>${escapeXml(s.planName)}</td><td class="num">${lateWords(s.lateMs)}</td><td class="num ${s.overMs > ON_TIME_FINISH_MS ? "over" : ""}">${overWords(s.overMs)}</td></tr>`).join("");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Service report: ${escapeXml(summary.label)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #18181b; font-size: 10.5pt; }
  h1 { font-size: 18pt; margin: 0; } .sub { color: #52525b; margin: 2pt 0 12pt; }
  .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-bottom: 12pt; }
  .facts div { border: 1px solid #e4e4e7; border-radius: 6pt; padding: 6pt 8pt; font-size: 9pt; color: #52525b; } .facts b { display: block; font-size: 14pt; color: #18181b; }
  .chart { margin: 8pt 0 14pt; break-inside: avoid; }
  h2 { font-size: 12pt; margin: 14pt 0 4pt; }
  table { width: 100%; border-collapse: collapse; break-inside: auto; } th, td { text-align: left; padding: 4pt 5pt; border-bottom: 1px solid #e4e4e7; }
  th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; color: #71717a; } .num { text-align: right; font-variant-numeric: tabular-nums; }
  .over { color: #b91c1c; font-weight: 600; } .under { color: #15803d; } footer { margin-top: 14pt; font-size: 8pt; color: #a1a1aa; }
</style></head><body>
<h1>Service report: ${escapeXml(summary.label)}</h1>
<p class="sub">${summary.planName ? escapeXml(summary.planName) : "All services"} · ${n} service${n === 1 ? "" : "s"}</p>
${n ? `<div class="facts">
  <div>Services<b>${n}</b>recorded</div>
  <div>Started on time<b>${summary.startedOnTime} of ${n}</b>on average ${escapeXml(lateWords(summary.avgLateMs))}</div>
  <div>Finished on time<b>${summary.finishedOnTime} of ${n}</b>on average ${escapeXml(overWords(summary.avgOverMs))}</div>
  <div>Time over in total<b>${escapeXml(minutesWords(summary.totalOverMs))}</b>across the period</div>
</div>
${charts}
<h2>Items</h2>
<table><thead><tr><th>Item</th><th class="num">Times</th><th class="num">Planned</th><th class="num">Average actual</th><th class="num">Difference</th><th class="num">Ran over</th></tr></thead><tbody>${items}</tbody></table>
<h2>Services</h2>
<table><thead><tr><th>Date</th><th>Plan</th><th class="num">Start</th><th class="num">Finish</th></tr></thead><tbody>${services}</tbody></table>` : "<p>No services were recorded in this period.</p>"}
<footer>Service Timer. On time means starting no more than ${ON_TIME_START_MS / MINUTE} min late and finishing no more than ${ON_TIME_FINISH_MS / MINUTE} min over. Test runs under 5 minutes are left out.</footer>
</body></html>`;
}
