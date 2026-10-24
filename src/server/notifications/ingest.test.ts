import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb, setDbForTests } from "@/server/db";
import { shops, users, webhookEvents } from "@/server/db/repo";

import { describeEvent, markAllNotificationsRead, markNotificationRead, notificationsForExt } from "./events";
import { familiesFor, getNotifyPrefs, setNotifyPrefs, visibleTypes } from "./prefs";
import { ingestWebhook, MAX_WEBHOOK_BYTES } from "./ingest";

const SECRET = "whsec_current";
const OLD = "whsec_previous";
const NOW = 1_760_349_731;
const BOOKING = "0d6f3c2e-5b8a-4c1e-9f7d-2a4b6c8e0f12";

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
    const loggedOut = describeEvent("channel.disconnected", p({ channel_kind: "whatsapp", status: "banned" }));
    expect(loggedOut?.description).toContain("دستگاه‌های متصل");
    expect(`${loggedOut?.title} ${loggedOut?.description}`).not.toContain("مسدود");
    expect(describeEvent("case.opened", p({ code: "R-3" }))?.href).toBe("/panel/returns");
    expect(describeEvent("import.completed", p({ status: "done" }))?.href).toBe("/panel/products");
    expect(describeEvent("ping", p({}))).toBeNull();
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

describe("the five added webhook types", () => {
  const p = (data: Record<string, unknown>) => JSON.stringify({ data });
  const CONV = "0b8c8f6e-0000-4000-8000-0000000000c1";
  const ORDER = "0b8c8f6e-0000-4000-8000-0000000000d1";
  const CASE = "0b8c8f6e-0000-4000-8000-0000000000e1";

  it("renders each in Farsi with its page", () => {
    expect(describeEvent("handoff.released", p({ conversation_id: CONV, channel_kind: "telegram", from: "human" }))).toMatchObject({
      kind: "handoff",
      title: "گفت‌وگو به دستیار برگشت",
      description: "دستیار دوباره به مشتری در تلگرام جواب می‌دهد.",
      href: `/panel/inbox/${CONV}`,
    });
    expect(describeEvent("order.status_changed", p({ order_id: ORDER, code: "1043", from: "paid", to: "shipped" }))).toMatchObject({
      kind: "order",
      title: "سفارش 1043 ارسال شد",
      href: `/panel/orders/${ORDER}`,
    });
    expect(describeEvent("order.status_changed", p({ code: "1043", to: "teleported" }))?.title).toBe("وضعیت سفارش 1043 تغییر کرد");
    expect(describeEvent("case.updated", p({ case_id: CASE, code: "R-3", action: "photo_added", actor: "customer" }))).toMatchObject({
      kind: "case",
      title: "درخواست R-3: مشتری عکس تازه فرستاد",
      href: `/panel/returns/${CASE}`,
    });
    expect(describeEvent("channel.connected", p({ channel_kind: "instagram", status: "connected" }))).toMatchObject({
      kind: "channel",
      title: "اینستاگرام وصل شد",
      href: "/panel/channels",
    });
    expect(describeEvent("message.received", p({ conversation_id: CONV, kind: "image" }), 3)).toMatchObject({
      kind: "message",
      title: "۳ پیام تازه در گفت‌وگوی سپرده‌شده به شما",
      href: `/panel/inbox/${CONV}`,
    });
  });

  it("shows message.received only for a handed-off conversation, one item per conversation", () => {
    const other = "0b8c8f6e-0000-4000-8000-0000000000c2";
    // Before the handoff and in a conversation the assistant still holds: not shown.
    webhookEvents.insertIfNew({ eventId: "m0", type: "message.received", ext: "biz-1", payload: envelope("m0", "message.received", "biz-1", { conversation_id: CONV }) });
    webhookEvents.insertIfNew({ eventId: "m9", type: "message.received", ext: "biz-1", payload: envelope("m9", "message.received", "biz-1", { conversation_id: other }) });
    deliver(envelope("h1", "handoff.raised", "biz-1", { conversation_id: CONV }));
    for (const id of ["m1", "m2", "m3"]) deliver(envelope(id, "message.received", "biz-1", { conversation_id: CONV, channel_kind: "whatsapp" }));

    const held = notificationsForExt("biz-1");
    const msgs = held.items.filter((i) => i.kind === "message");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ id: "m3", read: false, title: "۳ پیام تازه در گفت‌وگوی سپرده‌شده به شما" });
    expect(held.unread).toBe(2); // the handoff and the one message item

    // Opening the item reads every message of that conversation up to it.
    markNotificationRead("biz-1", "m3");
    expect(notificationsForExt("biz-1").items.find((i) => i.kind === "message")?.read).toBe(true);
    expect(notificationsForExt("biz-1").unread).toBe(1);

    // Once released, later messages are the assistant's again.
    deliver(envelope("h2", "handoff.released", "biz-1", { conversation_id: CONV, from: "handoff" }));
    deliver(envelope("m4", "message.received", "biz-1", { conversation_id: CONV }));
    const released = notificationsForExt("biz-1");
    expect(released.items.filter((i) => i.kind === "message")).toHaveLength(0);
    expect(released.items.map((i) => i.id)).toContain("h2");
  });

  it("hides a seller's own case decision, and counts it as nothing", () => {
    deliver(envelope("c1", "case.updated", "biz-1", { case_id: CASE, action: "accept", actor: "partner" }));
    deliver(envelope("c2", "case.updated", "biz-1", { case_id: CASE, action: "accept", actor: "seller" }));
    deliver(envelope("c3", "case.updated", "biz-1", { case_id: CASE, action: "customer_replied", actor: "customer" }));
    const n = notificationsForExt("biz-1");
    expect(n.items.map((i) => i.id)).toEqual(["c3"]);
    expect(n.unread).toBe(1);
  });
});

