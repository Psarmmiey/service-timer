import { describe, expect, it } from "vitest";
import { csvToRunningOrderText, parseCsv, parseRunningOrder } from "./running-order";

// Real running orders shared on the church WhatsApp group (names of who leads each item are dropped).
const NOV_22 = `*RCCG CITY OF GOD FOR ALL NATIONS STIRLING*

*Sunday, November 22nd, 2026*

1. Opening prayers: 11 - 11.05am *(Sis Mercy)*

2. Praise & Worship: 11.05 - 11.25am *(Choir)*

3. Welcome: 11.25 - 11.30am *(Dcn Dolapo)*

4. Bible Reading: 11.30am - 11.35am *(Sis Hilda)*

5. Hymn: 11.35am - 11.40am *(Choir)*

6. Introduction of Guestminister: 11.40am - 11.45am *(Pastor Victor)*

7. The Word: 11.45 - 12.30pm *(Pastor Swang)*

8. Brief Talk: 12.30pm - 12.40pm *(Sis Ama)*

9. Offering/Tithe: 12.40pm - 1pm *(Bro Adewale/Choir)*

10. Announcement: 1pm - 1.07pm *(Bro Lanre)*

11. Closing prayers: 1.07pm - 1.10pm *(Pastor Victor)*`;

const NOV_15 = `*RCCG CITY OF GOD FOR ALL NATIONS STIRLING*

*Sunday, November 15th, 2026*

1. Opening prayers: 11.05 - 11.10pm *(Bro Tayo)*

2. Praise & Worship: 11.10 - 11.30pm *(Choir)*

3. Welcome: 11.30 - 11.35 *(Dcn Dolapo)*

4. Bible Reading: 11.35 - 11.40am *(Sis Farah)*

5. Hymn: 11.35 - 11.40am *(Choir)*

6. The Word: 11.40 - 12.25pm *(Pastor Richard)*

8. Offering/Tithe: 12.40pm - 12.55pm *Dcn Adedayo/Choir*

8. Announcement: 12.55 - 1.02pm *(Dcn Michael)*

9. Closing prayers: 12.02pm - 1.05pm *(Pastor Victor)* `;

const now = new Date(2026, 10, 20);

