/**
 * Reads a running order the way churches share it: a WhatsApp message, a pasted list,
 * or a CSV file. It keeps item titles and works out minutes from the written times.
 * Names of who leads each item are left out. Anything it has to guess or fix is
 * reported as a notice, so the person importing can check it before saving.
 */

export type ParsedItem = { title: string; minutes: number };

export type ParsedRunningOrder = {
  /** ISO date (YYYY-MM-DD) if the text names one, such as "Sunday, November 22nd, 2026". */
  date?: string;
  /** "HH:MM" start of the first item, if the text has times. */
  startTime?: string;
  items: ParsedItem[];
  /** Things the reader fixed or wants checked, in plain words. */
  notices: string[];
  /** Lines that looked like items but couldn't be read. */
  unread: string[];
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_WORD = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DEFAULT_MINUTES = 5;
const MAX_ITEM_MINUTES = 240;

// One clock time as written: "11", "11.05", "11:05", "11.05am", "1pm", "12 noon".
const TIME = String.raw`(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|noon)?`;
const RANGE = new RegExp(String.raw`(?<![\d.:])${TIME}\s*(?:-|–|—|to|till|until)\s*${TIME}(?![\d])`, "i");

type Written = { hour: number; minute: number; suffix?: "am" | "pm"; text: string };

function readTime(hour: string, minute: string | undefined, suffix: string | undefined, text: string): Written | null {
  const h = Number(hour);
  const m = minute ? Number(minute) : 0;
  if (h > 23 || m > 59) return null;
  const s = suffix?.toLowerCase().replace(/\./g, "");
  return { hour: h, minute: m, suffix: s === "noon" ? "pm" : s === "am" || s === "pm" ? s : undefined, text: text.trim() };
}

function clockText(minutes: number): string {
  const day = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(day / 60);
  const m = day % 60;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}.${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

function hhmm(minutes: number): string {
  const day = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, "0")}:${String(day % 60).padStart(2, "0")}`;
}

/** The two readings of a written time: as morning and as afternoon/evening (24-hour times stand alone). */
function candidates(time: Written): number[] {
  if (time.hour > 12 || time.hour === 0) return [time.hour * 60 + time.minute];
  const base = (time.hour % 12) * 60 + time.minute;
  return [base, base + 720];
}

function withSuffix(time: Written, suffix: "am" | "pm"): number {
  return ((time.hour % 12) + (suffix === "pm" ? 12 : 0)) * 60 + time.minute;
}

const plausible = (minutes: number) => minutes >= 6 * 60 && minutes < 22 * 60;

/** The first time in the order: trust a written am/pm unless it would be the middle of the night. */
function firstStart(start: Written, end: Written | undefined): number {
  if (start.hour > 12) return start.hour * 60 + start.minute;
  const options = candidates(start).filter(plausible);
  const suffix = start.suffix ?? end?.suffix;
  if (suffix) {
    const chosen = withSuffix(start, suffix);
    if (plausible(chosen)) return chosen;
  }
  if (options.length === 1) return options[0]!;
  // 6 to 11 reads as morning, 12 to 5 as afternoon.
  return start.hour >= 6 && start.hour <= 11 ? withSuffix(start, "am") : withSuffix(start, "pm");
}

/** The reading of a time closest to where the service has got to. */
function nearest(time: Written, around: number): number {
  return candidates(time).reduce((best, option) => (Math.abs(option - around) < Math.abs(best - around) ? option : best));
}

/** The reading of an end time that comes soonest after its start. */
function soonestAfter(time: Written, start: number): number | null {
  const options = candidates(time).flatMap((option) => [option, option + 1440]).filter((option) => option > start && option - start <= MAX_ITEM_MINUTES);
  return options.length ? Math.min(...options) : null;
}

function suffixDisagrees(time: Written, minutes: number): boolean {
  if (!time.suffix || time.hour > 12) return false;
  return (time.suffix === "pm") !== (((minutes % 1440) + 1440) % 1440 >= 720);
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/^\s*(?:\d{1,2}\s*[.)]|[-•–·*]+)\s*/, "")
    .replace(/[\s:;,\-–—|]+$/, "")
    .replace(/^[\s:;,\-–—|]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFormatting(line: string): string {
  // WhatsApp bold, italic and strike-through markers, plus emoji-ish bullets.
  return line.replace(/[*_~`]/g, "").replace(/\u200e|\u200f/g, "").trim();
}

