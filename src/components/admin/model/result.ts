/** What every staff Server Action answers. Browser-safe: client forms switch on `ok`. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; requestId?: string; fields?: Record<string, string> };
