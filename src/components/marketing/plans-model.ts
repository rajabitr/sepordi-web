import { faNumber } from "@/lib/utils";

export type PlanCode = "free" | "bronze" | "silver" | "gold";

/** One entry of the admin-owned `plans` setting. */
export interface PlanSetting {
  code: PlanCode;
  name: string;
  price_toman: number | null;
  replies_estimate: number;
  discount_percent: number;
  highlight: boolean;
}

export interface SupportSetting {
  phone: string;
  telegram: string;
  email: string;
  hours: string;
}

const ORDER: PlanCode[] = ["free", "bronze", "silver", "gold"];

/** Shown while the admin has not published the `plans` setting: names only, every price «به‌زودی». */
export const PLACEHOLDER_PLANS: PlanSetting[] = [
  { code: "free", name: "رایگان", price_toman: null, replies_estimate: 0, discount_percent: 0, highlight: false },
  { code: "bronze", name: "برنزی", price_toman: null, replies_estimate: 0, discount_percent: 0, highlight: false },
  { code: "silver", name: "نقره‌ای", price_toman: null, replies_estimate: 0, discount_percent: 0, highlight: true },
  { code: "gold", name: "طلایی", price_toman: null, replies_estimate: 0, discount_percent: 0, highlight: false },
];

const isCode = (v: unknown): v is PlanCode => typeof v === "string" && (ORDER as string[]).includes(v);
const nonNegative = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * The stored setting is admin input: anything malformed is dropped rather than rendered, duplicates keep the first
 * entry, and the result is in plan order. `null` means there is nothing publishable.
 */
export function normalizePlans(raw: unknown): PlanSetting[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<PlanCode>();
  const out: PlanSetting[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    if (!isCode(p.code) || seen.has(p.code)) continue;
    const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : null;
    if (!name) continue;
    const price = typeof p.price_toman === "number" && Number.isFinite(p.price_toman) && p.price_toman >= 0 ? Math.round(p.price_toman) : null;
    seen.add(p.code);
    out.push({
      code: p.code,
      name,
      price_toman: price,
      replies_estimate: Math.round(nonNegative(p.replies_estimate)),
      discount_percent: Math.min(100, nonNegative(p.discount_percent)),
      highlight: p.highlight === true,
    });
  }
  if (out.length === 0) return null;
  return out.sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
}

/** «به‌زودی» when unpriced, «رایگان» at zero, otherwise «۱٬۸۰۰٬۰۰۰ تومان». */
export function planPriceLabel(price: number | null): string {
  if (price === null) return "به‌زودی";
  if (price === 0) return "رایگان";
  return `${faNumber(price)} تومان`;
}

/** Empty strings for anything missing so the page can fall back field by field. */
export function normalizeSupport(raw: unknown): SupportSetting {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return { phone: str(r.phone), telegram: str(r.telegram), email: str(r.email), hours: str(r.hours) };
}

/** `@sepordi_support`, `sepordi_support` or a t.me URL → the handle without `@`, or "" when it is not one. */
export function telegramHandle(value: string): string {
  const m = value.trim().match(/^(?:https?:\/\/)?(?:t\.me\/|telegram\.me\/)?@?([A-Za-z0-9_]{5,32})\/?$/);
  return m ? m[1] : "";
}
