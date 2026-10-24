"use server";

import QRCode from "qrcode";

import type { ActionResult } from "@/components/panel/overview/action-result";
import { requireSeller } from "@/server/auth/session";
import { beginEnrollment, confirmEnrollment, disableTwoStep } from "@/server/auth/two-step";
import { members } from "@/server/db/repo";

import { passwordHashOf } from "../account";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Two-step login is offered to shop owners: their account reaches payments, channels and the team. */
async function requireOwnerAccount() {
  const s = await requireSeller();
  return { ...s, isOwner: members.shopsFor(s.user.id).some((m) => m.role === "owner") };
}

export async function beginTwoStepAction(): Promise<ActionResult<{ qr: string; secret: string }>> {
  const { user, isOwner } = await requireOwnerAccount();
  if (!isOwner) return { ok: false, message: "ورود دومرحله‌ای فعلاً برای مالک فروشگاه است." };
  const e = beginEnrollment(user.id, user.phone);
  if (!e) return { ok: false, message: "ورود دومرحله‌ای همین حالا روشن است." };
  const qr = await QRCode.toDataURL(e.uri, { margin: 1, width: 240, errorCorrectionLevel: "M" });
  return { ok: true, data: { qr, secret: e.secret } };
}

export async function confirmTwoStepAction(code: unknown): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  const { user } = await requireSeller();
  const r = confirmEnrollment(user.id, str(code, 16));
  if (!r.ok) return { ok: false, field: "code", message: r.message };
  return { ok: true, data: { recoveryCodes: r.data } };
}

export async function disableTwoStepAction(input: { password?: unknown; code?: unknown }): Promise<ActionResult> {
  const { user } = await requireSeller();
  const r = await disableTwoStep(user.id, passwordHashOf(user.id), str(input?.password, 512), str(input?.code, 32));
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, data: null };
}
