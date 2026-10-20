import { en } from "./utils";

/**
 * An Iranian mobile in any common shape («۰۹۱۲ ۳۴۵ ۶۷۸۹», «+98 912…», «0098912…», «٩١٢…», «912…»)
 * as `09xxxxxxxxx`, or null when it is not one. Safe in the browser and on the server.
 */
export function normalizeMobile(input: string): string | null {
  let d = en(String(input ?? ""))
    .replace(/[\s‌‎‏()\-.]/g, "")
    .replace(/^\+/, "00");
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("0098")) d = d.slice(4);
  else if (d.startsWith("98") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^9\d{9}$/.test(d) ? `0${d}` : null;
}

/** E.164 (`+989…`) for APIs that want it, e.g. the Partner API's `owner.phone`. */
export function mobileToE164(normalized: string): string {
  return `+98${normalized.slice(1)}`;
}
