import "server-only";

/*
 * Zarinpal REST v4 (docs/zarinpal-payment.md). Amounts are Rial on the wire. The merchant id never leaves the
 * server; the gateway is off (card-to-card only) while ZARINPAL_MERCHANT_ID is unset.
 */

export interface ZarinpalConfig {
  merchantId: string;
  sandbox: boolean;
  /** Absolute URL Zarinpal sends the buyer back to. */
  callbackUrl: string;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 15_000;

export function zarinpalConfig(env: NodeJS.ProcessEnv = process.env): ZarinpalConfig | null {
  const merchantId = env.ZARINPAL_MERCHANT_ID?.trim();
  if (!merchantId) return null;
  const sandbox = env.ZARINPAL_SANDBOX === "1" || env.ZARINPAL_SANDBOX === "true";
  const base = (env.PUBLIC_BASE_URL || "https://sepordi.ir").replace(/\/+$/, "");
  return { merchantId, sandbox, callbackUrl: `${base}/api/payments/zarinpal/callback` };
}

const apiBase = (c: ZarinpalConfig) => (c.sandbox ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com");

export function startPayUrl(c: ZarinpalConfig, authority: string): string {
  const host = c.sandbox ? "https://sandbox.zarinpal.com" : "https://www.zarinpal.com";
  return `${host}/pg/StartPay/${encodeURIComponent(authority)}`;
}

async function post(c: ZarinpalConfig, path: string, body: unknown, fetchImpl: FetchLike): Promise<{ code?: number; data: Record<string, unknown> }> {
  const res = await fetchImpl(`${apiBase(c)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const data = (j.data && typeof j.data === "object" && !Array.isArray(j.data) ? j.data : {}) as Record<string, unknown>;
  // Failures carry the code under `errors`, with `data` an empty array.
  const errors = (j.errors && typeof j.errors === "object" && !Array.isArray(j.errors) ? j.errors : {}) as Record<string, unknown>;
  const code = typeof data.code === "number" ? data.code : typeof errors.code === "number" ? errors.code : undefined;
  return { code, data };
}

export async function requestPayment(
  c: ZarinpalConfig,
  input: { amountRial: number; description: string; mobile?: string; orderId: string },
  fetchImpl: FetchLike = fetch,
): Promise<{ ok: true; authority: string } | { ok: false; code?: number }> {
  const { code, data } = await post(
    c,
    "/pg/v4/payment/request.json",
    {
      merchant_id: c.merchantId,
      amount: input.amountRial,
      callback_url: c.callbackUrl,
      description: input.description,
      metadata: { ...(input.mobile ? { mobile: input.mobile } : {}), order_id: input.orderId },
    },
    fetchImpl,
  );
  if (code === 100 && typeof data.authority === "string" && data.authority) return { ok: true, authority: data.authority };
  return { ok: false, code };
}

/** 100 is a first verification, 101 a repeat of one already verified; both mean paid. */
export async function verifyPayment(
  c: ZarinpalConfig,
  input: { amountRial: number; authority: string },
  fetchImpl: FetchLike = fetch,
): Promise<{ ok: true; refId: string } | { ok: false; code?: number }> {
  const { code, data } = await post(
    c,
    "/pg/v4/payment/verify.json",
    { merchant_id: c.merchantId, amount: input.amountRial, authority: input.authority },
    fetchImpl,
  );
  if (code === 100 || code === 101) return { ok: true, refId: data.ref_id != null ? String(data.ref_id) : "" };
  return { ok: false, code };
}