describe("notification preferences", () => {
  it("are kept per user and shop under a namespaced settings key, and keep only known families", () => {
    expect(getNotifyPrefs("u1", "s1")).toEqual({ muted: [] });
    setNotifyPrefs("u1", "s1", ["orders", "nonsense", "credit", "orders"]);
    expect(getNotifyPrefs("u1", "s1")).toEqual({ muted: ["orders", "credit"] });
    expect(getNotifyPrefs("u2", "s1")).toEqual({ muted: [] });
    expect(getNotifyPrefs("u1", "s2")).toEqual({ muted: [] });
  });

  it("drop the muted families from the bell and from its unread count", () => {
    deliver(envelope("e1", "order.created", "biz-1", { code: "A-1" }));
    deliver(envelope("e2", "payment.evidence_received", "biz-1", { code: "A-1" }));
    deliver(envelope("e3", "credit.exhausted", "biz-1", { state: "exhausted" }));
    deliver(envelope("e4", "import.completed", "biz-1", { status: "done" }));
    const types = visibleTypes(setNotifyPrefs("u1", "s1", ["orders"]), "owner");
    expect(types).not.toContain("order.created");
    expect(types).toContain("import.completed");
    const n = notificationsForExt("biz-1", { types });
    expect(n.items.map((i) => i.id).sort()).toEqual(["e3", "e4"]);
    expect(n.unread).toBe(2);
    expect(notificationsForExt("biz-1").unread).toBe(4);
  });

  it("mute the bookings family on its own", () => {
    deliver(envelope("b1", "booking.created", "biz-1", { booking_id: BOOKING, code: "B-1", status: "pending_approval" }));
    deliver(envelope("b2", "booking.receipt_received", "biz-1", { booking_id: BOOKING, code: "B-1" }));
    deliver(envelope("e1", "order.created", "biz-1", { code: "A-1" }));
    expect(notificationsForExt("biz-1", { types: visibleTypes(getNotifyPrefs("u1", "s1"), "owner") }).unread).toBe(3);
    const types = visibleTypes(setNotifyPrefs("u1", "s1", ["bookings"]), "owner");
    expect(types).not.toContain("booking.receipt_received");
    expect(types).toContain("payment.evidence_received");
    const n = notificationsForExt("biz-1", { types });
    expect(n.items.map((i) => i.id)).toEqual(["e1"]);
    expect(n.unread).toBe(1);
  });

  it("leave bookings out for a role that cannot open the booking pages, muted or not", () => {
    deliver(envelope("b1", "booking.created", "biz-1", { booking_id: BOOKING, code: "B-1" }));
    deliver(envelope("h1", "handoff.raised", "biz-1", { conversation_id: BOOKING }));
    expect(familiesFor("responder")).not.toContain("bookings");
    expect(familiesFor("finance")).toContain("bookings");
    const n = notificationsForExt("biz-1", { types: visibleTypes(getNotifyPrefs("u1", "s1"), "responder") });
    expect(n.items.map((i) => i.id)).toEqual(["h1"]);
    expect(visibleTypes({ muted: [] }, "fulfillment")).toContain("booking.created");
  });
});
