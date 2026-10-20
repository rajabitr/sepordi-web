import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb, setDbForTests } from "@/server/db";
import { creditOrders, settings, shops, users, type ShopRow } from "@/server/db/repo";

import {
  completeZarinpalPayment,
  confirmCreditPayment,
  createCardToCardOrder,
  creditOrdersForShop,
  markCreditOrderGranted,
  normalizeTransferReference,
  rejectCreditOrder,
  startZarinpalOrder,
} from "./orders";
import { parsePlans, payableToman } from "./plans";
import type { FetchLike, ZarinpalConfig } from "./zarinpal";

const ZP: ZarinpalConfig = { merchantId: "m-1", sandbox: true, callbackUrl: "https://sepordi.ir/api/payments/zarinpal/callback" };

let shop: ShopRow;

beforeEach(() => {
  setDbForTests(openDb(":memory:"));
  const u = users.create({ phone: "09120000001", displayName: "نیلا" });
  shop = shops.create({ userId: u.id, externalBusinessId: "biz-1", name: "نیلا" });
  settings.set("plans", [
    { code: "free", name: "رایگان", price_toman: 0, replies_estimate: 50, discount_percent: 0, highlight: false },
    { code: "bronze", name: "برنزی", price_toman: 490_000, replies_estimate: 1000, discount_percent: 10, highlight: false },
    { code: "silver", name: "نقره‌ای", price_toman: null, replies_estimate: 3000, discount_percent: 0, highlight: true },
  ]);
  settings.set("card_to_card", { card_number: "6037991234567890", holder_name: "سپردی", bank_name: "ملی" });
});
afterEach(() => setDbForTests(undefined));

/** A fake Zarinpal that records calls and answers from a script. */
function fakeZarinpal(answers: Record<string, unknown>[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(answers.shift() ?? { data: [], errors: { code: -9 } }), { status: 200 });
  };
  return { impl, calls };
}

describe("plans", () => {
  it("drops malformed entries, and the reply discount never lowers the price", () => {
    const plans = parsePlans([{ code: "gold", price_toman: 100_000, discount_percent: 15 }, { code: "nope" }, "x", { code: "gold" }]);
    expect(plans).toHaveLength(1);
    expect(plans[0].discount_percent).toBe(15);
    expect(payableToman(plans[0])).toBe(100_000);
    expect(payableToman({ ...plans[0], price_toman: null })).toBeNull();
    expect(payableToman({ ...plans[0], price_toman: 0 })).toBeNull();
  });
});

