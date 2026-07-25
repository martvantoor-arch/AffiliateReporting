/**
 * Datumhulp met echte tijdzone-ondersteuning. Alles wordt in de database als
 * UTC-instant bewaard, maar gegroepeerd op de kalenderdag zoals de gebruiker
 * die ziet — anders vallen avondtransacties op de verkeerde dag.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD zoals de kalender in `timeZone` het ziet. */
export function dayKey(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Het UTC-moment waarop deze kalenderdag in `timeZone` begint. */
export function startOfDay(day: string, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  // Eerste schatting alsof de zone UTC is, dan twee keer bijstellen — dat is
  // genoeg om ook zomertijd-overgangen goed te krijgen.
  let guess = Date.UTC(year, month - 1, date, 0, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const offset = offsetMs(new Date(guess), timeZone);
    guess = Date.UTC(year, month - 1, date, 0, 0, 0) - offset;
  }
  return new Date(guess);
}

/** Het UTC-moment net na het einde van deze kalenderdag. */
export function endOfDay(day: string, timeZone: string): Date {
  const next = addDays(day, 1);
  return new Date(startOfDay(next, timeZone).getTime() - 1);
}

export function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date) + amount * DAY_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

/** Alle dagen van `from` tot en met `to`. */
export function dayRange(from: string, to: string): string[] {
  const days: string[] = [];
  const total = daysBetween(from, to);
  for (let i = 0; i <= total; i += 1) days.push(addDays(from, i));
  return days;
}

export function todayKey(timeZone: string): string {
  return dayKey(new Date(), timeZone);
}

/* ------------------------------------------------------------------ *
 * Groeperen per week of maand voor de tijdreeks.
 * ------------------------------------------------------------------ */

export type Granularity = "day" | "week" | "month";

/** Maandag van de ISO-week waarin deze dag valt. */
export function weekStart(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  const weekday = utc.getUTCDay(); // 0 = zondag
  const shift = weekday === 0 ? -6 : 1 - weekday;
  return addDays(day, shift);
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function bucketKey(day: string, granularity: Granularity): string {
  if (granularity === "week") return weekStart(day);
  if (granularity === "month") return monthStart(day);
  return day;
}

/**
 * Bij een lange periode wordt een staaf per dag onleesbaar; dan groeperen we
 * automatisch per week of maand.
 */
export function suggestGranularity(totalDays: number): Granularity {
  if (totalDays <= 45) return "day";
  if (totalDays <= 400) return "week";
  return "month";
}

/* ------------------------------------------------------------------ *
 * Presets voor de periodekiezer.
 * ------------------------------------------------------------------ */

export const RANGE_PRESETS = [
  { id: "7d", label: "7 dagen" },
  { id: "30d", label: "30 dagen" },
  { id: "90d", label: "90 dagen" },
  { id: "mtd", label: "Deze maand" },
  { id: "prev-month", label: "Vorige maand" },
  { id: "ytd", label: "Dit jaar" },
  { id: "12m", label: "12 maanden" },
] as const;

export type RangePresetId = (typeof RANGE_PRESETS)[number]["id"];

export interface DayRange {
  from: string;
  to: string;
}

export function resolvePreset(preset: string, timeZone: string): DayRange {
  const today = todayKey(timeZone);
  switch (preset) {
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "mtd":
      return { from: monthStart(today), to: today };
    case "prev-month": {
      const firstOfThis = monthStart(today);
      const lastOfPrev = addDays(firstOfThis, -1);
      return { from: monthStart(lastOfPrev), to: lastOfPrev };
    }
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "12m":
      return { from: addDays(today, -364), to: today };
    case "30d":
    default:
      return { from: addDays(today, -29), to: today };
  }
}

/** Even lange periode direct vóór de huidige, voor de trendvergelijking. */
export function previousRange(range: DayRange): DayRange {
  const length = daysBetween(range.from, range.to) + 1;
  return {
    from: addDays(range.from, -length),
    to: addDays(range.from, -1),
  };
}

/* ------------------------------------------------------------------ *
 * Weergave
 * ------------------------------------------------------------------ */

const MONTHS_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MONTHS_LONG = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

export function formatDayShort(day: string): string {
  const [, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS_SHORT[Number(month) - 1]}`;
}

export function formatDayLong(day: string): string {
  const [year, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS_LONG[Number(month) - 1]} ${year}`;
}

export function formatMonth(day: string): string {
  const [year, month] = day.split("-");
  return `${MONTHS_SHORT[Number(month) - 1]} ${year.slice(2)}`;
}

export function formatBucket(bucket: string, granularity: Granularity): string {
  if (granularity === "month") return formatMonth(bucket);
  if (granularity === "week") return `wk ${formatDayShort(bucket)}`;
  return formatDayShort(bucket);
}

export function formatRange(range: DayRange): string {
  if (range.from === range.to) return formatDayLong(range.from);
  return `${formatDayShort(range.from)} – ${formatDayLong(range.to)}`;
}

/* ------------------------------------------------------------------ *
 * Interne helpers
 * ------------------------------------------------------------------ */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatterCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, cached);
  }
  return cached;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(date);
  const lookup: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = Number(part.value);
  }
  return {
    year: lookup.year ?? 1970,
    month: lookup.month ?? 1,
    day: lookup.day ?? 1,
    // Middernacht komt bij sommige zones als "24" terug.
    hour: (lookup.hour ?? 0) % 24,
    minute: lookup.minute ?? 0,
    second: lookup.second ?? 0,
  };
}

/** Hoeveel de zone op dat moment vóór UTC loopt, in milliseconden. */
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime() + (date.getTime() % 1000);
}
