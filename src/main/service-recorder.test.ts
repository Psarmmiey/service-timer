import { describe, expect, it } from "vitest";
import { createIdleState, reduce, type Command, type Plan, type RunState } from "../engine";
import { listEntry, summarise, toCsv, toHtml, toWhatsApp, type ReportSource, type ServiceRecord } from "../shared/report";
import { observe } from "./service-recorder";

const plan: Plan = {
  id: "sunday",
  name: "Sunday service",
  startTime: "11:00",
  days: [0],
  autoStart: false,
  kind: "recurring",
  updatedAt: "2026-11-26T00:00:00Z",
  items: [
    { id: "prayer", title: "Opening prayers", minutes: 5 },
    { id: "worship", title: "Praise & Worship", minutes: 20 },
    { id: "talk", title: "Brief Talk", minutes: 10 },
    { id: "word", title: "The Word", minutes: 45 },
    { id: "closing", title: "Closing prayers", minutes: 5 },
  ],
};
const at = (hh: number, mm: number, ss = 0) => new Date(2026, 10, 29, hh, mm, ss).getTime();

/** Drive the engine and the recorder together, the way the app does. */
class Service {
  state: RunState = createIdleState(plan, "2026-11-29");
  record: ServiceRecord | null = null;
  run(command: Command, now: number, source: ReportSource = "laptop") {
    const before = this.state;
    this.state = reduce(this.state, command, now, plan);
    this.record = observe(this.record, before, this.state, plan, now, { source, command });
    return this;
  }
}

function playSunday() {
  const service = new Service();
  service
    .run({ type: "startChoice", mode: "fromTop" }, at(11, 3)) // 3 min late
    .run({ type: "next" }, at(11, 8)) // prayers 5:00
    .run({ type: "adjust", ms: 120_000 }, at(11, 20), "phone") // +2 min to worship
    .run({ type: "pause" }, at(11, 25))
    .run({ type: "resume" }, at(11, 26)) // 1 min paused
    .run({ type: "removeUpcoming", index: 2 }, at(11, 27), "phone") // Brief Talk taken out
    .run({ type: "insertAfterCurrent", item: { id: "testimony", title: "Testimony", minutes: 4 } }, at(11, 28))
    .run({ type: "message", text: "Please wrap up" }, at(11, 29))
    .run({ type: "next" }, at(11, 32)) // worship 24:00
    .run({ type: "next" }, at(11, 37)) // testimony 5:00
    .run({ type: "next" }, at(12, 30)) // the word 53:00
    .run({ type: "stop" }, at(12, 34)); // closing 4:00, stopped
  return service;
}

