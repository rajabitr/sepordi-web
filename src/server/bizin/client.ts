import "server-only";

import { randomUUID } from "node:crypto";

import { BizinError, parseRetryAfter } from "./error";
import type { Body, Ok, Query } from "./schema";
import { bizinMode, liveTransport, type Transport, type TransportRequest } from "./transport";

/*
 * The only door to Bizin's Partner API. Server-only: the partner key opens EVERY business of the partner,
 * so callers pass an `ext` that came from the logged-in seller's own DB row (requireSeller), never from a
 * URL, form or body.
 */

const TIMEOUT_MS = 30_000;
/** A longer wait than this is better reported to the seller than slept through inside a request. */
const MAX_RETRY_AFTER_S = 10;

export interface WriteOptions {
  /** Reuse the same key when retrying the same intent (a signup, a reply); default a fresh UUID. */
  idempotencyKey?: string;
}

type Method = TransportRequest["method"];
type QueryValue = string | number | boolean | readonly (string | number | boolean)[] | undefined | null;

interface Call {
  method: Method;
  path: string;
  query?: Record<string, QueryValue>;
  json?: unknown;
  form?: FormData;
  idempotencyKey?: string;
  accept?: string;
}

let override: Transport | undefined;

/** Tests swap the transport; production code never calls this. */
export function setTransportForTests(t: Transport | undefined): void {
  override = t;
}

async function transport(): Promise<Transport> {
  if (override) return override;
  if (bizinMode() === "mock") {
    const { mockTransport } = await import("./mock");
    return mockTransport;
  }
  return liveTransport();
}

/** Percent-escapes one path segment (`ext`, ids): a `/` or `?` in an external id must not change the route. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}

function queryString(query: Call["query"]): string {
  if (!query) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) for (const item of v) qs.append(k, String(item));
    else qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(call: Call): Promise<{ res: Response; requestId: string }> {
  const t = await transport();
  const requestId = randomUUID();
  const headers: Record<string, string> = {
    Accept: call.accept ?? "application/json",
    "X-Request-Id": requestId,
    "User-Agent": "sepordi-web/1",
  };
  if (call.method === "POST" || call.method === "PATCH" || call.method === "DELETE") {
    headers["Idempotency-Key"] = call.idempotencyKey ?? randomUUID();
  }
  let body: string | FormData | undefined;
  if (call.form) body = call.form;
  else if (call.json !== undefined) {
    body = JSON.stringify(call.json);
    headers["Content-Type"] = "application/json";
  }
  const path = `${call.path}${queryString(call.query)}`;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await t({ method: call.method, path, headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (e instanceof BizinError) throw e;
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new BizinError({
        status: 0,
        code: timedOut ? "timeout" : "network_error",
        message: e instanceof Error ? e.message : String(e),
        requestId,
      });
    }
    if (res.status === 429 && attempt === 0) {
      const wait = parseRetryAfter(res.headers.get("retry-after")) ?? 1;
      if (wait <= MAX_RETRY_AFTER_S) {
        await res.body?.cancel();
        await sleep(wait * 1000);
        continue;
      }
    }
    return { res, requestId };
  }
}

async function json<T>(call: Call): Promise<T> {
  const { res, requestId } = await send(call);
  if (!res.ok) throw await BizinError.fromResponse(res, requestId);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function none(call: Call): Promise<void> {
  const { res, requestId } = await send(call);
  if (!res.ok) throw await BizinError.fromResponse(res, requestId);
  await res.body?.cancel();
}

/** For media, receipts and case photos: the caller proxies the body as-is (never cached, see the route). */
async function stream(call: Call): Promise<Response> {
  const { res, requestId } = await send({ ...call, accept: call.accept ?? "*/*" });
  if (!res.ok) throw await BizinError.fromResponse(res, requestId);
  return res;
}

const T = (ext: string) => `/tenants/${seg(ext)}`;

// ---- identity -------------------------------------------------------------------------------------------

export const getMe = () => json<Ok<"getMe">>({ method: "GET", path: "/me" });

// ---- tenants ----------------------------------------------------------------------------------------------

