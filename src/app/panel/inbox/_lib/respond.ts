import "server-only";

import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";
import type { FaError } from "@/components/panel/inbox/model";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export const SIGNED_OUT: FaError = { message: "نشست شما تمام شده است. دوباره وارد شوید.", code: "unauthorized" };
export const NOT_FOUND: FaError = { message: "این گفت‌وگو دیگر وجود ندارد.", code: "conversation_not_found" };

export function faError(e: unknown): FaError {
  const { message, code, requestId } = toFarsiError(e);
  return requestId ? { message, code, requestId } : { message, code };
}

/** A JSON answer that is never cached by the browser or a proxy. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function errorJson(e: unknown): Response {
  const status = isBizinError(e) && e.status >= 400 ? e.status : 502;
  return json({ ok: false, error: faError(e) }, status);
}

export { sameOrigin } from "@/server/http/same-origin";
