import { rialToToman, tomanToRial } from "@/lib/money";
import { citiesOf, PROVINCE_NAMES } from "@/lib/iran-divisions";
import { fa } from "@/lib/utils";

/** The shipping rules as the seller edits them: Toman, whole numbers. */
export interface ShippingFormValue {
  enabled: boolean;
  default_fee: number | null;
  free_over: number | null;
  rates: { province: string; city: string; fee: number | null }[];
}

/** PUT /shipping body: Rial. */
export interface ShippingBody {
  enabled: boolean;
  default_fee: number | null;
  free_over: number | null;
  rates: { province: string; city?: string; fee: number }[];
}

export const MAX_RATES = 500;
/** No real postage is near this; it catches a mistyped extra zero. */
export const MAX_FEE_TOMAN = 100_000_000;

export function fromApi(s: { enabled: boolean; default_fee: number | null; free_over: number | null; rates: { province: string; city?: string; fee: number }[] }): ShippingFormValue {
  return {
    enabled: s.enabled,
    default_fee: s.default_fee === null ? null : rialToToman(s.default_fee),
    free_over: s.free_over === null ? null : rialToToman(s.free_over),
    rates: s.rates.map((r) => ({ province: r.province, city: r.city ?? "", fee: rialToToman(r.fee) })),
  };
}

const whole = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_FEE_TOMAN;

export type ShippingCheck = { ok: true; body: ShippingBody } | { ok: false; field: string; message: string };

/**
 * Toman → Rial (×10): every fee leaves as a multiple of 10 Rial, the API's whole quote unit. Mirrors the API's
 * 422 rules so the seller sees the reason beside the field.
 */
export function toShippingBody(v: ShippingFormValue): ShippingCheck {
  if (v.default_fee !== null && !whole(v.default_fee)) return { ok: false, field: "default_fee", message: "هزینه‌ی ارسال باید عددی درست به تومان باشد." };
  if (v.free_over !== null && (!whole(v.free_over) || v.free_over < 1)) {
    return { ok: false, field: "free_over", message: "حد ارسال رایگان باید حداقل ۱ تومان باشد، یا خالی بماند." };
  }
  if (v.rates.length > MAX_RATES) return { ok: false, field: "rates", message: `حداکثر ${fa(MAX_RATES)} نرخ می‌توانید تعریف کنید.` };

  const seen = new Set<string>();
  const rates: ShippingBody["rates"] = [];
  for (const [i, r] of v.rates.entries()) {
    const province = r.province.trim();
    const city = r.city.trim();
    if (!province) return { ok: false, field: `rates.${i}.province`, message: "استان را انتخاب کنید." };
    if (!PROVINCE_NAMES.includes(province)) return { ok: false, field: `rates.${i}.province`, message: "این استان در فهرست نیست." };
    if (city && !citiesOf(province).includes(city)) return { ok: false, field: `rates.${i}.city`, message: `«${city}» از شهرهای ${province} نیست.` };
    if (r.fee === null || !whole(r.fee)) return { ok: false, field: `rates.${i}.fee`, message: "هزینه‌ی این نرخ را به تومان بنویسید." };
    const key = `${province}|${city}`;
    if (seen.has(key)) return { ok: false, field: `rates.${i}.province`, message: city ? `برای ${city} دو نرخ نوشته‌اید.` : `برای کل استان ${province} دو نرخ نوشته‌اید.` };
    seen.add(key);
    rates.push({ province, ...(city ? { city } : {}), fee: tomanToRial(r.fee) });
  }
  if (v.enabled && v.default_fee === null && rates.length === 0) {
    return { ok: false, field: "enabled", message: "برای روشن کردن قانون ارسال، هزینه‌ی پیش‌فرض یا دست‌کم یک نرخ استانی بنویسید." };
  }
  return {
    ok: true,
    body: {
      enabled: v.enabled,
      default_fee: v.default_fee === null ? null : tomanToRial(v.default_fee),
      free_over: v.free_over === null ? null : tomanToRial(v.free_over),
      rates,
    },
  };
}