export const createTenant = (body: Body<"createTenant">, opts?: WriteOptions) =>
  json<Ok<"createTenant">>({ method: "POST", path: "/tenants", json: body, ...opts });

export const listTenants = (query?: Query<"listTenants">) =>
  json<Ok<"listTenants">>({ method: "GET", path: "/tenants", query });

export const getTenant = (ext: string) => json<Ok<"getTenant">>({ method: "GET", path: T(ext) });

export const getTenantStats = (ext: string, query?: Query<"getTenantStats">) =>
  json<Ok<"getTenantStats">>({ method: "GET", path: `${T(ext)}/stats`, query });

export const createActivationLink = (ext: string, opts?: WriteOptions) =>
  json<Ok<"createActivationLink">>({ method: "POST", path: `${T(ext)}/owner/activation-link`, ...opts });

// ---- channels ---------------------------------------------------------------------------------------------

export const getTenantChannels = (ext: string) =>
  json<Ok<"getTenantChannels">>({ method: "GET", path: `${T(ext)}/channels` });

export const connectWhatsApp = (ext: string, body: Body<"connectWhatsApp"> = {}, opts?: WriteOptions) =>
  json<Ok<"connectWhatsApp">>({ method: "POST", path: `${T(ext)}/channels/whatsapp`, json: body, ...opts });

export const getWhatsAppPairing = (ext: string, channelId: string) =>
  json<Ok<"getWhatsAppPairing">>({
    method: "GET",
    path: `${T(ext)}/channels/whatsapp/${seg(channelId)}/pairing`,
  });

export const connectTelegram = (ext: string, body: Body<"connectTelegram">, opts?: WriteOptions) =>
  json<Ok<"connectTelegram">>({ method: "POST", path: `${T(ext)}/channels/telegram`, json: body, ...opts });

export const createConnectLink = (ext: string, body: Body<"createConnectLink">, opts?: WriteOptions) =>
  json<Ok<"createConnectLink">>({ method: "POST", path: `${T(ext)}/connect-links`, json: body, ...opts });

export const disconnectChannel = (ext: string, channelId: string, opts?: WriteOptions) =>
  none({ method: "DELETE", path: `${T(ext)}/channels/${seg(channelId)}`, ...opts });

// ---- catalogue --------------------------------------------------------------------------------------------

export const listProducts = (ext: string, query?: Query<"listProducts">) =>
  json<Ok<"listProducts">>({ method: "GET", path: `${T(ext)}/products`, query });

export const getProduct = (ext: string, productExt: string) =>
  json<Ok<"getProduct">>({ method: "GET", path: `${T(ext)}/products/${seg(productExt)}` });

export const putProduct = (ext: string, productExt: string, body: Body<"putProduct">) =>
  json<Ok<"putProduct">>({ method: "PUT", path: `${T(ext)}/products/${seg(productExt)}`, json: body });

export const deleteProduct = (ext: string, productExt: string, opts?: WriteOptions) =>
  none({ method: "DELETE", path: `${T(ext)}/products/${seg(productExt)}`, ...opts });

export const createCatalogImportJob = (
  ext: string,
  body: Body<"createCatalogImportJob"> | FormData,
  opts?: WriteOptions,
) =>
  json<Ok<"createCatalogImportJob">>({
    method: "POST",
    path: `${T(ext)}/catalog-import-jobs`,
    ...(body instanceof FormData ? { form: body } : { json: body }),
    ...opts,
  });

export const listCatalogImportJobs = (ext: string, query?: Query<"listCatalogImportJobs">) =>
  json<Ok<"listCatalogImportJobs">>({ method: "GET", path: `${T(ext)}/catalog-import-jobs`, query });

export const getCatalogImportJob = (ext: string, jobId: string) =>
  json<Ok<"getCatalogImportJob">>({ method: "GET", path: `${T(ext)}/catalog-import-jobs/${seg(jobId)}` });

export const listCatalogImportJobRows = (ext: string, jobId: string, query?: Query<"listCatalogImportJobRows">) =>
  json<Ok<"listCatalogImportJobRows">>({
    method: "GET",
    path: `${T(ext)}/catalog-import-jobs/${seg(jobId)}/rows`,
    query,
  });

