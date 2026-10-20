import "server-only";

import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";

import type { ActionFailure } from "./action-result";

export type Loaded<T> = { ok: true; data: T } | { ok: false; message: string; code: string; status: number; requestId?: string };

/** A Partner API read as a value: one failed card shows its own Farsi error instead of failing the page. */
export async function settle<T>(p: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    const f = toFarsiError(e);
    return { ok: false, message: f.message, code: f.code, status: isBizinError(e) ? e.status : 0, requestId: f.requestId };
  }
}

export function actionError(e: unknown): ActionFailure {
  const f = toFarsiError(e);
  return { ok: false, message: f.message, field: f.field, requestId: f.requestId };
}
