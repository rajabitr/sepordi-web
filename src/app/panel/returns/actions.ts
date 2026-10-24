"use server";

import { refresh } from "next/cache";

import { UUID_RE } from "@/components/panel/orders/model";
import {
  CASE_REJECT_REASONS,
  CASE_STATES,
  allowedCaseActions,
  type CaseAction,
  type CaseRejectReason,
  type CaseState,
} from "@/components/panel/returns/model";
import type { ActionResult } from "@/components/panel/orders/model";
import { en } from "@/lib/utils";
import { requireCapability } from "@/server/auth/session";
import { recordActivity } from "@/server/audit";
import { actOnCase } from "@/server/bizin/client";
import { toFarsiError } from "@/server/bizin/errors-fa";

export interface CaseActionInput {
  action: CaseAction;
  /** The state the seller saw: a case that moved since is a 409, never a silent overwrite. */
  expectedState: CaseState;
  rejectReason?: CaseRejectReason;
  /** Rial; mark_refunded only. */
  refundAmount?: number;
  refundReference?: string;
  note?: string;
  notifyCustomer: boolean;
}

const KEY_RE = /^[\x21-\x7e]{1,255}$/;

/** Records the shop's decision on a return or complaint; Bizin moves no money, the refund is the seller's own transfer. */
export async function actOnCaseAction(caseId: string, input: CaseActionInput, idempotencyKey: string): Promise<ActionResult> {
  const { shop, user } = await requireCapability("returns.manage");
  if (!UUID_RE.test(caseId) || !KEY_RE.test(idempotencyKey) || !CASE_STATES.includes(input.expectedState)) {
    return { ok: false, code: "bad_input", message: "اطلاعات این صفحه قدیمی است. صفحه را تازه کنید." };
  }
  if (!allowedCaseActions(input.expectedState).includes(input.action)) {
    return { ok: false, code: "invalid_action", message: "این کار برای این درخواست مجاز نیست." };
  }
  if (input.action === "reject" && !CASE_REJECT_REASONS.some((r) => r.value === input.rejectReason)) {
    return { ok: false, code: "invalid_value", message: "دلیل رد درخواست را انتخاب کنید." };
  }
  const note = (input.note ?? "").trim();
  if (note.length > 1000) return { ok: false, code: "invalid_value", message: "یادداشت حداکثر ۱۰۰۰ نویسه است." };

  let refund: { amount?: number; reference?: string } | undefined;
  if (input.action === "mark_refunded") {
    const amount = input.refundAmount;
    if (amount !== undefined && (!Number.isSafeInteger(amount) || amount < 0)) {
      return { ok: false, code: "invalid_value", message: "مبلغ بازگشت پول درست نیست." };
    }
    const reference = en(input.refundReference ?? "").trim();
    if (reference.length > 64) return { ok: false, code: "invalid_value", message: "کد پیگیری حداکثر ۶۴ نویسه است." };
    refund = { ...(amount !== undefined ? { amount } : {}), ...(reference ? { reference } : {}) };
  }

  try {
    await actOnCase(
      shop.external_business_id,
      caseId,
      {
        action: input.action,
        expected_state: input.expectedState,
        ...(input.action === "reject" ? { reject_reason: input.rejectReason } : {}),
        ...(refund ? { refund } : {}),
        ...(note ? { note } : {}),
        notify_customer: input.notifyCustomer === true,
      },
      { idempotencyKey },
    );
    recordActivity({ shop, user }, "return.update", { type: "case", id: caseId }, { action: input.action });
    return { ok: true };
  } catch (e) {
    const f = toFarsiError(e);
    return { ok: false, code: f.code, message: f.message, requestId: f.requestId };
  } finally {
    refresh();
  }
}
