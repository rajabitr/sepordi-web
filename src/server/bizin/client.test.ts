import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as bizin from "./client";
import { BizinError } from "./error";
import { toFarsiError } from "./errors-fa";
import { resetWorld } from "./mock";
import type { TransportRequest } from "./transport";

const env = { ...process.env };

beforeEach(() => {
  resetWorld();
  process.env.BIZIN_MODE = "mock";
});
afterEach(() => {
  process.env = { ...env };
  bizin.setTransportForTests(undefined);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function capture(responses: Response[]) {
  const seen: TransportRequest[] = [];
  bizin.setTransportForTests(async (req) => {
    seen.push(req);
    return responses.shift() ?? new Response("{}", { status: 200 });
  });
  return seen;
}

describe("transport rules", () => {
  it("adds an Idempotency-Key to writes only, and a request id to every call", async () => {
    const seen = capture([new Response("{}"), new Response(null, { status: 204 }), new Response("{}", { status: 201 })]);
    await bizin.getTenant("x");
    await bizin.deleteProduct("x", "p");
    await bizin.claimConversation("x", "c", { idempotencyKey: "fixed-key" });
    expect(seen[0].headers["Idempotency-Key"]).toBeUndefined();
    expect(seen[1].headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen[2].headers["Idempotency-Key"]).toBe("fixed-key");
    for (const r of seen) expect(r.headers["X-Request-Id"]).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
  });

  it("percent-escapes ext and ids so they cannot change the route", async () => {
    const seen = capture([new Response("{}")]);
    await bizin.getOrder("shop/../../webhooks?x=1", "a b#c");
    expect(seen[0].path).toBe("/tenants/shop%2F..%2F..%2Fwebhooks%3Fx%3D1/orders/a%20b%23c");
  });

  it("retries a 429 once after Retry-After with the same Idempotency-Key, then gives up", async () => {
    vi.useFakeTimers();
    const limited = () => new Response(JSON.stringify({ code: "rate_limited", error: "rate_limited", message: "", request_id: "r1" }), { status: 429, headers: { "retry-after": "2" } });
    const seen = capture([limited(), new Response("{}", { status: 201 })]);
    const p = bizin.connectWhatsApp("x");
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(seen).toHaveLength(2);
    expect(seen[1].headers["Idempotency-Key"]).toBe(seen[0].headers["Idempotency-Key"]);

    const twice = capture([limited(), limited()]);
    const q = bizin.getTenant("x").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2000);
    const err = await q;
    expect(twice).toHaveLength(2);
    expect(err).toBeInstanceOf(BizinError);
    expect((err as BizinError).code).toBe("rate_limited");
  });

  it("does not sleep through a long Retry-After", async () => {
    const seen = capture([new Response(JSON.stringify({ code: "rate_limited" }), { status: 429, headers: { "retry-after": "60" } })]);
    await expect(bizin.getTenant("x")).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 60 });
    expect(seen).toHaveLength(1);
  });

  it("turns an error envelope into a typed BizinError", async () => {
    capture([new Response(JSON.stringify({ error: "invalid_value", code: "invalid_value", message: "m", field: "owner.email", params: { max: 3 }, request_id: "rid-1" }), { status: 422 })]);
    await expect(bizin.createTenant({} as never)).rejects.toMatchObject({ status: 422, code: "invalid_value", field: "owner.email", params: { max: 3 }, requestId: "rid-1" });
  });

  it("live mode sends the bearer key to BIZIN_API_BASE and refuses to run without a key", async () => {
    process.env.BIZIN_MODE = "";
    delete process.env.BIZIN_PARTNER_KEY;
    await expect(bizin.getMe()).rejects.toMatchObject({ code: "not_configured" });

    process.env.BIZIN_PARTNER_KEY = "bzp_testkeyid000000_secret";
    process.env.BIZIN_API_BASE = "https://partner.example/partner/v1/";
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await bizin.getMe();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://partner.example/partner/v1/me");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer bzp_testkeyid000000_secret");
  });
});

