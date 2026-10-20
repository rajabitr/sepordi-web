import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb, setDbForTests } from "@/server/db";
import { shops, users, webhookEvents } from "@/server/db/repo";

import { describeEvent, markAllNotificationsRead, markNotificationRead, notificationsForExt } from "./events";
import { ingestWebhook, MAX_WEBHOOK_BYTES } from "./ingest";

const SECRET = "whsec_current";
const OLD = "whsec_previous";
const NOW = 1_760_349_731;

function sign(body: string, secret = SECRET, t = NOW) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.`).update(body).digest("hex")}`;
}

function envelope(id: string, type: string, ext: string | null, data: Record<string, unknown> = {}) {
  return JSON.stringify({ id, type, api_version: "v1", occurred_at: "2026-10-20T08:00:00Z", tenant: ext ? { id: "t", external_business_id: ext } : null, data });
}

function deliver(body: string, opts: { sig?: string | null; eventId?: string | null; secrets?: string[] } = {}) {
  return ingestWebhook(
    {
      signature: opts.sig === undefined ? sign(body) : opts.sig,
      eventIdHeader: opts.eventId === undefined ? (JSON.parse(body) as { id: string }).id : opts.eventId,
      rawBody: Buffer.from(body, "utf8"),
      secrets: opts.secrets ?? [SECRET, OLD],
    },
    NOW,
  );
}

beforeEach(() => setDbForTests(openDb(":memory:")));
afterEach(() => setDbForTests(undefined));

describe("ingestWebhook", () => {
  it("stores a correctly signed event once and answers 200 to a duplicate", () => {
    const body = envelope("evt_1", "order.created", "biz-1", { order_id: "0b8c8f6e-0000-4000-8000-000000000001", code: "A-12" });
    expect(deliver(body)).toEqual({ status: 200, stored: true });
    expect(deliver(body)).toEqual({ status: 200, stored: false });
    expect(webhookEvents.recentForExt("biz-1")).toHaveLength(1);
  });

  it("accepts the previous secret during a rotation", () => {
    const body = envelope("evt_2", "credit.exhausted", "biz-1", { state: "exhausted" });
    expect(deliver(body, { sig: sign(body, OLD) }).status).toBe(200);
  });

  it("refuses a bad, missing or stale signature with 400 and stores nothing", () => {
    const body = envelope("evt_3", "order.created", "biz-1");
    expect(deliver(body, { sig: sign(body, "whsec_other") })).toEqual({ status: 400, reason: "signature" });
    expect(deliver(body, { sig: null })).toEqual({ status: 400, reason: "signature" });
    expect(deliver(body, { sig: sign(body, SECRET, NOW - 301) })).toEqual({ status: 400, reason: "signature" });
    expect(deliver(body, { secrets: [] })).toEqual({ status: 400, reason: "signature" });
    expect(webhookEvents.recentForExt("biz-1")).toHaveLength(0);
  });

  it("verifies the raw bytes: a re-encoded body fails", () => {
    const body = envelope("evt_4", "order.created", "biz-1");
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect(deliver(pretty, { sig: sign(body) }).status).toBe(400);
  });

  it("refuses an oversized body before verifying", () => {
    const body = "x".repeat(MAX_WEBHOOK_BYTES + 1);
    expect(deliver(body, { eventId: "evt_5" })).toEqual({ status: 413, reason: "too_large" });
  });

  it("keeps a partner-wide event (no tenant) with a null ext", () => {
    const body = envelope("evt_6", "ping", null);
    expect(deliver(body).status).toBe(200);
  });
});

describe("notifications", () => {
  it("shows only the shop's notifiable events, and read marks are scoped to the shop", () => {
    deliver(envelope("evt_a", "handoff.raised", "biz-1", { conversation_id: "0b8c8f6e-0000-4000-8000-0000000000aa", channel_kind: "whatsapp" }));
    deliver(envelope("evt_b", "message.received", "biz-1", { conversation_id: "x" }));
    deliver(envelope("evt_c", "order.created", "biz-2", { code: "B-1" }));
    deliver(envelope("evt_d", "payment.evidence_received", "biz-1", { code: "A-7", order_id: "0b8c8f6e-0000-4000-8000-0000000000dd" }));

    const first = notificationsForExt("biz-1");
    expect(first.unread).toBe(2);
    expect(first.items.map((i) => i.id).sort()).toEqual(["evt_a", "evt_d"]);

    markNotificationRead("biz-2", "evt_a");
    expect(notificationsForExt("biz-1").unread).toBe(2);
    markNotificationRead("biz-1", "evt_a");
    expect(notificationsForExt("biz-1").unread).toBe(1);
    markAllNotificationsRead("biz-1");
    expect(notificationsForExt("biz-1").unread).toBe(0);
    expect(notificationsForExt("biz-2").unread).toBe(1);
  });

  it("renders each type in Farsi with the right page", () => {
    const p = (data: Record<string, unknown>) => JSON.stringify({ data });
    expect(describeEvent("handoff.raised", p({ conversation_id: "0b8c8f6e-0000-4000-8000-0000000000aa", channel_kind: "instagram" }))).toMatchObject({
      title: "گفت‌وگویی به شما سپرده شد",
      href: "/panel/inbox/0b8c8f6e-0000-4000-8000-0000000000aa",
    });
    expect(describeEvent("order.created", p({ code: "A-12" }))?.title).toBe("سفارش تازه A-12");
    expect(describeEvent("payment.evidence_received", p({ code: "A-12" }))?.title).toBe("رسید تازه برای سفارش A-12");
    expect(describeEvent("credit.exhausted", p({ state: "exhausted" }))).toMatchObject({ title: "اعتبار دستیار تمام شد", href: "/panel/credit" });
    expect(describeEvent("channel.disconnected", p({ channel_kind: "telegram" }))?.title).toBe("اتصال تلگرام قطع شد");
    expect(describeEvent("channel.health_changed", p({ channel_kind: "whatsapp", state: "broken" }))?.href).toBe("/panel/channels");
    expect(describeEvent("case.opened", p({ code: "R-3" }))?.href).toBe("/panel/returns");
    expect(describeEvent("import.completed", p({ status: "done" }))?.href).toBe("/panel/products");
    expect(describeEvent("message.received", p({}))).toBeNull();
    // An id that is not an id never becomes part of a link.
    expect(describeEvent("order.created", p({ order_id: "../../admin" }))?.href).toBe("/panel/orders");
  });

  it("needs no shop row: events are keyed by ext", () => {
    const u = users.create({ phone: "09120000009", displayName: "x" });
    shops.create({ userId: u.id, externalBusinessId: "biz-9", name: "x" });
    deliver(envelope("evt_z", "credit.exhausted", "biz-9", { state: "exhausted" }));
    expect(notificationsForExt("biz-9").unread).toBe(1);
  });
});
