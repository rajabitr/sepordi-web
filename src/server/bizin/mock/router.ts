import "server-only";

import { randomUUID } from "node:crypto";

import type { Schemas } from "../schema";
import type { TransportRequest } from "../transport";
import { seedTenant } from "./fixtures";
import type { MockTenant, MockWorld } from "./state";

class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly field?: string,
    readonly params?: Record<string, unknown>,
  ) {
    super(code);
  }
}

const fail = (status: number, code: string, field?: string, params?: Record<string, unknown>): never => {
  throw new MockHttpError(status, code, field, params);
};

interface Ctx {
  world: MockWorld;
  params: string[];
  query: URLSearchParams;
  body: unknown;
  form?: FormData;
  now: number;
}

type Result = { status: number; json?: unknown; bytes?: { mime: string; data: Buffer } };
type Handler = (c: Ctx) => Result | Promise<Result>;

const ok = (json: unknown, status = 200): Result => ({ status, json });
const noContent = (): Result => ({ status: 204 });
const iso = (ms: number) => new Date(ms).toISOString();
const QUEUES = ["sales", "support", "accounting", "appointment", "fulfillment"];
const PAYMENT_REJECT = ["amount_mismatch", "unreadable", "not_received", "wrong_destination", "other"];

function tenant(c: Ctx): MockTenant {
  return c.world.tenants.get(c.params[0]) ?? fail(404, "tenant_not_found");
}

function obj(c: Ctx): Record<string, unknown> {
  if (c.body === undefined || c.body === null) return {};
  if (typeof c.body !== "object" || Array.isArray(c.body)) fail(400, "bad_request_body");
  return c.body as Record<string, unknown>;
}

function page<T>(c: Ctx, items: T[], max = 100): { items: T[]; next_cursor: string | null } {
  const limit = c.query.has("limit") ? Number(c.query.get("limit")) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > max) fail(400, "limit_invalid", undefined, { max });
  const cursor = c.query.get("cursor");
  const offset = cursor ? Number(Buffer.from(cursor, "base64url").toString()) : 0;
  if (!Number.isInteger(offset) || offset < 0) fail(400, "invalid_value", "cursor");
  const next = offset + limit < items.length ? Buffer.from(String(offset + limit)).toString("base64url") : null;
  return { items: items.slice(offset, offset + limit), next_cursor: next };
}

