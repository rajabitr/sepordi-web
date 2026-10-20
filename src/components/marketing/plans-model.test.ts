import { describe, expect, it } from "vitest";

import { normalizePlans, normalizeSupport, planPriceLabel, telegramHandle } from "./plans-model";

describe("normalizePlans", () => {
  it("returns null when the setting is missing or holds nothing usable", () => {
    expect(normalizePlans(undefined)).toBeNull();
    expect(normalizePlans(null)).toBeNull();
    expect(normalizePlans({ code: "free" })).toBeNull();
    expect(normalizePlans([{ code: "platinum", name: "x" }, { code: "gold", name: "  " }, 3])).toBeNull();
  });

  it("orders plans free → gold, drops duplicates and coerces bad numbers", () => {
    const out = normalizePlans([
      { code: "gold", name: "طلایی", price_toman: 6_000_000.4, replies_estimate: 24_400, discount_percent: 10, highlight: false },
      { code: "free", name: "رایگان", price_toman: 0, replies_estimate: -5, discount_percent: "7", highlight: "yes" },
      { code: "gold", name: "تکراری", price_toman: 1 },
      { code: "silver", name: "نقره‌ای", price_toman: null, replies_estimate: 15_700, discount_percent: 700, highlight: true },
    ]);
    expect(out?.map((p) => p.code)).toEqual(["free", "silver", "gold"]);
    expect(out?.[0]).toMatchObject({ price_toman: 0, replies_estimate: 0, discount_percent: 0, highlight: false });
    expect(out?.[1]).toMatchObject({ price_toman: null, discount_percent: 100, highlight: true });
    expect(out?.[2]).toMatchObject({ name: "طلایی", price_toman: 6_000_000 });
  });

  it("treats a negative or non-numeric price as unpriced", () => {
    expect(normalizePlans([{ code: "bronze", name: "برنزی", price_toman: -1 }])?.[0].price_toman).toBeNull();
    expect(normalizePlans([{ code: "bronze", name: "برنزی", price_toman: "2000000" }])?.[0].price_toman).toBeNull();
  });
});

describe("planPriceLabel", () => {
  it("never shows a price that is not set", () => {
    expect(planPriceLabel(null)).toBe("به‌زودی");
    expect(planPriceLabel(0)).toBe("رایگان");
    expect(planPriceLabel(1_800_000)).toBe("۱٬۸۰۰٬۰۰۰ تومان");
  });
});

describe("support setting", () => {
  it("fills missing fields with empty strings", () => {
    expect(normalizeSupport(null)).toEqual({ phone: "", telegram: "", email: "", hours: "" });
    expect(normalizeSupport({ phone: " 021-1234 ", email: 5 })).toEqual({ phone: "021-1234", telegram: "", email: "", hours: "" });
  });

  it("accepts a Telegram handle in the usual spellings and rejects anything else", () => {
    expect(telegramHandle("@sepordi_support")).toBe("sepordi_support");
    expect(telegramHandle("https://t.me/sepordi_support")).toBe("sepordi_support");
    expect(telegramHandle("sepordi_support")).toBe("sepordi_support");
    expect(telegramHandle("javascript:alert(1)")).toBe("");
    expect(telegramHandle("https://evil.example/x")).toBe("");
    expect(telegramHandle("")).toBe("");
  });
});
