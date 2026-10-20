/** A call to one of the panel's own Route Handlers, which answer `{error: {message, requestId}}` on failure. */
export type JsonResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string; requestId?: string };

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<JsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    return { ok: false, status: 0, message: "اتصال اینترنت برقرار نیست. اتصال را بررسی کنید و دوباره امتحان کنید." };
  }
  // A signed-out browser is redirected to the login page, which is HTML.
  if (res.redirected || !res.headers.get("content-type")?.includes("application/json")) {
    return { ok: false, status: res.status, message: "نشست شما تمام شده است. صفحه را تازه کنید و دوباره وارد شوید." };
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok || !body || typeof body !== "object") {
    const err = (body as { error?: { message?: unknown; requestId?: unknown } } | null)?.error;
    return {
      ok: false,
      status: res.status,
      message: typeof err?.message === "string" ? err.message : "کار انجام نشد. دوباره امتحان کنید.",
      requestId: typeof err?.requestId === "string" ? err.requestId : undefined,
    };
  }
  return { ok: true, data: body as T };
}