describe("service recorder", () => {
  it("starts a record when the service starts, with the lateness and how it started", () => {
    const service = new Service().run({ type: "startChoice", mode: "fromTop" }, at(11, 3));
    expect(service.record).toMatchObject({ planName: "Sunday service", runDate: "2026-11-29", startMode: "fromTop", startedAt: at(11, 3), plannedStart: at(11, 0) });
    expect(service.record!.items.map((item) => item.title)).toEqual(plan.items.map((item) => item.title));
  });

  it("records what really happened to each item", () => {
    const record = playSunday().record!;
    const summary = summarise(record);
    expect(summary.endedAt).toBe(at(12, 34));
    expect(summary.ending).toBe("stopped");
    expect(summary.lateMs).toBe(3 * 60_000);
    const rows = Object.fromEntries(summary.rows.map((row) => [row.title, row]));
    expect(rows["Opening prayers"]).toMatchObject({ actualMs: 5 * 60_000, diffMs: 0, status: "done" });
    expect(rows["Praise & Worship"]).toMatchObject({ actualMs: 24 * 60_000, diffMs: 4 * 60_000 });
    expect(rows["Testimony"]).toMatchObject({ actualMs: 5 * 60_000, addedOnTheDay: true });
    expect(rows["The Word"]).toMatchObject({ actualMs: 53 * 60_000, diffMs: 8 * 60_000 });
    expect(rows["Brief Talk"]!.status).toBe("removed");
    expect(rows["Closing prayers"]).toMatchObject({ actualMs: 4 * 60_000, status: "done" });
    expect(summary.addedMs).toBe(120_000);
    expect(summary.pausedMs).toBe(60_000);
    // In the order they happened, removed items last.
    expect(summary.rows.map((row) => row.title)).toEqual(["Opening prayers", "Praise & Worship", "Testimony", "The Word", "Closing prayers", "Brief Talk"]);
  });

  it("keeps a plain timeline, saying laptop or phone but never who", () => {
    const record = playSunday().record!;
    const texts = record.timeline.map((entry) => `${entry.by}: ${entry.text}`);
    expect(texts).toContain("phone: Added 2 min to Praise & Worship");
    expect(texts).toContain("laptop: Paused Praise & Worship");
    expect(texts).toContain("phone: Removed Brief Talk for today");
    expect(texts).toContain("laptop: Message: Please wrap up");
    expect(texts.at(-1)).toBe("laptop: Service stopped");
    expect(JSON.stringify(record)).not.toMatch(/Ada|Tolu|Timing check/);
  });

  it("counts every stretch when someone goes back to an item", () => {
    const service = new Service()
      .run({ type: "startChoice", mode: "fromTop" }, at(11, 0))
      .run({ type: "next" }, at(11, 5))
      .run({ type: "previous" }, at(11, 6))
      .run({ type: "next" }, at(11, 8));
    const prayers = service.record!.items.find((item) => item.id === "prayer")!;
    expect(prayers.runs).toEqual([{ from: at(11, 0), to: at(11, 5) }, { from: at(11, 6), to: at(11, 8) }]);
    expect(service.record!.timeline.map((entry) => entry.text)).toContain("Went back to Opening prayers");
  });

  it("does not record anything before the service starts", () => {
    const service = new Service().run({ type: "message", text: "Welcome" }, at(10, 50)).run({ type: "tick" }, at(10, 55), "timer");
    expect(service.record).toBeNull();
  });

  it("marks very short runs as tests", () => {
    const service = new Service().run({ type: "startChoice", mode: "fromTop" }, at(11, 0)).run({ type: "stop" }, at(11, 2));
    expect(listEntry(service.record!).test).toBe(true);
    expect(listEntry(playSunday().record!).test).toBe(false);
  });
});

describe("report outputs", () => {
  it("says long times in hours and minutes", async () => {
    const { minutesWords } = await import("../shared/report");
    expect(minutesWords(20_000)).toBe("under a minute");
    expect(minutesWords(12 * 60_000)).toBe("12 min");
    expect(minutesWords(65 * 60_000)).toBe("1 h 5 min");
    expect(minutesWords(120 * 60_000)).toBe("2 h");
    const { overallWords } = await import("../shared/report");
    expect(overallWords(13 * 60_000)).toBe("13 min over");
    expect(overallWords(-5 * 60_000)).toBe("5 min early");
    expect(overallWords(20_000)).toBe("On time");
  });

  const summary = () => summarise(playSunday().record!);

  it("writes a WhatsApp summary", () => {
    const text = toWhatsApp(summary());
    expect(text).toContain("*Sunday service, Sunday 29 November 2026*");
    expect(text).toContain("Started 11:03am (3 min late)");
    expect(text).toContain("Finished 12:34pm (");
    expect(text).toContain("2. Praise & Worship: 24 min (+4)");
    expect(text).toContain("3. Testimony: 5 min (+1), added on the day");
    expect(text).toContain("6. Brief Talk: removed on the day");
    expect(text).toContain("Time added during the service: 2 min");
    expect(text.match(/added on the day/g)).toHaveLength(1);
  });

  it("writes a CSV with one row per item", () => {
    const lines = toCsv(summary()).trim().split("\r\n");
    expect(lines[0]).toBe("Service,Date,Item,Started,Planned (min),Actual (min),Difference (min),Status");
    expect(lines).toContain("Sunday service,2026-11-29,Praise & Worship,11:08am,20.0,24.0,4.0,done");
    expect(lines).toHaveLength(7);
  });

  it("writes a printable page with escaped text", () => {
    const html = toHtml(summary());
    expect(html).toContain("<h1>Sunday service</h1>");
    expect(html).toContain("Praise &amp; Worship");
    expect(html).toContain("@page { size: A4");
    expect(html).toContain("9 min over");
  });
});
