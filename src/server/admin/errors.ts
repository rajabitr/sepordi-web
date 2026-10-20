import "server-only";

import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";
import { DISCLOSURE_REASON_FA } from "@/components/admin/model/branding";
import type { ActionResult } from "@/components/admin/model/result";

export interface FaError {
  message: string;
  requestId?: string;
}

/** Any thrown value as staff-facing Farsi with Bizin's request id for support; never the raw error. */
export function faError(e: unknown): FaError {
  const f = toFarsiError(e);
  let message = f.message;
  if (isBizinError(e) && e.code === "disclosure_invalid") {
    const reason = e.params?.reason;
    if (typeof reason === "string" && DISCLOSURE_REASON_FA[reason]) message = DISCLOSURE_REASON_FA[reason];
  }
  if (isBizinError(e) && e.code === "insufficient_scope") message = "کلید سپردی دسترسی این کار را ندارد. دسترسی‌های کلید را در صفحه‌ی نمای کلی ببینید.";
  return { message, requestId: f.requestId };
}

export function failed(e: unknown): Extract<ActionResult<never>, { ok: false }> {
  return { ok: false, ...faError(e) };
}

export type Loaded<T> = { ok: true; data: T } | ({ ok: false } & FaError);

/** A Partner API read for a page: the screen renders its error box instead of the route's error page. */
export async function load<T>(p: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    return { ok: false, ...faError(e) };
  }
}