describe("card-to-card", () => {
  it("creates a pending order at the full price that waits for staff review, with the seller's reference", () => {
    const r = createCardToCardOrder(shop, "bronze", "۱۲۳ ۴۵۶-۷۸۹");
    expect(r.ok).toBe(true);
    const [o] = creditOrdersForShop(shop.id);
    expect(o).toMatchObject({ plan_code: "bronze", amount_toman: 490_000, method: "card_to_card", state: "awaiting_review", ref: "123456789" });
    expect(creditOrders.forShop(shop.id)[0]).toMatchObject({ status: "pending", amount_rial: 4_900_000 });
  });

  it("refuses a plan that is not for sale, a bad reference, and a fourth open order", () => {
    expect(createCardToCardOrder(shop, "silver", "123456")).toEqual({ ok: false, error: "plan_unavailable" });
    expect(createCardToCardOrder(shop, "free", "123456")).toEqual({ ok: false, error: "plan_unavailable" });
    expect(createCardToCardOrder(shop, "bronze", "12")).toEqual({ ok: false, error: "reference_invalid" });
    for (let i = 0; i < 3; i++) expect(createCardToCardOrder(shop, "bronze", `12345${i}`).ok).toBe(true);
    expect(createCardToCardOrder(shop, "bronze", "999999")).toEqual({ ok: false, error: "too_many_open" });
  });

  it("is unavailable without a destination card in settings", () => {
    settings.set("card_to_card", { card_number: "", holder_name: "" });
    expect(createCardToCardOrder(shop, "bronze", "123456")).toEqual({ ok: false, error: "card_to_card_unavailable" });
  });

  it("goes pending → paid → granted only in that order, keeping who and when", () => {
    const r = createCardToCardOrder(shop, "bronze", "123456");
    if (!r.ok) throw new Error("setup");
    expect(markCreditOrderGranted(r.order.id, "علی")).toEqual({ ok: false, error: "wrong_state" });
    expect(confirmCreditPayment(r.order.id, "علی")).toEqual({ ok: true });
    expect(creditOrdersForShop(shop.id)[0].state).toBe("awaiting_grant");
    expect(confirmCreditPayment(r.order.id, "علی")).toEqual({ ok: false, error: "wrong_state" });
    expect(rejectCreditOrder(r.order.id, "علی", "دیر شد")).toEqual({ ok: false, error: "wrong_state" });
    expect(markCreditOrderGranted(r.order.id, "مریم")).toEqual({ ok: true });
    expect(creditOrdersForShop(shop.id)[0].state).toBe("granted");
    const row = creditOrders.byId(r.order.id);
    expect(row).toMatchObject({ status: "granted", reviewed_by: "مریم" });
    expect(row?.verified_at).toBeTruthy();
    expect(row?.granted_at).toBeTruthy();
    expect(markCreditOrderGranted("nope", "علی")).toEqual({ ok: false, error: "not_found" });
  });

  it("rejects only with a note, and the seller sees it", () => {
    const r = createCardToCardOrder(shop, "bronze", "123456");
    if (!r.ok) throw new Error("setup");
    expect(rejectCreditOrder(r.order.id, "علی", "   ")).toEqual({ ok: false, error: "note_required" });
    expect(rejectCreditOrder(r.order.id, "علی", " واریزی پیدا نشد. ")).toEqual({ ok: true });
    expect(creditOrdersForShop(shop.id)[0]).toMatchObject({ state: "rejected", rejection_note: "واریزی پیدا نشد." });
    expect(creditOrders.byId(r.order.id)).toMatchObject({ status: "rejected", reviewed_by: "علی" });
  });

  it("normalizes references", () => {
    expect(normalizeTransferReference(" ۰۰۱۲‌۳۴ ")).toBe("001234");
    expect(normalizeTransferReference("12;DROP")).toBeNull();
  });
});

