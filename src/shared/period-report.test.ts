import { describe, expect, it } from "vitest";
import { periodCsv, periodFor, periodHtml, periodLabel, periodRange, periodWhatsApp, shiftPeriod, summarisePeriod } from "./period-report";
import type { ServiceRecord } from "./report";

const MIN = 60_000;
const at = (date: string, hh: number, mm: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!, hh, mm).getTime();
};

/** A finished Sunday service: started `late` min late; The Word ran `word` min against 45. */
function sunday(date: string, late: number, word: number, planName = "Sunday service"): ServiceRecord {
  const start = at(date, 11, late);
  const prayersEnd = start + 5 * MIN;
  const wordEnd = prayersEnd + word * MIN;
  return {
    version: 1,
    id: `${date}-sunday-${start}`,
    planId: "sunday",
    planName,
    runDate: date,
    plannedStart: at(date, 11, 0),
    plannedFinish: at(date, 11, 50),
    startedAt: start,
    startMode: "fromTop",
    endedAt: wordEnd,
    ending: "finished",
    items: [
      { id: "p", title: "Opening prayers", plannedMinutes: 5, runs: [{ from: start, to: prayersEnd }], pausedMs: 0, adjustedMs: 0 },
      { id: "w", title: "The Word", plannedMinutes: 45, runs: [{ from: prayersEnd, to: wordEnd }], pausedMs: 0, adjustedMs: 0 },
    ],
    timeline: [],
  };
}

const records = [
  sunday("2026-11-01", 0, 45),
  sunday("2026-11-08", 5, 52),
  sunday("2026-11-15", 1, 50),
  sunday("2026-11-22", 3, 55),
  sunday("2026-10-25", 0, 45),
  sunday("2026-11-25", 0, 40, "Midweek service"),
  // A two-minute test run: left out.
  { ...sunday("2026-11-29", 0, 45), endedAt: at("2026-11-29", 11, 2) },
];

describe("periods", () => {
  it("steps through months, quarters and years", () => {
    const november = periodFor("month", new Date(2026, 10, 28));
    expect(periodLabel(november)).toBe("November 2026");
    expect(periodLabel(shiftPeriod(november, 2))).toBe("January 2027");
    expect(periodRange(november)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    const q4 = periodFor("quarter", new Date(2026, 10, 28));
    expect(periodLabel(q4)).toBe("Q4 2026 (Oct to Dec)");
    expect(periodRange(shiftPeriod(q4, -4))).toEqual({ from: "2025-10-01", to: "2025-12-31" });
    expect(periodRange(periodFor("year", new Date(2028, 1, 1)))).toEqual({ from: "2028-01-01", to: "2028-12-31" });
    expect(periodRange({ kind: "month", year: 2028, index: 1 }).to).toBe("2028-02-29");
  });
});

describe("period summary", () => {
  it("sums up a month of Sunday services", () => {
    const summary = summarisePeriod(records, periodFor("month", new Date(2026, 10, 1)), "Sunday service");
    expect(summary.services.map((s) => s.date)).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22"]);
    expect(summary.startedOnTime).toBe(2); // 0 and 1 min late; 5 and 3 are late
    expect(summary.finishedOnTime).toBe(1); // over by 0, 12, 6 and 13 min: only the first is within 5
    const word = summary.items.find((item) => item.title === "The Word")!;
    expect(word.count).toBe(4);
    expect(word.avgActualMs).toBe(50.5 * MIN);
    expect(word.timesOver).toBe(3);
    expect(summary.items[0]!.title).toBe("The Word");
    expect(summary.planNames).toEqual(["Midweek service", "Sunday service"]);
  });

  it("shows every month of a quarter, including empty ones", () => {
    const summary = summarisePeriod(records, periodFor("quarter", new Date(2026, 10, 1)));
    expect(summary.months.map((m) => [m.label, m.services])).toEqual([["Oct", 1], ["Nov", 5], ["Dec", 0]]);
    expect(summary.services).toHaveLength(6);
  });

  it("writes WhatsApp text, CSV and a printable page with charts", () => {
    const summary = summarisePeriod(records, periodFor("month", new Date(2026, 10, 1)), "Sunday service");
    const text = periodWhatsApp(summary);
    expect(text).toContain("*Service report: November 2026* (Sunday service)");
    expect(text).toContain("Started on time: 2 of 4");
    expect(text).toContain("- The Word: 51 min on average, planned 45 min (+6)");
    const csv = periodCsv(records, summary).trim().split("\r\n");
    expect(csv).toHaveLength(1 + 4 * 2);
    expect(csv[1]).toMatch(/^2026-11-01,Sunday service,11:00am,0\.0,0\.0,Opening prayers,5\.0,5\.0,0\.0,done$/);
    const html = periodHtml(summary);
    expect(html.match(/<svg /g)).toHaveLength(3);
    expect(html).toContain("How far each service finished over or under the plan");
  });

  it("says so when nothing was recorded", () => {
    const empty = summarisePeriod(records, periodFor("month", new Date(2027, 0, 1)));
    expect(empty.services).toHaveLength(0);
    expect(periodWhatsApp(empty)).toContain("No services were recorded in this period.");
    expect(periodHtml(empty)).not.toContain("<svg");
  });
});