export const commitCatalogImportJob = (ext: string, jobId: string, opts?: WriteOptions) =>
  json<Ok<"commitCatalogImportJob">>({
    method: "POST",
    path: `${T(ext)}/catalog-import-jobs/${seg(jobId)}/commit`,
    ...opts,
  });

export const cancelCatalogImportJob = (ext: string, jobId: string, opts?: WriteOptions) =>
  json<Ok<"cancelCatalogImportJob">>({
    method: "POST",
    path: `${T(ext)}/catalog-import-jobs/${seg(jobId)}/cancel`,
    ...opts,
  });

// ---- assistant, policies, payment details, shipping --------------------------------------------------------

export const getAssistant = (ext: string) => json<Ok<"getAssistant">>({ method: "GET", path: `${T(ext)}/assistant` });

export const updateAssistant = (ext: string, body: Body<"updateAssistant">) =>
  json<Ok<"updateAssistant">>({ method: "PUT", path: `${T(ext)}/assistant`, json: body });

export const getReturnPolicy = (ext: string) =>
  json<Ok<"getReturnPolicy">>({ method: "GET", path: `${T(ext)}/return-policy` });

export const putReturnPolicy = (ext: string, body: Body<"putReturnPolicy">) =>
  json<Ok<"putReturnPolicy">>({ method: "PUT", path: `${T(ext)}/return-policy`, json: body });

export const getPaymentDetails = (ext: string) =>
  json<Ok<"getPaymentDetails">>({ method: "GET", path: `${T(ext)}/payment-details` });

export const putPaymentDetails = (ext: string, body: Body<"putPaymentDetails">) =>
  json<Ok<"putPaymentDetails">>({ method: "PUT", path: `${T(ext)}/payment-details`, json: body });

export const getShipping = (ext: string) => json<Ok<"getShipping">>({ method: "GET", path: `${T(ext)}/shipping` });

export const putShipping = (ext: string, body: Body<"putShipping">) =>
  json<Ok<"putShipping">>({ method: "PUT", path: `${T(ext)}/shipping`, json: body });

// ---- inbox ------------------------------------------------------------------------------------------------

const C = (ext: string, conversationId: string) => `${T(ext)}/conversations/${seg(conversationId)}`;

export const listConversations = (ext: string, query?: Query<"listConversations">) =>
  json<Ok<"listConversations">>({ method: "GET", path: `${T(ext)}/conversations`, query });

export const getConversation = (ext: string, conversationId: string) =>
  json<Ok<"getConversation">>({ method: "GET", path: C(ext, conversationId) });

export const listMessages = (ext: string, conversationId: string, query?: Query<"listMessages">) =>
  json<Ok<"listMessages">>({ method: "GET", path: `${C(ext, conversationId)}/messages`, query });

export const getMessage = (ext: string, conversationId: string, messageId: string) =>
  json<Ok<"getMessage">>({ method: "GET", path: `${C(ext, conversationId)}/messages/${seg(messageId)}` });

/** 201 = the saved message; 202 `{status:"sent_not_saved"}` = delivered but not stored: do not resend. */
export const replyToConversation = (
  ext: string,
  conversationId: string,
  body: Body<"replyToConversation">,
  opts?: WriteOptions,
) => json<Ok<"replyToConversation">>({ method: "POST", path: `${C(ext, conversationId)}/reply`, json: body, ...opts });

export const claimConversation = (ext: string, conversationId: string, opts?: WriteOptions) =>
  json<Ok<"claimConversation">>({ method: "POST", path: `${C(ext, conversationId)}/claim`, ...opts });

export const releaseConversation = (ext: string, conversationId: string, opts?: WriteOptions) =>
  json<Ok<"releaseConversation">>({ method: "POST", path: `${C(ext, conversationId)}/release`, ...opts });

export const moveConversationQueue = (
  ext: string,
  conversationId: string,
  body: Body<"moveConversationQueue">,
  opts?: WriteOptions,
) => json<Ok<"moveConversationQueue">>({ method: "POST", path: `${C(ext, conversationId)}/queue`, json: body, ...opts });