describe("mock Bizin", () => {
  it("serves the demo shop and refuses an unknown ext with tenant_not_found", async () => {
    const t = await bizin.getTenant("demo-nila");
    expect(t.tenant.name).toBe("گالری نیلا");
    const err = await bizin.getTenant("nobody").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 404, code: "tenant_not_found" });
    expect(toFarsiError(err).message).toContain("فروشگاه");
  });

  it("has realistic volumes", async () => {
    const products = await bizin.listProducts("demo-nila", { limit: 100 });
    const conversations = await bizin.listConversations("demo-nila", { limit: 100 });
    const orders = await bizin.listOrders("demo-nila", { limit: 100 });
    const cases = await bizin.listCases("demo-nila");
    expect(products.products.length).toBe(12);
    expect(conversations.conversations.length).toBe(15);
    expect(new Set(conversations.conversations.map((c) => c.state))).toEqual(new Set(["ai", "handoff", "human"]));
    expect(orders.orders.length).toBe(20);
    expect(orders.orders.some((o) => o.payment.status === "pending_verification")).toBe(true);
    expect(cases.cases.length).toBe(3);
    for (const p of products.products) for (const v of p.variants) expect(Number.isInteger(v.price)).toBe(true);
  });

  it("pairs WhatsApp: pending, then a rotating qr, then connected", async () => {
    const { channel_id } = await bizin.connectWhatsApp("demo-rasta");
    await expect(bizin.connectWhatsApp("demo-rasta")).rejects.toMatchObject({ code: "whatsapp_pairing_in_progress" });
    const a = await bizin.getWhatsAppPairing("demo-rasta", channel_id);
    const b = await bizin.getWhatsAppPairing("demo-rasta", channel_id);
    const c = await bizin.getWhatsAppPairing("demo-rasta", channel_id);
    const d = await bizin.getWhatsAppPairing("demo-rasta", channel_id);
    expect([a.status, b.status, c.status, d.status]).toEqual(["pending", "qr", "qr", "connected"]);
    expect(b.qr).toBeTruthy();
    expect(b.qr).not.toBe(c.qr);
    const channels = await bizin.getTenantChannels("demo-rasta");
    expect(channels.channels.find((ch) => ch.channel_id === channel_id)?.status).toBe("connected");
  });

  it("approving a pending receipt marks the order paid; a second decision is refused", async () => {
    const { orders } = await bizin.listOrders("demo-nila", { payment_status: "pending_verification" });
    const order = orders[0];
    const { data } = await bizin.listPaymentEvidence("demo-nila", order.id);
    const ev = data.find((e) => e.status === "pending_verification")!;
    const res = await bizin.approvePaymentEvidence("demo-nila", order.id, ev.id);
    expect(res.order.status).toBe("paid");
    expect(res.order.payment.status).toBe("paid");
    await expect(bizin.rejectPaymentEvidence("demo-nila", order.id, ev.id, { reason: "unreadable" })).rejects.toMatchObject({ code: "evidence_already_decided" });
  });

  it("streams receipt and media bytes for proxying", async () => {
    const { orders } = await bizin.listOrders("demo-nila", { payment_status: "pending_verification" });
    for (const order of orders) {
      const ev = (await bizin.listPaymentEvidence("demo-nila", order.id)).data[0];
      const res = await bizin.getPaymentEvidenceContent("demo-nila", order.id, ev.id);
      const type = res.headers.get("content-type") ?? "";
      if (ev.kind === "image") {
        expect(type).toBe("image/png");
        expect(new Uint8Array(await res.arrayBuffer()).slice(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47]));
      } else {
        expect(await res.json()).toMatchObject({ kind: "text" });
      }
    }
  });

  it("replays a write with the same Idempotency-Key and refuses the key with another body", async () => {
    const body = { external_business_id: "new-shop", name: "فروشگاه تازه", reply_language: "fa", market_profile: "ir" as const, owner: { external_user_id: "u1", email: "u1@example.com", display_name: "کاربر" } };
    const first = await bizin.createTenant(body, { idempotencyKey: "signup-1" });
    expect(first.created).toBe(true);
    const again = await bizin.createTenant(body, { idempotencyKey: "signup-1" });
    expect(again.tenant.id).toBe(first.tenant.id);
    await expect(bizin.createTenant({ ...body, name: "دیگر" }, { idempotencyKey: "signup-1" })).rejects.toMatchObject({ code: "idempotency_key_reused" });
    await expect(bizin.createTenant({ ...body, owner: { ...body.owner, external_user_id: "u2" } })).rejects.toMatchObject({ code: "owner_mismatch" });
  });
});
