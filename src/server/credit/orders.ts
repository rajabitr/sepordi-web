import "server-only";

import { en } from "@/lib/utils";
import { getDb } from "@/server/db";
import { creditOrders, type CreditMethod, type CreditOrderRow, type ShopRow } from "@/server/db/repo";

import { payableToman, readCardToCard, readPlans, type Plan } from "./plans";
import { requestPayment, startPayUrl, verifyPayment, zarinpalConfig, type FetchLike, type ZarinpalConfig } from "./zarinpal";

/*
 * Bizin has no credit top-up API (owner decision D1): the seller buys here, and a Bizin operator credits the
 * account by hand. `paid` means "money verified", never "credited"; only `granted` (with granted_at) says a
 * Bizin operator posted the credit.
 */

export type { CreditMethod };

export type CreditOrderState =
  | "awaiting_payment"
  | "abandoned"
  | "awaiting_review"
  | "awaiting_grant"
  | "granted"
  | "rejected"
  | "failed"
  | "cancelled";

export interface CreditOrderView {
  id: string;
  plan_code: string;
  plan_name: string;
  amount_toman: number;
  method: CreditMethod;
  state: CreditOrderState;
  /** The seller's transfer reference (card-to-card) or Zarinpal's ref_id once verified. */
  ref: string | null;
  /** Staff's reason, only on a rejected order. */
  rejection_note: string | null;
  created_at: string;
}

/** A gateway payment the buyer never came back from stops reading as «در انتظار پرداخت» after this. */
const ABANDON_AFTER_MS = 60 * 60_000;
const MAX_OPEN_CARD_ORDERS = 3;
const MAX_GATEWAY_STARTS_PER_10_MIN = 5;

export function orderState(row: Pick<CreditOrderRow, "status" | "method" | "created_at">, now = Date.now()): CreditOrderState {
  switch (row.status) {
    case "granted":
    case "rejected":
    case "failed":
    case "cancelled":
      return row.status;
    case "paid":
      return "awaiting_grant";
    case "pending":
      if (row.method === "card_to_card") return "awaiting_review";
      return now - Date.parse(row.created_at) > ABANDON_AFTER_MS ? "abandoned" : "awaiting_payment";
  }
}

export function creditOrdersForShop(shopId: string, now = Date.now()): CreditOrderView[] {
  const names = new Map(readPlans().map((p) => [p.code as string, p.name]));
  return creditOrders.forShop(shopId).map((r) => ({
    id: r.id,
    plan_code: r.plan_code,
    plan_name: names.get(r.plan_code) ?? r.plan_code,
    amount_toman: r.amount_toman,
    method: r.method,
    state: orderState(r, now),
    ref: r.ref,
    rejection_note: r.status === "rejected" ? r.review_note : null,
    created_at: r.created_at,
  }));
}

function purchasablePlan(code: string): { plan: Plan; toman: number } | null {
  const plan = readPlans().find((p) => p.code === code);
  const toman = plan ? payableToman(plan) : null;
  return plan && toman !== null ? { plan, toman } : null;
}

/** Bank tracking numbers, with Persian digits, spaces and dashes as people paste them. */
export function normalizeTransferReference(raw: string): string | null {
  const v = en(String(raw ?? "")).replace(/[\s‌-]/g, "");
  return /^[A-Za-z0-9]{4,40}$/.test(v) ? v : null;
}

export type CardToCardResult =
  | { ok: true; order: CreditOrderRow }
  | { ok: false; error: "plan_unavailable" | "card_to_card_unavailable" | "reference_invalid" | "too_many_open" };

export function createCardToCardOrder(shop: ShopRow, planCode: string, reference: string, now = Date.now()): CardToCardResult {
  const found = purchasablePlan(planCode);
  if (!found) return { ok: false, error: "plan_unavailable" };
  if (!readCardToCard()) return { ok: false, error: "card_to_card_unavailable" };
  const ref = normalizeTransferReference(reference);
  if (!ref) return { ok: false, error: "reference_invalid" };
  const open = creditOrdersForShop(shop.id, now).filter((o) => o.state === "awaiting_review").length;
  if (open >= MAX_OPEN_CARD_ORDERS) return { ok: false, error: "too_many_open" };

  const order = creditOrders.create({ shopId: shop.id, planCode: found.plan.code, amountToman: found.toman, method: "card_to_card", ref });
  return { ok: true, order };
}

export type GatewayStartResult =
  | { ok: true; url: string; orderId: string }
  | { ok: false; error: "plan_unavailable" | "gateway_off" | "gateway_error" | "too_many_attempts" };