/** `form` carries one `file` (JPEG/PNG ≤ 8 MiB). */
export const uploadInboxMedia = (ext: string, form: FormData, opts?: WriteOptions) =>
  json<Ok<"uploadInboxMedia">>({ method: "POST", path: `${T(ext)}/media`, form, ...opts });

export const getInboxMedia = (ext: string, mediaId: string) =>
  stream({ method: "GET", path: `${T(ext)}/media/${seg(mediaId)}` });

// ---- orders and payments ----------------------------------------------------------------------------------

const O = (ext: string, orderId: string) => `${T(ext)}/orders/${seg(orderId)}`;

export const listOrders = (ext: string, query?: Query<"listOrders">) =>
  json<Ok<"listOrders">>({ method: "GET", path: `${T(ext)}/orders`, query });

export const getOrder = (ext: string, orderId: string) => json<Ok<"getOrder">>({ method: "GET", path: O(ext, orderId) });

export const setOrderStatus = (ext: string, orderId: string, body: Body<"setOrderStatus">, opts?: WriteOptions) =>
  json<Ok<"setOrderStatus">>({ method: "POST", path: `${O(ext, orderId)}/status`, json: body, ...opts });

export const listPaymentEvidence = (ext: string, orderId: string) =>
  json<Ok<"listPaymentEvidence">>({ method: "GET", path: `${O(ext, orderId)}/payment-evidence` });

/** An image receipt streams its bytes; a text receipt answers JSON `{kind:"text", text}`. Check Content-Type. */
export const getPaymentEvidenceContent = (ext: string, orderId: string, evidenceId: string) =>
  stream({ method: "GET", path: `${O(ext, orderId)}/payment-evidence/${seg(evidenceId)}/content` });

export const approvePaymentEvidence = (ext: string, orderId: string, evidenceId: string, opts?: WriteOptions) =>
  json<Ok<"approvePaymentEvidence">>({
    method: "POST",
    path: `${O(ext, orderId)}/payment-evidence/${seg(evidenceId)}/approve`,
    json: {},
    ...opts,
  });

export const rejectPaymentEvidence = (
  ext: string,
  orderId: string,
  evidenceId: string,
  body: Body<"rejectPaymentEvidence">,
  opts?: WriteOptions,
) =>
  json<Ok<"rejectPaymentEvidence">>({
    method: "POST",
    path: `${O(ext, orderId)}/payment-evidence/${seg(evidenceId)}/reject`,
    json: body,
    ...opts,
  });

export const markOrderPaid = (ext: string, orderId: string, body: Body<"markOrderPaid"> = {}, opts?: WriteOptions) =>
  json<Ok<"markOrderPaid">>({ method: "POST", path: `${O(ext, orderId)}/mark-paid`, json: body, ...opts });

// ---- returns and complaints -------------------------------------------------------------------------------

export const listCases = (ext: string, query?: Query<"listCases">) =>
  json<Ok<"listCases">>({ method: "GET", path: `${T(ext)}/cases`, query });

export const getCase = (ext: string, caseId: string) =>
  json<Ok<"getCase">>({ method: "GET", path: `${T(ext)}/cases/${seg(caseId)}` });

export const getCasePhoto = (ext: string, caseId: string, photoId: string) =>
  stream({ method: "GET", path: `${T(ext)}/cases/${seg(caseId)}/photos/${seg(photoId)}` });

export const actOnCase = (ext: string, caseId: string, body: Body<"actOnCase">, opts?: WriteOptions) =>
  json<Ok<"actOnCase">>({ method: "POST", path: `${T(ext)}/cases/${seg(caseId)}/actions`, json: body, ...opts });

// ---- entitlements and branding (partner-wide unless a tenant is named) ------------------------------------

export const getContract = () => json<Ok<"getContract">>({ method: "GET", path: "/entitlements" });

export const getShopEntitlements = (ext: string) =>
  json<Ok<"getShopEntitlements">>({ method: "GET", path: `${T(ext)}/entitlements` });

