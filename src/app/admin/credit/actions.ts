"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/admin/model/result";
import { decideCreditOrder, type CreditDecision } from "@/server/admin/credit";
import { requireAdmin } from "@/server/auth/session";

const MESSAGES = {
  not_found: "این سفارش پیدا نشد.",
  wrong_state: "وضعیت این سفارش عوض شده است. صفحه را تازه کنید.",
  note_required: "دلیل رد را بنویسید.",
} as const;

const DECISIONS: readonly CreditDecision[] = ["paid", "granted", "rejected"];

export async function decideCreditOrderAction(id: string, decision: CreditDecision, note: string): Promise<ActionResult> {
  const { user } = await requireAdmin();
  if (typeof id !== "string" || !DECISIONS.includes(decision)) return { ok: false, message: MESSAGES.not_found };
  const r = decideCreditOrder({ id, decision, note: String(note ?? ""), by: user.display_name || user.phone });
  if (!r.ok) return { ok: false, message: MESSAGES[r.error], ...(r.error === "note_required" ? { fields: { note: MESSAGES.note_required } } : {}) };
  revalidatePath("/admin/credit");
  revalidatePath("/admin");
  return { ok: true, data: undefined };
}
