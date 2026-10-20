import "server-only";

import { settings } from "@/server/db/repo";

export type PlanCode = "free" | "bronze" | "silver" | "gold";

export interface Plan {
  code: PlanCode;
  name: string;
  /** null: not on sale yet («به‌زودی»). */
  price_toman: number | null;
  replies_estimate: number;
  /** Bizin's permanent discount on every AI reply while on this plan. Never a discount on `price_toman`. */
  discount_percent: number;
  highlight: boolean;
}

export interface SupportContact {
  phone: string;
  telegram: string;
  email: string;
  hours: string;
}

export interface CardToCardDestination {
  card_number: string;
  holder_name: string;
  bank_name: string;
}

const CODES: readonly PlanCode[] = ["free", "bronze", "silver", "gold"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const wholeNonNegative = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/** The admin writes `plans` by hand: anything malformed is dropped rather than sold at a wrong price. */
export function parsePlans(raw: unknown): Plan[] {
  if (!Array.isArray(raw)) return [];
  const out: Plan[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const code = p.code as PlanCode;
    if (!CODES.includes(code) || out.some((o) => o.code === code)) continue;
    const discount = wholeNonNegative(p.discount_percent) ?? 0;
    out.push({
      code,
      name: str(p.name) || code,
      price_toman: wholeNonNegative(p.price_toman),
      replies_estimate: wholeNonNegative(p.replies_estimate) ?? 0,
      discount_percent: Math.min(discount, 100),
      highlight: p.highlight === true,
    });
  }
  return out.sort((a, b) => CODES.indexOf(a.code) - CODES.indexOf(b.code));
}

/** What the seller pays, in whole Toman: exactly the price. null when the plan cannot be bought. */
export function payableToman(plan: Plan): number | null {
  return plan.price_toman !== null && plan.price_toman > 0 ? plan.price_toman : null;
}

export function readPlans(): Plan[] {
  return parsePlans(settings.get<unknown>("plans"));
}

export function readSupport(): SupportContact | null {
  const s = settings.get<Record<string, unknown>>("support");
  if (!s || typeof s !== "object") return null;
  const c = { phone: str(s.phone), telegram: str(s.telegram), email: str(s.email), hours: str(s.hours) };
  return c.phone || c.telegram || c.email ? c : null;
}

export function readCardToCard(): CardToCardDestination | null {
  const s = settings.get<Record<string, unknown>>("card_to_card");
  if (!s || typeof s !== "object") return null;
  const d = { card_number: str(s.card_number), holder_name: str(s.holder_name), bank_name: str(s.bank_name) };
  return d.card_number && d.holder_name ? d : null;
}
