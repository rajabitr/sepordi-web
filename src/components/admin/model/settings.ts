import { normalizeCardNumber, isCardNumber } from "@/lib/persian";
import { en } from "@/lib/utils";

/*
 * The `settings` keys sepordi staff edit here and the marketing site and seller panel read. Pure and
 * browser-safe: the admin form validates with the same rules the Server Action enforces.
 */

export const PLAN_CODES = ["free", "bronze", "silver", "gold"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export interface Plan {
  code: PlanCode;
  name: string;
  /** null until the owner sets a price; the marketing site then shows «تماس بگیرید». */
  price_toman: number | null;
  replies_estimate: number;
  discount_percent: number;
  highlight: boolean;
}

export interface SupportInfo {
  phone: string;
  telegram: string;
  email: string;
  hours: string;
}

export interface CardToCard {
  card_number: string;
  holder_name: string;
  bank_name: string;
}

export interface AdminSettings {
  plans: Plan[];
  support: SupportInfo;
  card_to_card: CardToCard;
}

export const DEFAULT_PLANS: Plan[] = [
  { code: "free", name: "رایگان", price_toman: null, replies_estimate: 200, discount_percent: 0, highlight: false },
  { code: "bronze", name: "برنزی", price_toman: null, replies_estimate: 7400, discount_percent: 2, highlight: false },
  { code: "silver", name: "نقره‌ای", price_toman: null, replies_estimate: 15700, discount_percent: 7, highlight: true },
  { code: "gold", name: "طلایی", price_toman: null, replies_estimate: 24400, discount_percent: 10, highlight: false },
];

export const DEFAULT_SUPPORT: SupportInfo = { phone: "", telegram: "", email: "", hours: "شنبه تا چهارشنبه، ۹ تا ۱۷" };

export const DEFAULT_CARD_TO_CARD: CardToCard = { card_number: "", holder_name: "", bank_name: "" };

export type FieldErrors = Record<string, string>;

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const MAX_PRICE_TOMAN = 1_000_000_000;

function toInt(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v !== "string") return null;
  const s = en(v).replace(/[,٬\s]/g, "");
  if (s === "") return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Exactly the four plans in PLAN_CODES order; at most one highlighted. */
export function validatePlans(input: unknown): Validated<Plan[]> {
  const errors: FieldErrors = {};
  const list = Array.isArray(input) ? input : [];
  const plans: Plan[] = PLAN_CODES.map((code, i) => {
    const raw = (list.find((p) => p && typeof p === "object" && (p as Plan).code === code) ?? {}) as Record<string, unknown>;
    const name = str(raw.name, 40);
    if (!name) errors[`plans.${i}.name`] = "نام طرح را بنویسید.";
    const price = toInt(raw.price_toman);
    if (Number.isNaN(price) || (price !== null && (price < 0 || price > MAX_PRICE_TOMAN))) {
      errors[`plans.${i}.price_toman`] = "قیمت باید یک عدد صحیح به تومان باشد، یا خالی بماند.";
    }
    const replies = toInt(raw.replies_estimate);
    if (replies === null || Number.isNaN(replies) || replies < 0 || replies > 10_000_000) {
      errors[`plans.${i}.replies_estimate`] = "تعداد تقریبی پاسخ را به عدد بنویسید.";
    }
    const discount = toInt(raw.discount_percent);
    if (discount === null || Number.isNaN(discount) || discount < 0 || discount > 90) {
      errors[`plans.${i}.discount_percent`] = "تخفیف هر پاسخ باید عددی بین ۰ تا ۹۰ باشد.";
    }
    return {
      code,
      name,
      price_toman: price === null || Number.isNaN(price) ? null : price,
      replies_estimate: replies !== null && !Number.isNaN(replies) ? replies : 0,
      discount_percent: discount !== null && !Number.isNaN(discount) ? discount : 0,
      highlight: raw.highlight === true,
    };
  });
  if (plans.filter((p) => p.highlight).length > 1) errors["plans.highlight"] = "فقط یک طرح می‌تواند پیشنهاد ویژه باشد.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: plans };
}

export function validateSupport(input: unknown): Validated<SupportInfo> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};
  const phone = en(str(raw.phone, 20)).replace(/[\s-]/g, "");
  if (phone && !/^0\d{10}$/.test(phone)) errors["support.phone"] = "شماره‌ی تلفن باید ۱۱ رقم باشد و با ۰ شروع شود.";
  const telegram = str(raw.telegram, 40).replace(/^@/, "");
  if (telegram && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram)) errors["support.telegram"] = "نام کاربری تلگرام فقط حروف انگلیسی، عدد و _ است.";
  const email = str(raw.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors["support.email"] = "نشانی ایمیل درست نیست.";
  const hours = str(raw.hours, 80);
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { phone, telegram, email, hours } };
}

/** An empty card is allowed (card-to-card off); a partial one is not. */
export function validateCardToCard(input: unknown): Validated<CardToCard> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};
  const card_number = normalizeCardNumber(str(raw.card_number, 40));
  const holder_name = str(raw.holder_name, 60);
  const bank_name = str(raw.bank_name, 40);
  const any = Boolean(card_number || holder_name || bank_name);
  if (any) {
    if (!isCardNumber(card_number)) errors["card_to_card.card_number"] = "شماره‌ی کارت باید ۱۶ رقم و معتبر باشد.";
    if (!holder_name) errors["card_to_card.holder_name"] = "نام صاحب کارت را بنویسید.";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { card_number, holder_name, bank_name } };
}