export async function startZarinpalOrder(
  shop: ShopRow,
  planCode: string,
  opts: { mobile?: string; config?: ZarinpalConfig | null; fetchImpl?: FetchLike; now?: number } = {},
): Promise<GatewayStartResult> {
  const config = opts.config === undefined ? zarinpalConfig() : opts.config;
  if (!config) return { ok: false, error: "gateway_off" };
  const found = purchasablePlan(planCode);
  if (!found) return { ok: false, error: "plan_unavailable" };
  const now = opts.now ?? Date.now();
  const since = new Date(now - 10 * 60_000).toISOString();
  const recent = getDb()
    .prepare("SELECT COUNT(*) AS n FROM credit_orders WHERE shop_id = ? AND method = 'zarinpal' AND created_at > ?")
    .get(shop.id, since) as { n: number };
  if (Number(recent.n) >= MAX_GATEWAY_STARTS_PER_10_MIN) return { ok: false, error: "too_many_attempts" };

  const order = creditOrders.create({ shopId: shop.id, planCode: found.plan.code, amountToman: found.toman, method: "zarinpal" });
  const amountRial = order.amount_rial;

  let res: Awaited<ReturnType<typeof requestPayment>>;
  try {
    res = await requestPayment(
      config,
      { amountRial, description: `خرید اعتبار سپردی، بسته‌ی ${found.plan.name}، ${shop.name}`, mobile: opts.mobile, orderId: order.id },
      opts.fetchImpl,
    );
  } catch {
    res = { ok: false };
  }
  if (!res.ok) {
    getDb().prepare("UPDATE credit_orders SET status = 'failed' WHERE id = ? AND status = 'pending'").run(order.id);
    return { ok: false, error: "gateway_error" };
  }
  getDb().prepare("UPDATE credit_orders SET authority = ? WHERE id = ?").run(res.authority, order.id);
  return { ok: true, url: startPayUrl(config, res.authority), orderId: order.id };
}

export type GatewayOutcome = "paid" | "cancelled" | "failed" | "unknown";

/**
 * The buyer's return from Zarinpal. Idempotent: a repeated or concurrent callback for a verified order answers
 * "paid" again, and nothing but Zarinpal's own verify moves an order to paid.
 */
export async function completeZarinpalPayment(
  authority: string,
  status: string,
  opts: { config?: ZarinpalConfig | null; fetchImpl?: FetchLike } = {},
): Promise<GatewayOutcome> {
  if (!authority || authority.length > 64) return "unknown";
  const d = getDb();
  const order = d.prepare("SELECT * FROM credit_orders WHERE authority = ? AND method = 'zarinpal'").get(authority) as CreditOrderRow | undefined;
  if (!order) return "unknown";
  if (order.status === "paid" || order.status === "granted") return "paid";
  if (order.status !== "pending") return order.status === "cancelled" ? "cancelled" : "failed";

  if (status !== "OK") {
    d.prepare("UPDATE credit_orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(order.id);
    return "cancelled";
  }
  const config = opts.config === undefined ? zarinpalConfig() : opts.config;
  if (!config) return "failed";

  let res: Awaited<ReturnType<typeof verifyPayment>>;
  try {
    res = await verifyPayment(config, { amountRial: order.amount_rial, authority }, opts.fetchImpl);
  } catch {
    // Unknown, not failed: the buyer may have paid; a later callback or support can still verify.
    return "unknown";
  }
  if (!res.ok) {
    d.prepare("UPDATE credit_orders SET status = 'failed' WHERE id = ? AND status = 'pending'").run(order.id);
    return "failed";
  }
  d.prepare("UPDATE credit_orders SET status = 'paid', ref = ?, verified_at = ? WHERE id = ? AND status = 'pending'").run(
    res.refId || null,
    new Date().toISOString(),
    order.id,
  );
  return "paid";
}

export type StaffDecisionError = "not_found" | "wrong_state" | "note_required";
export type StaffDecisionResult = { ok: true } | { ok: false; error: StaffDecisionError };

/**
 * The staff transitions. Each moves only from the state it names, so two staff pressing at once cannot overwrite
 * each other's decision, and a Zarinpal order reaches paid only through Zarinpal's own verify.
 */
function transition(orderId: string, sql: string, args: (string | null)[]): StaffDecisionResult {
  const r = getDb().prepare(sql).run(...args, orderId);
  if (Number(r.changes) === 1) return { ok: true };
  return { ok: false, error: creditOrders.byId(orderId) ? "wrong_state" : "not_found" };
}

/** «پرداخت تأیید شد»: staff found the card-to-card transfer in the bank account. */
export function confirmCreditPayment(orderId: string, by: string, now = new Date()): StaffDecisionResult {
  const at = now.toISOString();
  return transition(
    orderId,
    "UPDATE credit_orders SET status = 'paid', verified_at = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending' AND method = 'card_to_card'",
    [at, by, at],
  );
}

/** «شارژ شد»: a Bizin operator posted the credit to this shop. Only after the money was verified. */
export function markCreditOrderGranted(orderId: string, by: string, now = new Date()): StaffDecisionResult {
  const at = now.toISOString();
  return transition(
    orderId,
    "UPDATE credit_orders SET status = 'granted', granted_at = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'paid'",
    [at, by, at],
  );
}

/** «رد شد»: a card-to-card transfer that never arrived. The note is shown to the seller. */
export function rejectCreditOrder(orderId: string, by: string, note: string, now = new Date()): StaffDecisionResult {
  const clean = note.trim().slice(0, 500);
  if (!clean) return { ok: false, error: "note_required" };
  const at = now.toISOString();
  return transition(
    orderId,
    "UPDATE credit_orders SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending' AND method = 'card_to_card'",
    [clean, by, at],
  );
}