function luhn(d: string): boolean {
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

function ibanOk(iban: string): boolean {
  if (!/^IR\d{24}$/.test(iban)) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

const findOrder = (t: MockTenant, id: string) => t.orders.find((o) => o.id === id) ?? fail(404, "order_not_found");
const findConversation = (t: MockTenant, id: string) =>
  t.conversations.find((cv) => cv.id === id) ?? fail(404, "conversation_not_found");
const findEvidence = (t: MockTenant, orderId: string, evidenceId: string) =>
  t.evidence.get(orderId)?.find((e) => e.id === evidenceId) ?? fail(404, "evidence_not_found");
const findCase = (t: MockTenant, id: string) => t.cases.find((k) => k.id === id) ?? fail(404, "case_not_found");
const findHook = (c: Ctx) => c.world.webhooks.find((w) => w.id === c.params[0]) ?? fail(404, "not_found");

function refreshPayment(t: MockTenant, order: Schemas["Order"]) {
  order.payment.pending_evidence = (t.evidence.get(order.id) ?? []).filter((e) => e.status === "pending_verification").length;
  for (const cv of t.conversations) {
    if (cv.related_order?.id === order.id) {
      cv.related_order = { id: order.id, code: order.code, status: order.status, payment_status: order.payment.status };
    }
  }
}

const NEXT_STATUS: Partial<Record<Schemas["OrderStatus"], Schemas["OrderStatus"][]>> = {
  draft: ["cancelled"],
  confirmed: ["cancelled"],
  paid: ["packing", "shipped", "cancelled"],
  packing: ["shipped", "cancelled"],
  shipped: ["delivered"],
};

const ALL_SCOPES: Schemas["Scope"][] = [
  "tenants:provision", "tenants:read", "channels:read", "channels:connect", "stats:read", "webhooks:manage",
  "users:activate", "orders:read", "orders:fulfil", "assistant:read", "assistant:write", "payments:read",
  "payments:write", "payments:verify", "catalog:read", "catalog:write", "cases:read", "cases:write",
  "inbox:read", "inbox:media", "inbox:write", "shipping:read", "shipping:write", "entitlements:read",
  "entitlements:write", "branding:read", "branding:write",
];

function newJob<K extends "products" | "tenants">(c: Ctx, kind: K, rows: number) {
  return {
    id: randomUUID(),
    kind,
    status: "ready" as const,
    format: c.form ? ("csv" as const) : ("json" as const),
    filename: c.form ? String((c.form.get("file") as File | null)?.name ?? "") : "",
    on_errors: "skip" as const,
    counts: { rows, valid: rows, will_create: rows, will_update: 0, unchanged: 0, failed: 0 },
    result: null,
    error: null,
    warnings: [],
    created_at: iso(c.now),
    committed_at: null,
    finished_at: null,
    expires_at: iso(c.now + 24 * 3600_000),
  };
}

function finishJob(c: Ctx, job: Schemas["CatalogImportJob"] | Schemas["OnboardingJob"], action: string): Result {
  if (job.status !== "ready") fail(409, "job_not_ready");
  if (action === "cancel") {
    job.status = "cancelled";
    return ok(job);
  }
  Object.assign(job, {
    status: "done",
    committed_at: iso(c.now),
    finished_at: iso(c.now),
    result: { created: job.counts.will_create, updated: 0, unchanged: 0, failed: 0, not_attempted: 0 },
  });
  return ok(job, 202);
}

// ---- handlers ----------------------------------------------------------------------------------------------

const routes: [TransportRequest["method"], RegExp, Handler][] = [
  ["GET", /^\/me$/, (c) =>
    ok({ partner_id: c.world.partnerId, key_id: "mockkey000000000", scopes: ALL_SCOPES, limits: { api_rate_per_minute: 120, api_burst: 60, provision_per_day: 200 } })],

  // tenants
  ["POST", /^\/tenants$/, (c) => {
    const b = obj(c) as Partial<Schemas["CreateTenantRequest"]>;
    const ext = b.external_business_id;
    if (typeof ext !== "string" || ext.length < 1 || ext.length > 128) return fail(422, "external_business_id_invalid", "external_business_id");
    if (!b.name) fail(422, "invalid_value", "name");
    if (!b.owner?.email || !b.owner.external_user_id) return fail(422, "invalid_value", "owner.email");
    const existing = c.world.tenants.get(ext);
    if (existing) {
      if (existing.detail.owner?.external_user_id !== b.owner.external_user_id || existing.ownerEmail !== b.owner.email) fail(409, "owner_mismatch");
      return ok({ ...existing.detail, created: false });
    }
    for (const t of c.world.tenants.values()) if (t.ownerEmail === b.owner.email) fail(409, "owner_email_in_use", "owner.email");
    const t = seedTenant(c.world, { ext, name: b.name!, flavor: "jewelry", ownerExternalId: b.owner.external_user_id, ownerEmail: b.owner.email, now: c.now, demo: false });
    t.detail.tenant.reply_language = (b.reply_language as Schemas["ReplyLanguage"]) ?? "en";
    t.detail.tenant.market_profile = b.market_profile ?? "ir";
    c.world.tenants.set(ext, t);
    return ok({ ...t.detail, created: true }, 201);
  }],
  ["GET", /^\/tenants$/, (c) => {
    const all = [...c.world.tenants.values()].map((t) => t.detail.tenant).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const p = page(c, all);
    return ok({ tenants: p.items, next_cursor: p.next_cursor });
  }],
  ["GET", /^\/tenants\/([^/]+)$/, (c) => ok(tenant(c).detail)],
  ["GET", /^\/tenants\/([^/]+)\/stats$/, (c) => {
    const t = tenant(c);
    const to = c.query.get("to") ?? t.stats[t.stats.length - 1].date;
    const from = c.query.get("from") ?? t.stats[Math.max(0, t.stats.length - 7)].date;
    if (from > to) fail(400, "stats_range_invalid", undefined, { max_days: 92 });
    return ok({ days: t.stats.filter((d) => d.date >= from && d.date <= to) });
  }],
  ["POST", /^\/tenants\/([^/]+)\/owner\/activation-link$/, (c) => {
    if (tenant(c).detail.owner?.status === "active") fail(409, "owner_already_active");
    return ok({ activation_url: `https://www.bizin.app/activate/mock-${randomUUID()}`, expires_at: iso(c.now + 72 * 3600_000) }, 201);
  }],

  // channels
  ["GET", /^\/tenants\/([^/]+)\/channels$/, (c) => ok({ channels: tenant(c).detail.channels })],
  ["POST", /^\/tenants\/([^/]+)\/channels\/whatsapp$/, (c) => {
    const t = tenant(c);
    for (const p of t.pairings.values()) if (p.status === "pending" || p.status === "qr") fail(409, "whatsapp_pairing_in_progress");
    const channelId = randomUUID();
    t.pairings.set(channelId, { channelId, polls: 0, status: "pending", expiresAt: iso(c.now + 3 * 60_000) });
    t.detail.channels.push({ channel_id: channelId, kind: "whatsapp", status: "pairing", connected_at: null, health: null });
    return ok({ channel_id: channelId, status: "pending" }, 201);
  }],
  ["GET", /^\/tenants\/([^/]+)\/channels\/whatsapp\/([^/]+)\/pairing$/, (c) => {
    const t = tenant(c);
    const p = t.pairings.get(c.params[1]) ?? fail(404, "channel_account_not_found");
    p.polls++;
    if (p.status === "pending" || p.status === "qr") {
      if (p.polls >= 4) {
        p.status = "connected";
        const ch = t.detail.channels.find((x) => x.channel_id === p.channelId);
        if (ch) Object.assign(ch, { status: "connected", connected_at: iso(c.now), health: { state: "ok", reason: "none", since: iso(c.now) } });
      } else if (p.polls >= 2) p.status = "qr";
    }
    if (p.status === "qr") {
      const r = randomUUID().replace(/-/g, "");
      return ok({ status: "qr", qr: `2@${r.slice(0, 16)},${r.slice(16)},mock${p.polls}`, expires_at: iso(c.now + 20_000) });
    }
    return ok({ status: p.status, expires_at: p.status === "connected" ? null : p.expiresAt });
  }],
  ["POST", /^\/tenants\/([^/]+)\/channels\/telegram$/, (c) => {
    const t = tenant(c);
    const token = obj(c).bot_token;
    if (typeof token !== "string" || !/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token)) fail(422, "telegram_token_invalid", "bot_token");
    const channelId = randomUUID();
    t.detail.channels.push({ channel_id: channelId, kind: "telegram", status: "connected", connected_at: iso(c.now), health: { state: "unknown", reason: "none", since: iso(c.now) } });
    return ok({ channel_id: channelId, status: "connected" }, 201);
  }],
  ["POST", /^\/tenants\/([^/]+)\/connect-links$/, (c) => {
    tenant(c);
    const b = obj(c);
    if (b.channel !== "instagram") fail(400, "channel_not_supported", "channel", { allowed: ["instagram"] });
    const back = b.return_url;
    if (typeof back !== "string" || !back.startsWith("https://")) return fail(400, "return_url_not_allowed", "return_url");
    const id = randomUUID();
    // The mock skips Meta: the link lands straight on return_url as a successful connect.
    return ok({ id, url: `${back}${back.includes("?") ? "&" : "?"}status=connected&channel=instagram&link=${id}`, expires_at: iso(c.now + 15 * 60_000) }, 201);
  }],
  ["DELETE", /^\/tenants\/([^/]+)\/channels\/([^/]+)$/, (c) => {
    const t = tenant(c);
    const i = t.detail.channels.findIndex((x) => x.channel_id === c.params[1]);
    if (i < 0) fail(404, "channel_account_not_found");
    t.detail.channels.splice(i, 1);
    t.pairings.delete(c.params[1]);
    return noContent();
  }],

  // catalogue
  ["GET", /^\/tenants\/([^/]+)\/products$/, (c) => {
    const p = page(c, tenant(c).products.filter((x) => x.active));
    return ok({ products: p.items, next_cursor: p.next_cursor });
  }],
  ["GET", /^\/tenants\/([^/]+)\/products\/([^/]+)$/, (c) =>
    ok(tenant(c).products.find((p) => p.external_id === c.params[1]) ?? fail(404, "product_not_found"))],
  ["PUT", /^\/tenants\/([^/]+)\/products\/([^/]+)$/, (c) => {
    const t = tenant(c);
    const b = obj(c) as Partial<Schemas["ProductPut"]>;
    if (!b.title || typeof b.title !== "string") return fail(422, "invalid_value", "title");
    if (typeof b.active !== "boolean") return fail(422, "invalid_value", "active");
    if (!Array.isArray(b.variants) || b.variants.length < 1 || b.variants.length > 200) return fail(422, "invalid_value", "variants");
    for (const v of b.variants) if (!Number.isInteger(v.price) || v.price < 0) fail(422, "invalid_value", "variants.price");
    if (b.sku && t.products.some((p) => p.sku === b.sku && p.external_id !== c.params[1])) fail(409, "sku_taken", "sku");
    const existing = t.products.find((p) => p.external_id === c.params[1]);
    const variants: Schemas["Variant"][] = b.variants.map((v) => {
      const prev = existing?.variants.find((x) => x.external_id === v.external_id);
      return { id: prev?.id ?? randomUUID(), external_id: v.external_id, title: v.title ?? (v.options ?? []).join(" / "), price: v.price, stock: v.stock ?? null, active: true };
    });
    for (const old of existing?.variants ?? []) if (!variants.some((v) => v.id === old.id)) variants.push({ ...old, active: false });
    const product: Schemas["Product"] = {
      id: existing?.id ?? randomUUID(),
      external_id: c.params[1],
      title: b.title,
      description: b.description ?? "",
      category: b.category ?? "",
      sku: b.sku ?? "",
      active: b.active,
      currency: "IRR",
      price_exponent: 0,
      variants,
      created_at: existing?.created_at ?? iso(c.now),
      updated_at: iso(c.now),
    };
    if (existing) t.products[t.products.indexOf(existing)] = product;
    else t.products.unshift(product);
    return ok({ ...product, created: !existing }, existing ? 200 : 201);
  }],
  ["DELETE", /^\/tenants\/([^/]+)\/products\/([^/]+)$/, (c) => {
    const p = tenant(c).products.find((x) => x.external_id === c.params[1]) ?? fail(404, "product_not_found");
    p.active = false;
    return noContent();
  }],
  ["POST", /^\/tenants\/([^/]+)\/catalog-import-jobs$/, (c) => {
    const t = tenant(c);
    const rows = c.form ? 0 : ((obj(c).rows as unknown[] | undefined) ?? []).length;
    const job: Schemas["CatalogImportJob"] = { ...newJob(c, "products", rows), tenant: { external_business_id: t.detail.tenant.external_business_id } };
    t.catalogJobs.unshift(job);
    return ok(job, 201);
  }],
  ["GET", /^\/tenants\/([^/]+)\/catalog-import-jobs$/, (c) => {
    const p = page(c, tenant(c).catalogJobs);
    return ok({ jobs: p.items, next_cursor: p.next_cursor });
  }],
  ["GET", /^\/tenants\/([^/]+)\/catalog-import-jobs\/([^/]+)$/, (c) =>
    ok(tenant(c).catalogJobs.find((j) => j.id === c.params[1]) ?? fail(404, "import_job_not_found"))],
  ["GET", /^\/tenants\/([^/]+)\/catalog-import-jobs\/([^/]+)\/rows$/, (c) => {
    if (!tenant(c).catalogJobs.some((j) => j.id === c.params[1])) fail(404, "import_job_not_found");
    return ok({ rows: [], next_cursor: null });
  }],
  ["POST", /^\/tenants\/([^/]+)\/catalog-import-jobs\/([^/]+)\/(commit|cancel)$/, (c) =>
    finishJob(c, tenant(c).catalogJobs.find((j) => j.id === c.params[1]) ?? fail(404, "import_job_not_found"), c.params[2])],

  // assistant, policies, payment details, shipping
  ["GET", /^\/tenants\/([^/]+)\/assistant$/, (c) => ok(tenant(c).assistant)],
  ["PUT", /^\/tenants\/([^/]+)\/assistant$/, (c) => {
    const t = tenant(c);
    const b = obj(c) as Partial<Schemas["AssistantPut"]>;
    if (typeof b.enabled !== "boolean") return fail(422, "invalid_value", "enabled");
    if (typeof b.auto_reply !== "boolean") return fail(422, "invalid_value", "auto_reply");
    if (!["en", "ar", "fa"].includes(String(b.reply_language))) fail(422, "invalid_value", "reply_language", { allowed: ["en", "ar", "fa"] });
    if ((b.persona_name ?? "").length > 80) fail(422, "invalid_value", "persona_name", { max: 80 });
    if ((b.business_profile ?? "").length > 4000) fail(422, "invalid_value", "business_profile", { max: 4000 });
    t.assistant = { enabled: b.enabled, auto_reply: b.auto_reply, reply_language: b.reply_language as Schemas["ReplyLanguage"], persona_name: b.persona_name ?? "", business_profile: b.business_profile ?? "", updated_at: iso(c.now) };
    return ok(t.assistant);
  }],
  ["GET", /^\/tenants\/([^/]+)\/return-policy$/, (c) => ok(tenant(c).returnPolicy ?? fail(404, "return_policy_not_set"))],
  ["PUT", /^\/tenants\/([^/]+)\/return-policy$/, (c) => {
    const t = tenant(c);
    const b = obj(c) as Partial<Schemas["ReturnPolicyPut"]>;
    if (typeof b.enabled !== "boolean") return fail(422, "invalid_value", "enabled");
    if (b.enabled && b.window_days == null && !b.conditions) fail(422, "return_policy_empty", "conditions");
    t.returnPolicy = { enabled: b.enabled, window_days: b.window_days ?? null, conditions: b.conditions ?? "", updated_at: iso(c.now) };
    return ok(t.returnPolicy);
  }],
  ["GET", /^\/tenants\/([^/]+)\/payment-details$/, (c) => ok(tenant(c).paymentDetails)],
  ["PUT", /^\/tenants\/([^/]+)\/payment-details$/, (c) => {
    const t = tenant(c);
    const b = obj(c) as Partial<Schemas["PaymentDetailsPut"]>;
    if (!b.holder_name) return fail(422, "invalid_value", "holder_name");
    if (!b.card_number && !b.iban) fail(422, "payment_destination_required", "card_number");
    if (b.card_number && (!/^\d{16}$/.test(b.card_number) || !luhn(b.card_number))) fail(422, "card_number_invalid", "card_number");
    if (b.iban && !ibanOk(b.iban)) fail(422, "iban_invalid", "iban");
    t.paymentDetails = { configured: true, card_number_last4: b.card_number?.slice(-4) ?? null, iban_last4: b.iban?.slice(-4) ?? null, holder_name: b.holder_name, bank_name: b.bank_name ?? "" };
    return ok(t.paymentDetails);
  }],
  ["GET", /^\/tenants\/([^/]+)\/shipping$/, (c) => ok(tenant(c).shipping)],
  ["PUT", /^\/tenants\/([^/]+)\/shipping$/, (c) => {
    const t = tenant(c);
    const b = obj(c) as Partial<Schemas["ShippingPut"]>;
    for (const f of [b.default_fee, b.free_over, ...(b.rates ?? []).map((r) => r.fee)]) {
      if (f != null && (!Number.isInteger(f) || f < 0 || f % 10 !== 0)) fail(422, "invalid_value", "fee");
    }
    t.shipping = { enabled: b.enabled ?? false, default_fee: b.default_fee ?? null, free_over: b.free_over ?? null, rates: b.rates ?? [], currency: "IRR", minor_unit: 0, updated_at: iso(c.now) };
    return ok(t.shipping);
  }],

  // inbox
  ["GET", /^\/tenants\/([^/]+)\/conversations$/, (c) => {
    const states = c.query.getAll("state");
    const queues = c.query.getAll("queue");
    const channel = c.query.get("channel");
    const q = c.query.get("q")?.trim();
    const list = tenant(c)
      .conversations.filter((cv) => (states.length ? states.includes(cv.state) : true))
      .filter((cv) => (queues.length ? !!cv.queue && queues.includes(cv.queue) : true))
      .filter((cv) => (channel ? cv.channel_kind === channel : true))
      .filter((cv) => (q ? (cv.customer.display_name ?? "").includes(q) || (cv.customer.phone ?? "").includes(q) : true))
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
    const p = page(c, list);
    return ok({ conversations: p.items, next_cursor: p.next_cursor });
  }],
  ["GET", /^\/tenants\/([^/]+)\/conversations\/([^/]+)$/, (c) => ok(findConversation(tenant(c), c.params[1]))],
  ["GET", /^\/tenants\/([^/]+)\/conversations\/([^/]+)\/messages$/, (c) => {
    const t = tenant(c);
    findConversation(t, c.params[1]);
    const all = t.messages.get(c.params[1]) ?? [];
    const limit = Math.min(Number(c.query.get("limit") ?? 50), 100);
    const before = c.query.get("before");
    const after = c.query.get("after");
    let slice = all;
    if (before) slice = all.slice(0, Math.max(0, all.findIndex((m) => m.id === before)));
    if (after) slice = all.slice(all.findIndex((m) => m.id === after) + 1);
    const out = after ? slice.slice(0, limit) : slice.slice(-limit);
    return ok({
      messages: out,
      next_before: out.length && all.indexOf(out[0]) > 0 ? out[0].id : null,
      next_after: out.length ? out[out.length - 1].id : null,
    });
  }],
  ["GET", /^\/tenants\/([^/]+)\/conversations\/([^/]+)\/messages\/([^/]+)$/, (c) => {
    const t = tenant(c);
    findConversation(t, c.params[1]);
    return ok(t.messages.get(c.params[1])?.find((m) => m.id === c.params[2]) ?? fail(404, "message_not_found"));
  }],
  ["POST", /^\/tenants\/([^/]+)\/conversations\/([^/]+)\/reply$/, (c) => {
    const t = tenant(c);
    const cv = findConversation(t, c.params[1]);
    const b = obj(c) as Schemas["ReplyRequest"];
    const thread = t.messages.get(cv.id) ?? [];
    if (!thread.some((m) => m.sender === "customer")) fail(409, "no_customer_message");
    if (!b.text && !b.media_id) fail(422, "text_required", "text");
    let media: Schemas["Message"]["media"] = null;
    if (b.media_id) {
      if (cv.channel_kind === "instagram") fail(409, "image_not_supported_on_channel");
      const m = t.media.get(`media:${b.media_id}`) ?? fail(404, "media_not_found");
      media = { id: b.media_id, mime: m.mime, size: m.bytes.length, path: `/partner/v1/tenants/${encodeURIComponent(c.params[0])}/media/${b.media_id}` };
    }
    const msg: Schemas["Message"] = {
      id: randomUUID(),
      conversation_id: cv.id,
      direction: "out",
      sender: "human",
      kind: media ? "image" : "text",
      text: b.text ?? b.caption ?? "",
      status: "sent",
      created_at: iso(c.now),
      media,
    };
    thread.push(msg);
    t.messages.set(cv.id, thread);
    Object.assign(cv, { last_message: msg, last_message_at: msg.created_at, state: "human", held_since: cv.held_since ?? msg.created_at });
    return ok(msg, 201);
  }],
  ["POST", /^\/tenants\/([^/]+)\/conversations\/([^/]+)\/claim$/, (c) => {
    const cv = findConversation(tenant(c), c.params[1]);
    Object.assign(cv, { state: "human", held_since: cv.held_since ?? iso(c.now) });
    return ok(cv);
  }],
  ["POST", /^\/tenants\/([^/]+)\/conversations\/([^/]+)\/release$/, (c) => {
    const t = tenant(c);
    const cv = findConversation(t, c.params[1]);
    if (t.optedOut.has(cv.id)) fail(409, "customer_opted_out");
    Object.assign(cv, { state: "ai", held_since: null, handoff: null });
    return ok({ ...cv, assistant_active: t.assistant.enabled && t.assistant.auto_reply });
  }],
  ["POST", /^\/tenants\/([^/]+)\/conversations\/([^/]+)\/queue$/, (c) => {
    const cv = findConversation(tenant(c), c.params[1]);
    const q = obj(c).queue;
    if (typeof q !== "string" || !QUEUES.includes(q)) fail(422, "invalid_value", "queue", { allowed: QUEUES });
    cv.queue = q as Schemas["HandoffQueue"];
    return ok(cv);
  }],
  ["POST", /^\/tenants\/([^/]+)\/media$/, async (c) => {
    const t = tenant(c);
    const file = c.form?.get("file");
    if (!file || typeof file === "string") return fail(400, "file_field_missing", undefined, { field: "file" });
    if (!["image/jpeg", "image/png"].includes(file.type)) fail(415, "image_type_unsupported");
    if (file.size > 8 * 1024 * 1024) fail(413, "file_too_large", undefined, { max_mb: 8 });
    const id = randomUUID();
    t.media.set(`media:${id}`, { mime: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
    return ok({ id, mime: file.type, size: file.size }, 201);
  }],
  ["GET", /^\/tenants\/([^/]+)\/media\/([^/]+)$/, (c) => {
    const m = tenant(c).media.get(`media:${c.params[1]}`) ?? fail(404, "media_not_found");
    return { status: 200, bytes: { mime: m.mime, data: m.bytes } };
  }],

  // orders and payments
  ["GET", /^\/tenants\/([^/]+)\/orders$/, (c) => {
    const statuses = c.query.getAll("status");
    const payments = c.query.getAll("payment_status");
    const since = c.query.get("since");
    const list = tenant(c)
      .orders.filter((o) => (statuses.length ? statuses.includes(o.status) : true))
      .filter((o) => (payments.length ? payments.includes(o.payment.status) : true))
      .filter((o) => (since ? o.created_at >= since : true))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const p = page(c, list);
    return ok({ orders: p.items, next_cursor: p.next_cursor });
  }],
  ["GET", /^\/tenants\/([^/]+)\/orders\/([^/]+)$/, (c) => ok(findOrder(tenant(c), c.params[1]))],
  ["POST", /^\/tenants\/([^/]+)\/orders\/([^/]+)\/status$/, (c) => {
    const t = tenant(c);
    const order = findOrder(t, c.params[1]);
    const to = obj(c).status as Schemas["OrderStatus"];
    const allowed = NEXT_STATUS[order.status] ?? [];
    if (!allowed.includes(to)) fail(409, "invalid_transition", undefined, { from: order.status, to, allowed });
    order.status = to;
    order.updated_at = iso(c.now);
    if (to === "packing") order.packing_at = iso(c.now);
    if (to === "shipped") order.shipped_at = iso(c.now);
    if (to === "cancelled") order.cancelled_at = iso(c.now);
    refreshPayment(t, order);
    return ok(order);
  }],
  ["GET", /^\/tenants\/([^/]+)\/orders\/([^/]+)\/payment-evidence$/, (c) => {
    const t = tenant(c);
    findOrder(t, c.params[1]);
    return ok({ data: t.evidence.get(c.params[1]) ?? [] });
  }],
  ["GET", /^\/tenants\/([^/]+)\/orders\/([^/]+)\/payment-evidence\/([^/]+)\/content$/, (c) => {
    const t = tenant(c);
    const ev = findEvidence(t, c.params[1], c.params[2]);
    if (ev.kind === "text") return ok({ kind: "text", text: t.evidenceText.get(ev.id) ?? "" });
    const m = t.media.get(`evidence:${ev.id}`) ?? fail(404, "evidence_not_found");
    return { status: 200, bytes: { mime: m.mime, data: m.bytes } };
  }],
  ["POST", /^\/tenants\/([^/]+)\/orders\/([^/]+)\/payment-evidence\/([^/]+)\/(approve|reject)$/, (c) => {
    const t = tenant(c);
    const order = findOrder(t, c.params[1]);
    const ev = findEvidence(t, c.params[1], c.params[2]);
    if (c.params[3] === "approve") {
      if (ev.status !== "pending_verification" && ev.status !== "approved") fail(409, "evidence_already_decided", undefined, { status: ev.status });
      if (order.status !== "confirmed" && order.status !== "paid") fail(409, "order_not_awaiting_payment", undefined, { status: order.status, payment_status: order.payment.status });
      Object.assign(ev, { status: "approved", decided_at: iso(c.now), decided_by: "partner_key" });
      Object.assign(order, { status: "paid", paid_at: iso(c.now), updated_at: iso(c.now) });
      Object.assign(order.payment, { status: "paid", paid_at: iso(c.now) });
    } else {
      if (ev.status !== "pending_verification" && ev.status !== "rejected") fail(409, "evidence_already_decided", undefined, { status: ev.status });
      const b = obj(c) as Partial<Schemas["EvidenceReject"]>;
      if (!b.reason || !PAYMENT_REJECT.includes(b.reason)) fail(422, "invalid_value", "reason", { allowed: PAYMENT_REJECT });
      Object.assign(ev, { status: "rejected", decided_at: iso(c.now), decided_by: "partner_key", reject_reason: b.reason, note: b.note ?? "" });
      order.payment.status = "rejected";
      order.updated_at = iso(c.now);
    }
    refreshPayment(t, order);
    return ok({ order, evidence: ev });
  }],
  ["POST", /^\/tenants\/([^/]+)\/orders\/([^/]+)\/mark-paid$/, (c) => {
    const t = tenant(c);
    const order = findOrder(t, c.params[1]);
    if (order.status === "paid") return ok(order);
    if (order.status !== "confirmed") fail(409, "order_not_awaiting_payment", undefined, { status: order.status, payment_status: order.payment.status });
    Object.assign(order, { status: "paid", paid_at: iso(c.now), updated_at: iso(c.now) });
    Object.assign(order.payment, { status: "paid", paid_at: iso(c.now) });
    for (const ev of t.evidence.get(order.id) ?? []) if (ev.status === "pending_verification") Object.assign(ev, { status: "closed", closed_reason: "order_paid" });
    refreshPayment(t, order);
    return ok(order);
  }],

  // cases
  ["GET", /^\/tenants\/([^/]+)\/cases$/, (c) => {
    const states = c.query.getAll("state");
    const kinds = c.query.getAll("kind");
    const list = tenant(c)
      .cases.filter((k) => (states.length ? states.includes(k.state) : true))
      .filter((k) => (kinds.length ? kinds.includes(k.kind) : true))
      .map((k) => {
        const summary: Partial<Schemas["Case"]> = { ...k };
        delete summary.customer_text;
        delete summary.note;
        delete summary.photos;
        delete summary.events;
        return summary as Schemas["CaseSummary"];
      });
    const p = page(c, list);
    return ok({ cases: p.items, next_cursor: p.next_cursor });
  }],
  ["GET", /^\/tenants\/([^/]+)\/cases\/([^/]+)$/, (c) => ok(findCase(tenant(c), c.params[1]))],
  ["GET", /^\/tenants\/([^/]+)\/cases\/([^/]+)\/photos\/([^/]+)$/, (c) => {
    const t = tenant(c);
    if (!findCase(t, c.params[1]).photos.some((p) => p.id === c.params[2])) fail(404, "photo_not_found");
    const m = t.media.get(`case:${c.params[2]}`) ?? fail(404, "photo_not_found");
    return { status: 200, bytes: { mime: m.mime, data: m.bytes } };
  }],
  ["POST", /^\/tenants\/([^/]+)\/cases\/([^/]+)\/actions$/, (c) => {
    const k = findCase(tenant(c), c.params[1]);
    const b = obj(c) as Partial<Schemas["CaseAction"]>;
    if (["refunded", "exchanged", "closed", "rejected"].includes(k.state)) fail(409, "case_closed");
    if (b.expected_state !== k.state) fail(409, "case_state_conflict");
    const to: Record<Schemas["CaseAction"]["action"], Schemas["CaseState"]> = {
      request_info: "awaiting_customer",
      accept: "accepted",
      reject: "rejected",
      mark_refunded: "refunded",
      mark_exchanged: "exchanged",
      close: "closed",
    };
    const action = b.action;
    if (!action || !(action in to)) return fail(422, "invalid_action", "action", { allowed: Object.keys(to) });
    if (action === "reject" && !b.reject_reason) fail(422, "invalid_action", "reject_reason");
    const from = k.state;
    k.state = to[action];
    if (action === "reject") k.reject_reason = b.reject_reason ?? null;
    if (action === "mark_refunded") k.refund = { amount: b.refund?.amount ?? null, currency: "IRR", minor_unit: 0, reference: b.refund?.reference ?? null };
    if (b.note) k.note = b.note;
    k.events.push({ seq: k.events.length + 1, action, actor: "partner", from_state: from, to_state: k.state, notice: b.notify_customer ? "sent" : null, occurred_at: iso(c.now) });
    k.updated_at = iso(c.now);
    return ok(k);
  }],

  // entitlements and branding
  ["GET", /^\/entitlements$/, (c) => ok(c.world.contract)],
  ["GET", /^\/tenants\/([^/]+)\/entitlements$/, (c) => ok(tenant(c).entitlements)],
  ["PUT", /^\/tenants\/([^/]+)\/entitlements$/, (c) => {
    const t = tenant(c);
    const b = obj(c) as Schemas["ShopEntitlementsPut"];
    for (const [f, v] of Object.entries(b.features ?? {})) {
      t.entitlements.features[f] = v === null ? { allowed: c.world.contract.features.includes(f as Schemas["Feature"]), source: "contract" } : { allowed: v, source: "tenant" };
    }
    for (const [l, v] of Object.entries(b.limits ?? {})) {
      t.entitlements.limits[l] = { value: v, used: t.entitlements.limits[l]?.used ?? 0, source: v === null ? "contract" : "tenant" };
    }
    return ok(t.entitlements);
  }],
  ["GET", /^\/branding$/, (c) => ok(c.world.branding)],
  ["PUT", /^\/branding$/, (c) => {
    const b = obj(c) as Schemas["BrandingPut"];
    if ("mode" in b) fail(400, "brand_mode_read_only", "mode");
    if (b.names !== undefined) c.world.branding.names = b.names ?? {};
    if (b.support_label !== undefined) c.world.branding.support_label = b.support_label ?? {};
    if (b.support_url !== undefined) c.world.branding.support_url = b.support_url;
    c.world.branding.updated_at = iso(c.now);
    return ok(c.world.branding);
  }],
  ["PUT", /^\/branding\/disclosures\/(en|ar|fa)$/, (c) => {
    const text = obj(c).text;
    const locale = c.params[0] as "en" | "ar" | "fa";
    if (text !== null && (typeof text !== "string" || text.length < 20 || text.length > 220)) fail(422, "disclosure_invalid", "text", { reason: "too_short", locale });
    c.world.branding.disclosures[locale] = typeof text === "string" ? { text, source: "brand" } : { text: "", source: "default" };
    return ok(c.world.branding);
  }],
  ["POST", /^\/branding\/logo$/, (c) => {
    const file = c.form?.get("file");
    if (!file || typeof file === "string") return fail(400, "file_field_missing");
    if (!["image/png", "image/webp"].includes(file.type)) fail(415, "logo_type_unsupported");
    if (file.size > 256 * 1024) fail(413, "logo_too_large");
    c.world.branding.logo_url = `https://api.bizin.app/brand-assets/mock-${randomUUID()}`;
    return ok(c.world.branding);
  }],

  // webhooks
  ["GET", /^\/webhooks$/, (c) => ok({ webhooks: c.world.webhooks })],
  ["POST", /^\/webhooks$/, (c) => {
    const b = obj(c) as Partial<Schemas["WebhookCreate"]>;
    if (typeof b.url !== "string" || !b.url.startsWith("https://")) return fail(422, "webhook_url_refused", "url");
    if (c.world.webhooks.length >= 5) fail(409, "webhook_limit_reached", undefined, { max: 5 });
    const hook: Schemas["Webhook"] = { id: randomUUID(), url: b.url, event_types: b.event_types ?? ["*"], status: "active", disabled_reason: null, consecutive_failures: 0, description: b.description ?? "", created_at: iso(c.now), updated_at: iso(c.now) };
    c.world.webhooks.push(hook);
    c.world.deliveries.set(hook.id, []);
    return ok({ webhook: hook, secret: `whsec_mock${randomUUID().replace(/-/g, "")}` }, 201);
  }],
  ["GET", /^\/webhooks\/([^/]+)$/, (c) => ok({ webhook: findHook(c) })],
  ["PATCH", /^\/webhooks\/([^/]+)$/, (c) => {
    const hook = findHook(c);
    const b = obj(c) as Schemas["WebhookPatch"];
    Object.assign(hook, b, { updated_at: iso(c.now), disabled_reason: b.status === "disabled" ? "partner" : b.status === "active" ? null : hook.disabled_reason });
    return ok({ webhook: hook });
  }],
  ["DELETE", /^\/webhooks\/([^/]+)$/, (c) => {
    c.world.webhooks.splice(c.world.webhooks.indexOf(findHook(c)), 1);
    return noContent();
  }],
  ["POST", /^\/webhooks\/([^/]+)\/rotate-secret$/, (c) =>
    ok({ webhook: findHook(c), secret: `whsec_mock${randomUUID().replace(/-/g, "")}`, previous_secret_valid_until: iso(c.now + 24 * 3600_000) })],
  ["POST", /^\/webhooks\/([^/]+)\/ping$/, (c) => {
    const hook = findHook(c);
    if (hook.status === "disabled") fail(409, "webhook_disabled");
    const eventId = `evt_${randomUUID()}`;
    c.world.deliveries.get(hook.id)?.unshift({ event_id: eventId, event_type: "ping", occurred_at: iso(c.now), state: "pending", attempts: 0, last_status: null, last_error: null, last_attempt_at: null, delivered_at: null });
    return ok({ event_id: eventId }, 202);
  }],
  ["GET", /^\/webhooks\/([^/]+)\/deliveries$/, (c) => {
    const p = page(c, c.world.deliveries.get(findHook(c).id) ?? []);
    return ok({ deliveries: p.items, next_cursor: p.next_cursor });
  }],

  // bulk onboarding
  ["POST", /^\/onboarding-jobs$/, (c) => {
    const rows = c.form ? 0 : ((obj(c).rows as unknown[] | undefined) ?? []).length;
    const job: Schemas["OnboardingJob"] = { ...newJob(c, "tenants", rows), tenant: null };
    c.world.onboardingJobs.unshift(job);
    return ok(job, 201);
  }],
  ["GET", /^\/onboarding-jobs$/, (c) => {
    const p = page(c, c.world.onboardingJobs);
    return ok({ jobs: p.items, next_cursor: p.next_cursor });
  }],
  ["GET", /^\/onboarding-jobs\/([^/]+)$/, (c) => ok(c.world.onboardingJobs.find((j) => j.id === c.params[0]) ?? fail(404, "import_job_not_found"))],
  ["GET", /^\/onboarding-jobs\/([^/]+)\/rows$/, (c) => {
    if (!c.world.onboardingJobs.some((j) => j.id === c.params[0])) fail(404, "import_job_not_found");
    return ok({ rows: [], next_cursor: null });
  }],
  ["POST", /^\/onboarding-jobs\/([^/]+)\/(commit|cancel)$/, (c) =>
    finishJob(c, c.world.onboardingJobs.find((j) => j.id === c.params[0]) ?? fail(404, "import_job_not_found"), c.params[1])],
];

// ---- dispatch ----------------------------------------------------------------------------------------------

function errorResponse(e: MockHttpError, requestId: string): Response {
  const body = { error: e.code, code: e.code, message: `mock: ${e.code}`, ...(e.field ? { field: e.field } : {}), ...(e.params ? { params: e.params } : {}), request_id: requestId };
  return new Response(JSON.stringify(body), { status: e.status, headers: { "content-type": "application/json", "x-request-id": requestId } });
}

/** Answers one Partner API request from the in-memory world, with the real gateway's idempotency rules. */
export async function dispatch(world: MockWorld, req: TransportRequest): Promise<Response> {
  const requestId = req.headers["X-Request-Id"] ?? randomUUID();
  const url = new URL(req.path, "http://mock.invalid");
  const pathname = url.pathname;
  try {
    const isWrite = req.method === "POST" || req.method === "PATCH" || req.method === "DELETE";
    const key = req.headers["Idempotency-Key"];
    if (isWrite && !key) fail(400, "idempotency_key_required");
    const bodyText = typeof req.body === "string" ? req.body : "";
    const replayKey = `${req.method} ${pathname} ${key}`;
    const prev = isWrite ? world.idempotency.get(replayKey) : undefined;
    if (prev) {
      if (prev.fingerprint !== bodyText) fail(422, "idempotency_key_reused");
      return new Response(prev.status === 204 ? null : prev.body, {
        status: prev.status,
        headers: { "content-type": "application/json", "x-request-id": requestId, "idempotent-replayed": "true" },
      });
    }

    for (const [method, pattern, handler] of routes) {
      if (method !== req.method) continue;
      const m = pathname.match(pattern);
      if (!m) continue;
      let body: unknown;
      if (bodyText) {
        try {
          body = JSON.parse(bodyText);
        } catch {
          fail(400, "bad_request_body");
        }
      }
      const result = await handler({
        world,
        params: m.slice(1).map((p) => decodeURIComponent(p)),
        query: url.searchParams,
        body,
        form: req.body instanceof FormData ? req.body : undefined,
        now: Date.now(),
      });
      const headers: Record<string, string> = { "x-request-id": requestId, "ratelimit-limit": "120", "ratelimit-remaining": "59", "ratelimit-reset": "1" };
      if (result.bytes) {
        return new Response(new Uint8Array(result.bytes.data), {
          status: 200,
          headers: { ...headers, "content-type": result.bytes.mime, "content-length": String(result.bytes.data.length) },
        });
      }
      const text = result.json === undefined ? "" : JSON.stringify(result.json);
      if (isWrite && result.status < 300) world.idempotency.set(replayKey, { fingerprint: bodyText, status: result.status, body: text });
      return new Response(result.status === 204 ? null : text, { status: result.status, headers: { ...headers, "content-type": "application/json" } });
    }
    return fail(404, "not_found");
  } catch (e) {
    if (e instanceof MockHttpError) return errorResponse(e, requestId);
    throw e;
  }
}