export const putShopEntitlements = (ext: string, body: Body<"putShopEntitlements">) =>
  json<Ok<"putShopEntitlements">>({ method: "PUT", path: `${T(ext)}/entitlements`, json: body });

export const getBranding = () => json<Ok<"getBranding">>({ method: "GET", path: "/branding" });

export const putBranding = (body: Body<"putBranding">) =>
  json<Ok<"putBranding">>({ method: "PUT", path: "/branding", json: body });

export const putBrandDisclosure = (locale: "en" | "ar" | "fa", body: Body<"putBrandDisclosure">) =>
  json<Ok<"putBrandDisclosure">>({ method: "PUT", path: `/branding/disclosures/${seg(locale)}`, json: body });

export const uploadBrandLogo = (form: FormData, opts?: WriteOptions) =>
  json<Ok<"uploadBrandLogo">>({ method: "POST", path: "/branding/logo", form, ...opts });

// ---- webhooks (partner-wide) ------------------------------------------------------------------------------

export const listWebhooks = () => json<Ok<"listWebhooks">>({ method: "GET", path: "/webhooks" });

/** The answer's `secret` is shown once: store it (BIZIN_WEBHOOK_SECRETS) before doing anything else. */
export const createWebhook = (body: Body<"createWebhook">, opts?: WriteOptions) =>
  json<Ok<"createWebhook">>({ method: "POST", path: "/webhooks", json: body, ...opts });

export const getWebhook = (id: string) => json<Ok<"getWebhook">>({ method: "GET", path: `/webhooks/${seg(id)}` });

export const updateWebhook = (id: string, body: Body<"updateWebhook">, opts?: WriteOptions) =>
  json<Ok<"updateWebhook">>({ method: "PATCH", path: `/webhooks/${seg(id)}`, json: body, ...opts });

export const deleteWebhook = (id: string, opts?: WriteOptions) =>
  none({ method: "DELETE", path: `/webhooks/${seg(id)}`, ...opts });

export const rotateWebhookSecret = (id: string, opts?: WriteOptions) =>
  json<Ok<"rotateWebhookSecret">>({ method: "POST", path: `/webhooks/${seg(id)}/rotate-secret`, ...opts });

export const pingWebhook = (id: string, opts?: WriteOptions) =>
  json<Ok<"pingWebhook">>({ method: "POST", path: `/webhooks/${seg(id)}/ping`, ...opts });

export const listWebhookDeliveries = (id: string, query?: Query<"listWebhookDeliveries">) =>
  json<Ok<"listWebhookDeliveries">>({ method: "GET", path: `/webhooks/${seg(id)}/deliveries`, query });

// ---- bulk onboarding (partner-wide) -----------------------------------------------------------------------

export const createOnboardingJob = (body: Body<"createOnboardingJob"> | FormData, opts?: WriteOptions) =>
  json<Ok<"createOnboardingJob">>({
    method: "POST",
    path: "/onboarding-jobs",
    ...(body instanceof FormData ? { form: body } : { json: body }),
    ...opts,
  });

export const listOnboardingJobs = (query?: Query<"listOnboardingJobs">) =>
  json<Ok<"listOnboardingJobs">>({ method: "GET", path: "/onboarding-jobs", query });

export const getOnboardingJob = (jobId: string) =>
  json<Ok<"getOnboardingJob">>({ method: "GET", path: `/onboarding-jobs/${seg(jobId)}` });

export const listOnboardingJobRows = (jobId: string, query?: Query<"listOnboardingJobRows">) =>
  json<Ok<"listOnboardingJobRows">>({ method: "GET", path: `/onboarding-jobs/${seg(jobId)}/rows`, query });

export const commitOnboardingJob = (jobId: string, opts?: WriteOptions) =>
  json<Ok<"commitOnboardingJob">>({ method: "POST", path: `/onboarding-jobs/${seg(jobId)}/commit`, ...opts });

export const cancelOnboardingJob = (jobId: string, opts?: WriteOptions) =>
  json<Ok<"cancelOnboardingJob">>({ method: "POST", path: `/onboarding-jobs/${seg(jobId)}/cancel`, ...opts });