describe("reading a WhatsApp running order", () => {
  it("reads the 22 November order exactly", () => {
    const order = parseRunningOrder(NOV_22, now);
    expect(order.date).toBe("2026-11-22");
    expect(order.startTime).toBe("11:00");
    expect(order.items).toEqual([
      { title: "Opening prayers", minutes: 5 },
      { title: "Praise & Worship", minutes: 20 },
      { title: "Welcome", minutes: 5 },
      { title: "Bible Reading", minutes: 5 },
      { title: "Hymn", minutes: 5 },
      { title: "Introduction of Guestminister", minutes: 5 },
      { title: "The Word", minutes: 45 },
      { title: "Brief Talk", minutes: 10 },
      { title: "Offering/Tithe", minutes: 20 },
      { title: "Announcement", minutes: 7 },
      { title: "Closing prayers", minutes: 3 },
    ]);
    // Everything adds up, so there is nothing to check.
    expect(order.notices).toEqual([]);
    expect(order.unread).toEqual([]);
  });

  it("never keeps the names of who leads each item", () => {
    const titles = parseRunningOrder(NOV_22, now).items.map((item) => item.title).join(" ");
    for (const name of ["Mercy", "Choir", "Dolapo", "Victor", "Swang", "Lanre"]) expect(titles).not.toContain(name);
    const nov15 = parseRunningOrder(NOV_15, now).items.map((item) => item.title).join(" ");
    expect(nov15).not.toContain("Adedayo");
  });

  it("fixes the 15 November typos and says what it changed", () => {
    const order = parseRunningOrder(NOV_15, now);
    expect(order.date).toBe("2026-11-15");
    // "11.05 - 11.10pm" is a morning service, not 11pm.
    expect(order.startTime).toBe("11:05");
    expect(order.items).toEqual([
      { title: "Opening prayers", minutes: 5 },
      { title: "Praise & Worship", minutes: 20 },
      { title: "Welcome", minutes: 5 },
      { title: "Bible Reading", minutes: 5 },
      { title: "Hymn", minutes: 5 },
      { title: "The Word", minutes: 45 },
      { title: "Offering/Tithe", minutes: 15 },
      { title: "Announcement", minutes: 7 },
      // "12.02pm - 1.05pm" after an item ending at 1.02pm: a typo, so 3 minutes, not 63.
      { title: "Closing prayers", minutes: 3 },
    ]);
    const notices = order.notices.join("\n");
    expect(notices).toContain("read 11.10pm as 11.10am");
    expect(notices).toContain("Hymn starts at 11.35am, before Bible Reading ends at 11.40am");
    expect(notices).toContain("Nothing is listed from 12.25pm to 12.40pm (15 min, before Offering/Tithe)");
    expect(notices).toContain("Closing prayers: the start 12.02pm looks like a typo for 1.02pm, so it's 3 min.");
    expect(notices).toContain("The numbering skips 7 and has 8 twice");
    expect(notices).toContain("The written times end at 1.05pm; run back to back, these items end at 12.55pm.");
  });

  it("reads plain lists with minutes instead of times", () => {
    const order = parseRunningOrder("Welcome and opening prayer 5\nPraise and worship - 20 min\nAnnouncements, 5\n10 Offering\nSermon (40 mins)\n6. Closing prayer 5", now);
    expect(order.startTime).toBeUndefined();
    expect(order.items).toEqual([
      { title: "Welcome and opening prayer", minutes: 5 },
      { title: "Praise and worship", minutes: 20 },
      { title: "Announcements", minutes: 5 },
      { title: "Offering", minutes: 10 },
      { title: "Sermon", minutes: 40 },
      { title: "Closing prayer", minutes: 5 },
    ]);
  });

  it("handles evening services, 24-hour times and noon", () => {
    expect(parseRunningOrder("Prayer meeting: 6.30 - 7pm\nBible study: 7 - 8pm", now)).toMatchObject({
      startTime: "18:30",
      items: [{ title: "Prayer meeting", minutes: 30 }, { title: "Bible study", minutes: 60 }],
    });
    expect(parseRunningOrder("Worship 18:00-18:20\nWord 18:20 - 19:05", now).items.map((item) => item.minutes)).toEqual([20, 45]);
    expect(parseRunningOrder("Sermon: 11.30 - 12 noon\nAltar call: 12 - 12.15", now).items.map((item) => item.minutes)).toEqual([30, 15]);
  });

  it("keeps a numbered item with no time and says so", () => {
    const order = parseRunningOrder("1. Welcome: 10 - 10.05am\n2. Testimonies\n3. Sermon: 10.10 - 10.50", now);
    expect(order.items.map((item) => item.title)).toEqual(["Welcome", "Testimonies", "Sermon"]);
    expect(order.items[1]!.minutes).toBe(5);
    expect(order.notices.join("\n")).toContain("Testimonies has no time");
  });

  it("reads dates written different ways", () => {
    expect(parseRunningOrder("Sunday 6th December 2026", now).date).toBe("2026-12-06");
    expect(parseRunningOrder("Sunday, 06/12/2026", now).date).toBe("2026-12-06");
    expect(parseRunningOrder("Sunday, 3rd January", now).date).toBe("2027-01-03");
  });
});

describe("reading a CSV running order", () => {
  it("reads quoted fields", () => {
    expect(parseCsv('Item,Minutes\n"Praise, worship",20\n"Say ""Amen""",1\n')).toEqual([["Item", "Minutes"], ["Praise, worship", "20"], ['Say "Amen"', "1"]]);
  });

  it("uses Item and Minutes, ignoring other columns", () => {
    const { text } = csvToRunningOrderText("Item,Minutes,Leader\nWelcome,5,Dcn Dolapo\nSermon,40 mins,Pastor\n");
    expect(parseRunningOrder(text, now).items).toEqual([{ title: "Welcome", minutes: 5 }, { title: "Sermon", minutes: 40 }]);
  });

  it("uses Start and End when there is no Minutes column", () => {
    const { text } = csvToRunningOrderText("Activity,Start,End\nOpening prayers,11:00,11:05\nThe Word,11:05,11:50\n");
    expect(parseRunningOrder(text, now)).toMatchObject({ startTime: "11:00", items: [{ title: "Opening prayers", minutes: 5 }, { title: "The Word", minutes: 45 }] });
  });

  it("explains a file without the right columns", () => {
    expect(csvToRunningOrderText("Name,Leader\nWelcome,Dolapo").error).toContain("Item, and either Minutes or Start and End");
  });
});