function readDate(line: string, now: Date): string | undefined {
  const text = line.toLowerCase();
  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;
  const monthFirst = new RegExp(`${MONTH_WORD}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4}))?`).exec(text);
  const dayFirst = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_WORD}\\.?,?(?:\\s+(\\d{4}))?`).exec(text);
  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(text);
  if (dayFirst) {
    day = Number(dayFirst[1]);
    month = MONTHS.indexOf(dayFirst[2]!.slice(0, 3));
    year = dayFirst[3] ? Number(dayFirst[3]) : undefined;
  } else if (monthFirst) {
    month = MONTHS.indexOf(monthFirst[1]!.slice(0, 3));
    day = Number(monthFirst[2]);
    year = monthFirst[3] ? Number(monthFirst[3]) : undefined;
  } else if (numeric) {
    // UK order: day/month/year.
    day = Number(numeric[1]);
    month = Number(numeric[2]) - 1;
    year = Number(numeric[3]);
  }
  if (day === undefined || month === undefined || month < 0) return undefined;
  if (year === undefined) {
    // No year: the next time that date comes round.
    year = now.getFullYear();
    if (new Date(year, month, day) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) year += 1;
  }
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return undefined;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Minutes written without clock times: "Sermon - 40 min", "Sermon 40", "40 Sermon", "Sermon (40 mins)". */
function readMinutesOnly(line: string): ParsedItem | null {
  const numbered = /^\s*\d{1,2}\s*[.)]\s*/.exec(line);
  const body = numbered ? line.slice(numbered[0].length) : line;
  const withUnit = /(\d+(?:\.\d+)?)\s*(?:mins?|minutes?|m)\b\.?/i.exec(body);
  if (withUnit) {
    const title = cleanTitle(body.slice(0, withUnit.index) + " " + body.slice(withUnit.index + withUnit[0].length));
    return title ? { title, minutes: Number(withUnit[1]) } : null;
  }
  const trailing = /^(.*?[^\d\s].*?)[\s,:\-–—]+(\d+(?:\.5)?)\s*$/.exec(body);
  if (trailing) {
    const title = cleanTitle(trailing[1]!);
    return title ? { title, minutes: Number(trailing[2]) } : null;
  }
  const leading = /^(\d+(?:\.5)?)\s+([^\d].*)$/.exec(body);
  if (leading && !numbered) {
    const title = cleanTitle(leading[2]!);
    return title ? { title, minutes: Number(leading[1]) } : null;
  }
  return null;
}

const roundMinutes = (minutes: number) => Math.min(600, Math.max(0.5, Math.round(minutes * 2) / 2));

export function parseRunningOrder(text: string, now = new Date()): ParsedRunningOrder {
  const notices: string[] = [];
  const unread: string[] = [];
  const items: ParsedItem[] = [];
  const numbers: number[] = [];
  let date: string | undefined;
  let firstStartMinutes: number | undefined;
  let lastWrittenEnd: number | undefined;
  /** Where the timer will be: the first start plus the minutes so far. */
  let runningClock: number | undefined;
  let previousTitle = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripFormatting(rawLine);
    if (!line) continue;
    const range = RANGE.exec(line);

    if (!range) {
      const loose = readMinutesOnly(line);
      if (loose && loose.minutes > 0 && loose.minutes <= MAX_ITEM_MINUTES) {
        items.push({ title: loose.title, minutes: roundMinutes(loose.minutes) });
        if (runningClock !== undefined) runningClock += loose.minutes;
        if (lastWrittenEnd !== undefined) lastWrittenEnd += loose.minutes;
        previousTitle = loose.title;
        continue;
      }
      if (!date) {
        const found = readDate(line, now);
        if (found) {
          date = found;
          continue;
        }
      }
      // A numbered line with no time is still an item; anything else is a heading.
      const numbered = /^\s*(\d{1,2})\s*[.)]\s*(.+)$/.exec(line);
      if (numbered) {
        const title = cleanTitle(numbered[2]!);
        if (title) {
          numbers.push(Number(numbered[1]));
          items.push({ title, minutes: DEFAULT_MINUTES });
          notices.push(`${title} has no time, so it's set to ${DEFAULT_MINUTES} min.`);
          if (runningClock !== undefined) runningClock += DEFAULT_MINUTES;
          if (lastWrittenEnd !== undefined) lastWrittenEnd += DEFAULT_MINUTES;
          previousTitle = title;
          continue;
        }
      }
      if (/^\s*\d{1,2}\s*[.)]/.test(line)) unread.push(rawLine.trim());
      continue;
    }

    const number = /^\s*(\d{1,2})\s*[.)]/.exec(line);
    if (number) numbers.push(Number(number[1]));
    const title = cleanTitle(line.slice(0, range.index)) || cleanTitle(line.slice(range.index + range[0].length)) || "Item";
    const start = readTime(range[1]!, range[2], range[3], range[0].split(/-|–|—|to|till|until/i)[0]!);
    const end = readTime(range[4]!, range[5], range[6], range[0].split(/-|–|—|to|till|until/i).pop()!);
    if (!start || !end) {
      unread.push(rawLine.trim());
      continue;
    }

    let startAt: number;
    if (lastWrittenEnd === undefined) {
      startAt = firstStart(start, end);
      firstStartMinutes = startAt;
      runningClock = startAt;
    } else {
      startAt = nearest(start, lastWrittenEnd);
    }
    if (suffixDisagrees(start, startAt)) notices.push(`${title}: read ${start.text} as ${clockText(startAt)}.`);
    const endAt = soonestAfter(end, startAt);
    if (endAt !== null && suffixDisagrees(end, endAt)) notices.push(`${title}: read ${end.text} as ${clockText(endAt)}.`);

    let minutes: number;
    if (lastWrittenEnd !== undefined && startAt < lastWrittenEnd - 30 && endAt !== null && endAt > lastWrittenEnd) {
      // Far earlier than the item before ended: almost always a typo in the start time.
      minutes = endAt - lastWrittenEnd;
      notices.push(`${title}: the start ${start.text} looks like a typo for ${clockText(lastWrittenEnd)}, so it's ${minutes} min.`);
      startAt = lastWrittenEnd;
    } else if (endAt === null) {
      minutes = DEFAULT_MINUTES;
      notices.push(`${title}: couldn't make sense of ${start.text} to ${end.text}, so it's set to ${DEFAULT_MINUTES} min.`);
    } else {
      minutes = endAt - startAt;
      if (lastWrittenEnd !== undefined && startAt < lastWrittenEnd) {
        notices.push(`${title} starts at ${clockText(startAt)}, before ${previousTitle} ends at ${clockText(lastWrittenEnd)}. Kept its ${minutes} min.`);
      } else if (lastWrittenEnd !== undefined && startAt > lastWrittenEnd) {
        notices.push(`Nothing is listed from ${clockText(lastWrittenEnd)} to ${clockText(startAt)} (${startAt - lastWrittenEnd} min, before ${title}). The timer runs items back to back, so add an item if something happens then.`);
      }
    }

    items.push({ title, minutes: roundMinutes(minutes) });
    lastWrittenEnd = endAt ?? startAt + minutes;
    if (runningClock !== undefined) runningClock += minutes;
    previousTitle = title;
  }

  // Numbering that skips or repeats often means an item was deleted or pasted twice.
  if (numbers.length > 2) {
    const repeated = [...new Set(numbers.filter((value, index) => numbers.indexOf(value) !== index))];
    const missing: number[] = [];
    for (let value = Math.min(...numbers); value <= Math.max(...numbers); value += 1) if (!numbers.includes(value)) missing.push(value);
    if (missing.length || repeated.length) {
      const parts = [missing.length ? `skips ${missing.join(", ")}` : "", repeated.length ? `has ${repeated.join(", ")} twice` : ""].filter(Boolean);
      notices.push(`The numbering ${parts.join(" and ")}. Check nothing is missing.`);
    }
  }

  if (firstStartMinutes !== undefined && lastWrittenEnd !== undefined && runningClock !== undefined && Math.round(runningClock) !== Math.round(lastWrittenEnd)) {
    notices.push(`The written times end at ${clockText(lastWrittenEnd)}; run back to back, these items end at ${clockText(runningClock)}.`);
  }

  return {
    ...(date ? { date } : {}),
    ...(firstStartMinutes !== undefined ? { startTime: hhmm(firstStartMinutes) } : {}),
    items,
    notices,
    unread,
  };
}

