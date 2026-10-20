import "server-only";

import { getDb } from "@/server/db";
import type { CreditOrderRow, CreditOrderStatus } from "@/server/db/repo";
import { confirmCreditPayment, markCreditOrderGranted, rejectCreditOrder, type StaffDecisionResult } from "@/server/credit/orders";

/*
 * The staff queue of credit orders. sepordi only records the decision: the AI credit itself is posted by a Bizin
 * operator, so «شارژ شد» is pressed after that, never instead of it.
 */

export type CreditStatus = CreditOrderStatus;
export const CREDIT_STATUSES: CreditStatus[] = ["pending", "paid", "granted", "rejected", "failed", "cancelled"];

export interface CreditQueueRow extends CreditOrderRow {
  shop_name: string | null;
  ext: string | null;
  phone: string | null;
  display_name: string | null;
}

/** A gateway order still `pending` is waiting on the buyer, not on staff, so it never enters the work queue. */
const NEEDS_STAFF = "((o.status = 'pending' AND o.method = 'card_to_card') OR o.status = 'paid')";

/** Work first (oldest first, the order they were paid in), then the rest newest first. */
export function listCreditQueue(status: CreditStatus | "all" = "all", limit = 200): CreditQueueRow[] {
  const where = status === "all" ? "" : status === "pending" ? "WHERE o.status = 'pending' AND o.method = 'card_to_card'" : "WHERE o.status = ?";
  const sql = `
    SELECT o.*, s.name AS shop_name, s.external_business_id AS ext, u.phone AS phone, u.display_name AS display_name
    FROM credit_orders o
    LEFT JOIN shops s ON s.id = o.shop_id
    LEFT JOIN users u ON u.id = s.user_id
    ${where}
    ORDER BY CASE WHEN ${NEEDS_STAFF} THEN 0 ELSE 1 END,
             CASE WHEN ${NEEDS_STAFF} THEN o.created_at END ASC,
             o.created_at DESC
    LIMIT ?`;
  const args = status === "all" || status === "pending" ? [limit] : [status, limit];
  return getDb().prepare(sql).all(...args) as unknown as CreditQueueRow[];
}

/** Orders waiting on staff: a card-to-card transfer to confirm, or a paid order to mark granted. */
export function pendingCreditCount(): number {
  const r = getDb().prepare(`SELECT COUNT(*) AS n FROM credit_orders o WHERE ${NEEDS_STAFF}`).get() as { n: number };
  return Number(r.n);
}

export type CreditDecision = "paid" | "granted" | "rejected";

export function decideCreditOrder(input: { id: string; decision: CreditDecision; note: string; by: string }): StaffDecisionResult {
  switch (input.decision) {
    case "paid":
      return confirmCreditPayment(input.id, input.by);
    case "granted":
      return markCreditOrderGranted(input.id, input.by);
    case "rejected":
      return rejectCreditOrder(input.id, input.by, input.note);
  }
}
