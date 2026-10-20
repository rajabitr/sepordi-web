import { fa } from "./utils";

/*
 * Dates arrive as RFC 3339 UTC. Everything a seller reads is Jalali in Asia/Tehran, whatever the server's zone.
 */

const ZONE = "Asia/Tehran";

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", { timeZone: ZONE, ...opts });

const DATE = fmt({ day: "numeric", month: "long", year: "numeric" });
const DATE_SHORT = fmt({ day: "numeric", month: "long" });
const WEEKDAY_DATE = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const NUMERIC = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });
const TIME = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const YEAR = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: ZONE, year: "numeric" });

const toDate = (v: string | number | Date) => (v instanceof Date ? v : new Date(v));

/** «۲۹ مهر ۱۴۰۵» */
export function formatDate(v: string | number | Date): string {
  return DATE.format(toDate(v));
}

/** «۲۹ مهر» */
export function formatDateShort(v: string | number | Date): string {
  return DATE_SHORT.format(toDate(v));
}

/** «چهارشنبه ۲۹ مهر ۱۴۰۵» */
export function formatDateWithWeekday(v: string | number | Date): string {
  return WEEKDAY_DATE.format(toDate(v));
}

/** «۱۴۰۵/۰۷/۲۹» */
export function formatDateNumeric(v: string | number | Date): string {
  return NUMERIC.format(toDate(v));
}

/** «۰۹:۴۵» */
export function formatTime(v: string | number | Date): string {
  return TIME.format(toDate(v));
}

/** «۲۹ مهر ۱۴۰۵، ساعت ۰۹:۴۵» */
export function formatDateTime(v: string | number | Date): string {
  return `${formatDate(v)}، ساعت ${formatTime(v)}`;
}

/** The Jalali year in Tehran as a number, e.g. 1405. */
export function jalaliYear(v: string | number | Date = new Date()): number {
  const part = YEAR.formatToParts(toDate(v)).find((p) => p.type === "year");
  return Number(part?.value);
}

/** «همین حالا»، «۵ دقیقه پیش»، «۳ ساعت پیش»، «دیروز»، «۴ روز پیش»، then the date. Future times read «تا ۲ ساعت دیگر». */
export function relativeTime(v: string | number | Date, now: Date = new Date()): string {
  const diff = Math.round((now.getTime() - toDate(v).getTime()) / 1000);
  const future = diff < 0;
  const s = Math.abs(diff);
  const say = (n: number, unit: string) => (future ? `${fa(n)} ${unit} دیگر` : `${fa(n)} ${unit} پیش`);
  if (s < 45) return future ? "چند لحظه دیگر" : "همین حالا";
  const m = Math.round(s / 60);
  if (m < 60) return say(m, "دقیقه");
  const h = Math.round(m / 60);
  if (h < 24) return say(h, "ساعت");
  const d = Math.round(h / 24);
  if (d === 1) return future ? "فردا" : "دیروز";
  if (d < 7) return say(d, "روز");
  return formatDate(v);
}
