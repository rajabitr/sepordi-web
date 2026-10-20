export type ActionFailure = { ok: false; message: string; field?: string; requestId?: string };

/** What every panel Server Action answers; the client shows `message` (already Farsi) in a toast or under a field. */
export type ActionResult<T = null> = { ok: true; data: T } | ActionFailure;

/** «… کد پیگیری: …» for a toast, unless the message already carries the id. */
export function failureText(r: ActionFailure): string {
  return r.requestId && !r.message.includes(r.requestId) ? `${r.message} (کد پیگیری: ${r.requestId})` : r.message;
}
