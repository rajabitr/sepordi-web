import { describe, expect, it } from "vitest";

import { fromApi, toShippingBody } from "./model";

describe("shipping model", () => {
  it("sends Toman × 10, so every fee is a multiple of 10 Rial", () => {
    const r = toShippingBody({ enabled: true, default_fee: 60_000, free_over: 3_000_000, rates: [{ province: "فارس", city: "شیراز", fee: 70_000 }, { province: "تهران", city: "", fee: 40_000 }] });
    expect(r).toEqual({
      ok: true,
      body: { enabled: true, default_fee: 600_000, free_over: 30_000_000, rates: [{ province: "فارس", city: "شیراز", fee: 700_000 }, { province: "تهران", fee: 400_000 }] },
    });
    if (r.ok) for (const fee of [r.body.default_fee!, ...r.body.rates.map((x) => x.fee)]) expect(fee % 10).toBe(0);
  });

  it("refuses fractional Toman, a city outside its province, repeats, and an empty enabled rule", () => {
    expect(toShippingBody({ enabled: false, default_fee: 10.5, free_over: null, rates: [] })).toMatchObject({ ok: false, field: "default_fee" });
    expect(toShippingBody({ enabled: false, default_fee: null, free_over: null, rates: [{ province: "فارس", city: "تبریز", fee: 1 }] })).toMatchObject({ ok: false, field: "rates.0.city" });
    expect(
      toShippingBody({ enabled: false, default_fee: null, free_over: null, rates: [{ province: "تهران", city: "", fee: 1 }, { province: "تهران", city: "", fee: 2 }] }),
    ).toMatchObject({ ok: false, field: "rates.1.province" });
    expect(toShippingBody({ enabled: true, default_fee: null, free_over: null, rates: [] })).toMatchObject({ ok: false, field: "enabled" });
    expect(toShippingBody({ enabled: false, default_fee: null, free_over: 0, rates: [] })).toMatchObject({ ok: false, field: "free_over" });
  });

  it("reads Rial from the API as Toman", () => {
    expect(fromApi({ enabled: true, default_fee: 600_000, free_over: null, rates: [{ province: "فارس", fee: 800_000 }] })).toEqual({
      enabled: true,
      default_fee: 60_000,
      free_over: null,
      rates: [{ province: "فارس", city: "", fee: 80_000 }],
    });
  });
});