/** Split CSV text into rows, handling quoted fields with commas, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  const delimiter = !input.includes(",") && input.includes(";") ? ";" : ",";
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

/**
 * Turn a CSV with a header row into running-order text the reader understands.
 * Columns: Item (or Title/Activity), and either Minutes (or Duration) or Start and End.
 * Other columns, such as who leads the item, are ignored.
 */
export function csvToRunningOrderText(text: string): { text: string; error?: string } {
  const rows = parseCsv(text);
  if (!rows.length) return { text: "", error: "The file is empty." };
  const header = rows[0]!.map((cell) => cell.trim().toLowerCase());
  const find = (...names: string[]) => header.findIndex((cell) => names.some((name) => cell === name || cell.startsWith(name)));
  const title = find("item", "title", "activity", "programme", "program", "segment");
  const minutes = find("minutes", "mins", "duration", "length", "time (min");
  const start = find("start", "from", "begin");
  const end = find("end", "to", "finish", "until");
  if (title < 0 || (minutes < 0 && (start < 0 || end < 0))) {
    return { text: "", error: "The first row needs column names: Item, and either Minutes or Start and End." };
  }
  const lines = rows.slice(1).map((cells) => {
    const name = (cells[title] ?? "").trim();
    if (!name) return "";
    if (minutes >= 0 && (cells[minutes] ?? "").trim()) return `${name} - ${(cells[minutes] ?? "").trim().replace(/\s*(mins?|minutes?)$/i, "")} min`;
    if (start >= 0 && end >= 0) return `${name}: ${(cells[start] ?? "").trim()} - ${(cells[end] ?? "").trim()}`;
    return name;
  });
  return { text: lines.filter(Boolean).join("\n") };
}
