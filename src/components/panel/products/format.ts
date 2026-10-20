/*
 * Jalali dates for the panel, pinned to Asia/Tehran so the server render and the browser agree (a hydration
 * mismatch otherwise, whenever the two clocks sit in different zones).
 */

const DATE_TIME = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
  timeZone: "Asia/Tehran",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DATE = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
  timeZone: "Asia/Tehran",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** «۲۸ مهر ۱۴۰۵ ساعت ۱۳:۳۵»; empty for a missing or unreadable value. */
export function jalaliDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATE_TIME.format(d);
}

/** «۲۸ مهر ۱۴۰۵». */
export function jalaliDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATE.format(d);
}