describe("zarinpal", () => {
  it("sends Rial (Toman × 10) and stores the authority", async () => {
    const zp = fakeZarinpal([{ data: { code: 100, authority: "A0000000000000000000000000000000001" }, errors: [] }]);
    const r = await startZarinpalOrder(shop, "bronze", { config: ZP, fetchImpl: zp.impl, mobile: "09120000001" });
    expect(r).toMatchObject({ ok: true, url: "https://sandbox.zarinpal.com/pg/StartPay/A0000000000000000000000000000000001" });
    expect(zp.calls[0].url).toBe("https://sandbox.zarinpal.com/pg/v4/payment/request.json");
    expect(zp.calls[0].body).toMatchObject({ merchant_id: "m-1", amount: 4_900_000, callback_url: ZP.callbackUrl });
    if (!r.ok) throw new Error("setup");
    expect(creditOrders.byId(r.orderId)).toMatchObject({ authority: "A0000000000000000000000000000000001", amount_rial: 4_900_000 });
    expect(creditOrdersForShop(shop.id)[0].state).toBe("awaiting_payment");
  });

  it("is off without a merchant id", async () => {
    expect(await startZarinpalOrder(shop, "bronze", { config: null })).toEqual({ ok: false, error: "gateway_off" });
    expect(creditOrders.forShop(shop.id)).toHaveLength(0);
  });

  it("marks the order failed when the request is refused", async () => {
    const zp = fakeZarinpal([{ data: [], errors: { code: -10 } }]);
    expect(await startZarinpalOrder(shop, "bronze", { config: ZP, fetchImpl: zp.impl })).toEqual({ ok: false, error: "gateway_error" });
    expect(creditOrdersForShop(shop.id)[0].state).toBe("failed");
  });

  it("verifies with the stored amount, is idempotent, and only verify moves to paid", async () => {
    const zp = fakeZarinpal([
      { data: { code: 100, authority: "A1" }, errors: [] },
      { data: { code: 100, ref_id: 778899 }, errors: [] },
    ]);
    await startZarinpalOrder(shop, "bronze", { config: ZP, fetchImpl: zp.impl });
    expect(await completeZarinpalPayment("A1", "OK", { config: ZP, fetchImpl: zp.impl })).toBe("paid");
    expect(zp.calls[1].body).toEqual({ merchant_id: "m-1", amount: 4_900_000, authority: "A1" });
    // A repeated callback neither calls Zarinpal again nor changes the outcome.
    expect(await completeZarinpalPayment("A1", "OK", { config: ZP, fetchImpl: zp.impl })).toBe("paid");
    expect(zp.calls).toHaveLength(2);
    const [o] = creditOrdersForShop(shop.id);
    expect(o).toMatchObject({ state: "awaiting_grant", ref: "778899" });
  });

  it("treats 101 (already verified) as paid", async () => {
    const zp = fakeZarinpal([{ data: { code: 100, authority: "A2" }, errors: [] }, { data: { code: 101, ref_id: 5 }, errors: [] }]);
    await startZarinpalOrder(shop, "bronze", { config: ZP, fetchImpl: zp.impl });
    expect(await completeZarinpalPayment("A2", "OK", { config: ZP, fetchImpl: zp.impl })).toBe("paid");
  });

  it("cancels on Status=NOK without calling verify, and fails on a refused verify", async () => {
    const zp = fakeZarinpal([
      { data: { code: 100, authority: "A3" }, errors: [] },
      { data: { code: 100, authority: "A4" }, errors: [] },
      { data: [], errors: { code: -51 } },
    ]);
    await startZarinpalOrder(shop, "bronze", { config: ZP, fetchImpl: zp.impl });
    await startZarinpalOrder(shop, "bronze", { config: ZP, fetchImpl: zp.impl });
    expect(await completeZarinpalPayment("A3", "NOK", { config: ZP, fetchImpl: zp.impl })).toBe("cancelled");
    expect(zp.calls).toHaveLength(2);
    expect(await completeZarinpalPayment("A4", "OK", { config: ZP, fetchImpl: zp.impl })).toBe("failed");
    expect(await completeZarinpalPayment("nope", "OK", { config: ZP, fetchImpl: zp.impl })).toBe("unknown");
    // Staff can neither grant nor confirm a gateway order: only Zarinpal's verify moves it to paid.
    const pending = creditOrders.create({ shopId: shop.id, planCode: "bronze", amountToman: 1, method: "zarinpal" });
    expect(markCreditOrderGranted(pending.id, "علی")).toEqual({ ok: false, error: "wrong_state" });
    expect(confirmCreditPayment(pending.id, "علی")).toEqual({ ok: false, error: "wrong_state" });
    expect(rejectCreditOrder(pending.id, "علی", "نه")).toEqual({ ok: false, error: "wrong_state" });
  });

  it("leaves the order pending when verify cannot be reached", async () => {
    const zp = fakeZarinpal([{ data: { code: 100, authority: "A5" }, errors: [] }]);
    await startZarinpalOrder(shop, "bronze", { config: ZP, fetchImpl: zp.impl });
    const down: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await completeZarinpalPayment("A5", "OK", { config: ZP, fetchImpl: down })).toBe("unknown");
    expect(creditOrders.forShop(shop.id)[0].status).toBe("pending");
  });
});
