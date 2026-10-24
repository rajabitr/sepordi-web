"use server";

import { refresh } from "next/cache";

import { REJECT_REASONS, UUID_RE, type ActionResult, type RejectReason, type StatusMove } from "@/components/panel/orders/model";
import { requireCapability } from "@/server/auth/session";
import { recordActivity, type ActivityAction } from "@/server/audit";
import { approvePaymentEvidence, markOrderPaid, rejectPaymentEvidence, setOrderStatus } from "@/server/bizin/client";
import { toFarsiError } from "@/server/bizin/errors-fa";
import { en } from "@/lib/utils";
import type { Capability } from "@/server/team/roles";

import { forgetOrderStats } from "./_lib/stats";

/*
 * The seller's decisions on an order. Every one is the seller's own click after a confirmation: nothing here runs on
 * its own. The client keeps one idempotency key per intent, so a retried click is answered, not done twice.
 */

const MOVES: readonly StatusMove[] = ["packing", "shipped", "delivered", "cancelled"];
const KEY_RE = /^[\x21-\x7e]{1,255}$/;

const STALE: ActionResult = { ok: false, code: "bad_input", message: "اطلاعات این صفحه قدیمی است. صفحه را تازه کنید." };

async function run(cap: Capability, action: ActivityAction, orderId: string, call: (ext: string) => Promise<unknown>, meta?: Record<string, unknown>): Promise<ActionResult> {
  const { shop, user } = await requireCapability(cap);
  const ext = shop.external_business_id;
  try {
    await call(ext);
    recordActivity({ shop, user }, action, { type: "order", id: orderId }, meta);
    return { ok: true };
  } catch (e) {
    const f = toFarsiError(e);
    return { ok: false, code: f.code, message: f.message, requestId: f.requestId };
  } finally {
    // A failed decision may still mean the order moved under us (409): the page re-reads either way.
    forgetOrderStats(ext);
    refresh();
  }
}

export async function moveOrderAction(orderId: string, status: StatusMove, idempotencyKey: string): Promise<ActionResult> {
  if (!UUID_RE.test(orderId) || !MOVES.includes(status) || !KEY_RE.test(idempotencyKey)) return STALE;
  return run("orders.status", "order.status", orderId, (ext) => setOrderStatus(ext, orderId, { status }, { idempotencyKey }), { status });
}

export async function approveEvidenceAction(orderId: string, evidenceId: string, idempotencyKey: string): Promise<ActionResult> {
  if (!UUID_RE.test(orderId) || !UUID_RE.test(evidenceId) || !KEY_RE.test(idempotencyKey)) return STALE;
  return run("orders.payment", "order.receipt_approve", orderId, (ext) => approvePaymentEvidence(ext, orderId, evidenceId, { idempotencyKey }));
}

export async function rejectEvidenceAction(
  orderId: string,
  evidenceId: string,
  reason: RejectReason,
  note: string,
  idempotencyKey: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(orderId) || !UUID_RE.test(evidenceId) || !KEY_RE.test(idempotencyKey)) return STALE;
  if (!REJECT_REASONS.some((r) => r.value === reason)) {
    return { ok: false, code: "invalid_value", message: "دلیل رد رسید را انتخاب کنید." };
  }
  const trimmed = note.trim();
  if (trimmed.length > 500) return { ok: false, code: "invalid_value", message: "یادداشت حداکثر ۵۰۰ نویسه است." };
  return run("orders.payment", "order.receipt_reject", orderId, (ext) =>
    rejectPaymentEvidence(ext, orderId, evidenceId, { reason, ...(trimmed ? { note: trimmed } : {}) }, { idempotencyKey }),
  );
}

export async function markPaidAction(orderId: string, reference: string, idempotencyKey: string): Promise<ActionResult> {
  if (!UUID_RE.test(orderId) || !KEY_RE.test(idempotencyKey)) return STALE;
  const ref = en(reference).trim();
  if (ref.length > 64) return { ok: false, code: "invalid_value", message: "کد پیگیری حداکثر ۶۴ نویسه است." };
  return run("orders.payment", "order.mark_paid", orderId, (ext) => markOrderPaid(ext, orderId, ref ? { reference: ref } : {}, { idempotencyKey }));
}
