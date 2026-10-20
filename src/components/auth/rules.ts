import { normalizeMobile } from "@/lib/phone";
import { en, fa } from "@/lib/utils";

/*
 * Field rules shared by the browser (validation on blur) and the server actions (the authority). Pure: no
 * server-only imports, so both sides run the same checks and show the same Farsi line under the field.
 */

export const PASSWORD_MIN = 8;
export const NAME_MAX = 80;
export const EMAIL_MAX = 254;

export const FIELD_MESSAGES = {
  phone: "شماره موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.",
  code: "کد تأیید ۶ رقم است.",
  password: "رمز عبور باید دست‌کم ۸ کاراکتر باشد.",
  passwordConfirm: "تکرار رمز عبور با خود رمز یکی نیست.",
  shopNameMissing: "نام فروشگاه را وارد کنید.",
  shopNameLong: "نام فروشگاه حداکثر ۸۰ کاراکتر است.",
  ownerNameMissing: "نام و نام خانوادگی خود را وارد کنید.",
  ownerNameLong: "نام حداکثر ۸۰ کاراکتر است.",
  emailMissing: "ایمیل را وارد کنید.",
  emailInvalid: "ایمیل درست نیست؛ مثل name@example.com وارد کنید.",
  instagram: "نام کاربری اینستاگرام فقط حروف انگلیسی، عدد، نقطه و _ دارد و حداکثر ۳۰ کاراکتر است.",
  category: "یکی از دسته‌های فهرست را انتخاب کنید.",
} as const;

export const SHOP_CATEGORIES = [
  { value: "clothing", label: "پوشاک، کیف و کفش" },
  { value: "beauty", label: "آرایشی و بهداشتی" },
  { value: "jewelry", label: "زیورآلات و اکسسوری" },
  { value: "home", label: "خانه و آشپزخانه" },
  { value: "digital", label: "کالای دیجیتال" },
  { value: "food", label: "خوراکی و نوشیدنی" },
  { value: "handmade", label: "صنایع‌دستی و هنری" },
  { value: "other", label: "سایر" },
] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number]["value"];

export function checkPhone(raw: string): string | undefined {
  return normalizeMobile(raw) ? undefined : FIELD_MESSAGES.phone;
}

export function normalizeCode(raw: string): string {
  return en(String(raw ?? "")).replace(/\D/g, "");
}

export function checkCode(raw: string): string | undefined {
  return /^\d{6}$/.test(normalizeCode(raw)) ? undefined : FIELD_MESSAGES.code;
}

export function checkPassword(v: string): string | undefined {
  return v.length >= PASSWORD_MIN ? undefined : FIELD_MESSAGES.password;
}

export function checkShopName(v: string): string | undefined {
  const t = v.trim();
  if (!t) return FIELD_MESSAGES.shopNameMissing;
  if (t.length > NAME_MAX) return FIELD_MESSAGES.shopNameLong;
}

export function checkOwnerName(v: string): string | undefined {
  const t = v.trim();
  if (!t) return FIELD_MESSAGES.ownerNameMissing;
  if (t.length > NAME_MAX) return FIELD_MESSAGES.ownerNameLong;
}

export function normalizeEmail(v: string): string {
  return en(v).trim().toLowerCase();
}

export function checkEmail(v: string): string | undefined {
  const e = normalizeEmail(v);
  if (!e) return FIELD_MESSAGES.emailMissing;
  if (e.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return FIELD_MESSAGES.emailInvalid;
}

/** «@my.shop», «instagram.com/my.shop/» or «my.shop» → «my.shop»; empty → "". */
export function normalizeInstagram(v: string): string {
  return en(v)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function checkInstagram(v: string): string | undefined {
  const h = normalizeInstagram(v);
  if (h && !/^[a-z0-9._]{1,30}$/.test(h)) return FIELD_MESSAGES.instagram;
}

export function checkCategory(v: string): string | undefined {
  if (v && !SHOP_CATEGORIES.some((c) => c.value === v)) return FIELD_MESSAGES.category;
}

export interface BusinessFields {
  shopName: string;
  ownerName: string;
  email: string;
  instagram: string;
  category: string;
}

export type BusinessErrors = Partial<Record<keyof BusinessFields, string>>;

export function checkBusiness(f: BusinessFields): BusinessErrors {
  const errors: BusinessErrors = {
    shopName: checkShopName(f.shopName),
    ownerName: checkOwnerName(f.ownerName),
    email: checkEmail(f.email),
    instagram: checkInstagram(f.instagram),
    category: checkCategory(f.category),
  };
  for (const k of Object.keys(errors) as (keyof BusinessFields)[]) if (!errors[k]) delete errors[k];
  return errors;
}

/** Only a same-origin panel path survives a `?next=`; anything else (absolute, `//host`, `/\host`) is the panel home. */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || next.length > 512) return "/panel";
  if (!/^\/panel(?:[/?#]|$)/.test(next)) return "/panel";
  if (/[\\\s]/.test(next) || next.includes("//")) return "/panel";
  return next;
}

/** «۴۵ ثانیه» / «۳ دقیقه» for a wait in seconds. */
export function faWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 90) return `${fa(s)} ثانیه`;
  return `${fa(Math.ceil(s / 60))} دقیقه`;
}
