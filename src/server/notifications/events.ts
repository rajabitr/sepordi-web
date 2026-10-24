import "server-only";

import { fa } from "@/lib/utils";
import { getDb } from "@/server/db";
import type { WebhookEventRow } from "@/server/db/repo";

/*
 * Webhook events a seller is told about. message.received is shown only for a conversation handed to the seller,
 * one item per conversation: the assistant answers the rest, and one item per message would bury everything else.
 */
export const NOTIFY_TYPES = [
  "handoff.raised",
  "handoff.released",
  "message.received",
  "order.created",
  "order.status_changed",
  "payment.evidence_received",
  "credit.exhausted",
  "channel.connected",
  "channel.disconnected",
  "channel.health_changed",
  "case.opened",
  "case.updated",
  "import.completed",
  "booking.created",
  "booking.status_changed",
  "booking.rescheduled",
  "booking.receipt_received",
] as const;

export type NotifyType = (typeof NOTIFY_TYPES)[number];

export type NotificationKind = "handoff" | "message" | "order" | "receipt" | "credit" | "channel" | "case" | "import" | "booking";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  description?: string;
  href: string;
  /** ISO 8601. */
  at: string;
  read: boolean;
}

const CHANNEL_FA: Record<string, string> = { whatsapp: "واتس‌اپ", instagram: "اینستاگرام", telegram: "تلگرام" };

const ORDER_MOVE_FA: Record<string, string> = {
  draft: "به پیش‌نویس برگشت",
  confirmed: "تأیید شد",
  paid: "پرداخت‌شده شد",
  packing: "به آماده‌سازی رفت",
  shipped: "ارسال شد",
  delivered: "تحویل شد",
  cancelled: "لغو شد",
};

const CASE_ACTION_FA: Record<string, string> = {
  photo_added: "مشتری عکس تازه فرستاد",
  customer_replied: "مشتری پاسخ داد",
  request_info: "از مشتری توضیح بیشتر خواسته شد",
  accept: "درخواست پذیرفته شد",
  reject: "درخواست رد شد",
  mark_refunded: "بازپرداخت ثبت شد",
  mark_exchanged: "تعویض ثبت شد",
  close: "درخواست بسته شد",
};

const BOOKING_MOVE_FA: Record<string, string> = {
  pending_approval: "منتظر تأیید شماست",
  pending_payment: "منتظر بیعانه است",
  confirmed: "قطعی شد",
  completed: "انجام شد",
  no_show: "«نیامد» خورد",
  cancelled: "لغو شد",
  expired: "منقضی شد",
};

const s = (v: unknown) => (typeof v === "string" ? v : "");
/** Codes go into a Farsi sentence; keep them short and printable. */
const code = (v: unknown) => s(v).replace(/[^\w-]/g, "").slice(0, 32);
const uuidish = (v: unknown) => (/^[0-9a-fA-F-]{8,64}$/.test(s(v)) ? s(v) : "");

/**
 * The Farsi line and target page of one stored event, or null for a type the bell does not show. `count` is the number
 * of unread customer messages a message.received item stands for.
 */
export function describeEvent(type: string, payload: string, count = 1): Omit<NotificationItem, "id" | "at" | "read"> | null {
  let data: Record<string, unknown> = {};
  try {
    const body = JSON.parse(payload) as { data?: unknown };
    if (body && typeof body.data === "object" && body.data) data = body.data as Record<string, unknown>;
  } catch {
    // Shown without details rather than dropped.
  }
  const channel = CHANNEL_FA[s(data.channel_kind)] ?? "";
  const order = uuidish(data.order_id);

  switch (type) {
    case "handoff.raised": {
      const conv = uuidish(data.conversation_id);
      return {
        kind: "handoff",
        title: "گفت‌وگویی به شما سپرده شد",
        description: channel ? `مشتری در ${channel} منتظر پاسخ شماست.` : "مشتری منتظر پاسخ شماست.",
        href: conv ? `/panel/inbox/${conv}` : "/panel/inbox",
      };
    }
    case "handoff.released": {
      const conv = uuidish(data.conversation_id);
      return {
        kind: "handoff",
        title: "گفت‌وگو به دستیار برگشت",
        description: channel ? `دستیار دوباره به مشتری در ${channel} جواب می‌دهد.` : "دستیار دوباره به مشتری جواب می‌دهد.",
        href: conv ? `/panel/inbox/${conv}` : "/panel/inbox",
      };
    }
    case "message.received": {
      const conv = uuidish(data.conversation_id);
      return {
        kind: "message",
        title: count > 1 ? `${fa(count)} پیام تازه در گفت‌وگوی سپرده‌شده به شما` : "پیام تازه در گفت‌وگوی سپرده‌شده به شما",
        description: channel ? `مشتری در ${channel} منتظر پاسخ شماست.` : "مشتری منتظر پاسخ شماست.",
        href: conv ? `/panel/inbox/${conv}` : "/panel/inbox",
      };
    }
    case "order.status_changed": {
      const move = ORDER_MOVE_FA[s(data.to)];
      const label = code(data.code) ? `سفارش ${code(data.code)}` : "یک سفارش";
      return {
        kind: "order",
        title: move ? `${label} ${move}` : `وضعیت ${label} تغییر کرد`,
        href: order ? `/panel/orders/${order}` : "/panel/orders",
      };
    }
    case "order.created":
      return {
        kind: "order",
        title: code(data.code) ? `سفارش تازه ${code(data.code)}` : "سفارش تازه",
        href: order ? `/panel/orders/${order}` : "/panel/orders",
      };
    case "payment.evidence_received":
      return {
        kind: "receipt",
        title: code(data.code) ? `رسید تازه برای سفارش ${code(data.code)}` : "رسید تازه برای یک سفارش",
        description: "رسید را بررسی و تأیید یا رد کنید.",
        href: order ? `/panel/orders/${order}` : "/panel/orders",
      };
    case "credit.exhausted":
      return {
        kind: "credit",
        title: "اعتبار دستیار تمام شد",
        description: "تا اعتبار را شارژ نکنید، دستیار به پیام‌ها جواب نمی‌دهد.",
        href: "/panel/credit",
      };
    case "channel.connected":
      return {
        kind: "channel",
        title: channel ? `${channel} وصل شد` : "یک کانال وصل شد",
        description: "پیام‌های مشتری‌ها از این کانال در صندوق گفت‌وگوها می‌آیند.",
        href: "/panel/channels",
      };
    case "channel.disconnected": {
      // Bizin sends `banned` for every WhatsApp logout, a device removed on the phone included.
      const loggedOut = s(data.status) === "banned" && s(data.channel_kind) === "whatsapp";
      return {
        kind: "channel",
        title: channel ? `اتصال ${channel} قطع شد` : "اتصال یک کانال قطع شد",
        description: loggedOut
          ? "دستگاه از بخش «دستگاه‌های متصل» واتس‌اپ خارج شده؛ آن را حذف کنید و دوباره وصل کنید."
          : "برای ادامه‌ی پاسخ‌گویی، کانال را دوباره وصل کنید.",
        href: "/panel/channels",
      };
    }
    case "channel.health_changed": {
      const state = s(data.state);
      const fixed = state === "ok";
      const where = channel || "یک کانال";
      return {
        kind: "channel",
        title: fixed ? `${where} دوباره پیام‌ها را می‌رساند` : state === "broken" ? `${where} پیام‌ها را نمی‌رساند` : `${where} با مشکل پیام می‌رساند`,
        description: fixed ? undefined : "وضعیت کانال را در صفحه‌ی کانال‌ها ببینید.",
        href: "/panel/channels",
      };
    }
    case "case.opened": {
      const id = uuidish(data.case_id);
      return {
        kind: "case",
        title: code(data.code) ? `درخواست مرجوعی تازه ${code(data.code)}` : "درخواست مرجوعی تازه",
        href: id ? `/panel/returns/${id}` : "/panel/returns",
      };
    }
    case "case.updated": {
      const id = uuidish(data.case_id);
      const label = code(data.code) ? `درخواست ${code(data.code)}` : "درخواست مرجوعی";
      const action = CASE_ACTION_FA[s(data.action)];
      return {
        kind: "case",
        title: action ? `${label}: ${action}` : `${label} به‌روز شد`,
        href: id ? `/panel/returns/${id}` : "/panel/returns",
      };
    }
    case "import.completed": {
      const failed = Number(data.failed) || 0;
      return {
        kind: "import",
        title: s(data.status) === "error" ? "ورود محصولات با خطا تمام شد" : "ورود محصولات تمام شد",
        description: failed > 0 ? "چند ردیف وارد نشد؛ جزئیات را ببینید." : undefined,
        href: "/panel/products",
      };
    }
    // Booking payloads carry ids and states only (contract §4); the page re-reads the booking.
    case "booking.created": {
      const id = uuidish(data.booking_id);
      const label = code(data.code) ? `نوبت تازه ${code(data.code)}` : "نوبت تازه";
      const waiting = s(data.status) === "pending_approval" || s(data.status) === "pending_payment";
      return {
        kind: "booking",
        title: label,
        description: waiting ? (s(data.status) === "pending_approval" ? "منتظر تأیید شماست." : "منتظر بیعانه‌ی مشتری است.") : channel ? `از ${channel}` : undefined,
        href: id ? `/panel/booking/${id}` : "/panel/booking",
      };
    }
    case "booking.status_changed": {
      const id = uuidish(data.booking_id);
      const move = BOOKING_MOVE_FA[s(data.to)];
      const label = code(data.code) ? `نوبت ${code(data.code)}` : "یک نوبت";
      return {
        kind: "booking",
        title: move ? `${label} ${move}` : `وضعیت ${label} تغییر کرد`,
        href: id ? `/panel/booking/${id}` : "/panel/booking",
      };
    }
    case "booking.rescheduled": {
      const id = uuidish(data.booking_id);
      return {
        kind: "booking",
        title: code(data.code) ? `زمان نوبت ${code(data.code)} عوض شد` : "زمان یک نوبت عوض شد",
        href: id ? `/panel/booking/${id}` : "/panel/booking",
      };
    }
    case "booking.receipt_received": {
      const id = uuidish(data.booking_id);
      return {
        kind: "receipt",
        title: code(data.code) ? `رسید بیعانه برای نوبت ${code(data.code)}` : "رسید بیعانه برای یک نوبت",
        description: "رسید را بررسی و بیعانه را تأیید یا رد کنید.",
        href: id ? `/panel/booking/${id}` : "/panel/booking",
      };
    }
    default:
      return null;
  }
}

const CONV = "json_extract(payload, '$.data.conversation_id')";

/** A seller's own decision on a case comes back as case.updated; it is not news to them. */
const NOT_OWN_CASE_MOVE = "NOT (type = 'case.updated' AND coalesce(json_extract(payload, '$.data.actor'), '') IN ('seller', 'partner'))";

/**
 * One row per conversation: its latest message.received and the unread messages, for a conversation whose latest
 * handoff event is handoff.raised, counted from that handoff. Arrival order is rowid: a burst shares a millisecond.
 * Taking a thread over emits no webhook, so a conversation the seller took over without a handoff is not here.
 */
const HELD_MESSAGES_SQL = `
  WITH h AS (
    SELECT ${CONV} AS conv, type, MAX(rowid) AS seq
    FROM webhook_events WHERE ext = ? AND type IN ('handoff.raised', 'handoff.released') GROUP BY conv
  )
  SELECT m.event_id, m.payload, m.received_at, MAX(m.seq) AS seq, SUM(m.read_at IS NULL) AS unread
  FROM (SELECT rowid AS seq, *, ${CONV} AS conv FROM webhook_events WHERE ext = ? AND type = 'message.received') m
  JOIN h ON h.conv = m.conv AND h.type = 'handoff.raised' AND m.seq > h.seq
  GROUP BY m.conv`;

interface HeldRow {
  event_id: string;
  payload: string;
  received_at: string;
  unread: number;
}

export function notificationsForExt(
  ext: string,
  opts: { limit?: number; types?: readonly string[] } = {},
): { items: NotificationItem[]; unread: number } {
  const limit = opts.limit ?? 20;
  const wanted = new Set(opts.types ?? NOTIFY_TYPES);
  const types = NOTIFY_TYPES.filter((t) => t !== "message.received" && wanted.has(t));
  const d = getDb();
  const items: NotificationItem[] = [];
  let unread = 0;

  if (types.length > 0) {
    const where = `ext = ? AND type IN (${types.map(() => "?").join(", ")}) AND ${NOT_OWN_CASE_MOVE}`;
    const rows = d
      .prepare(`SELECT * FROM webhook_events WHERE ${where} ORDER BY received_at DESC LIMIT ?`)
      .all(ext, ...types, limit) as unknown as WebhookEventRow[];
    const count = d.prepare(`SELECT COUNT(*) AS n FROM webhook_events WHERE ${where} AND read_at IS NULL`).get(ext, ...types) as { n: number };
    unread += Number(count.n);
    for (const r of rows) {
      const view = describeEvent(r.type, r.payload);
      if (view) items.push({ ...view, id: r.event_id, at: r.received_at, read: r.read_at !== null });
    }
  }

  if (wanted.has("message.received")) {
    for (const r of d.prepare(HELD_MESSAGES_SQL).all(ext, ext) as unknown as HeldRow[]) {
      const fresh = Number(r.unread);
      if (fresh > 0) unread += 1;
      const view = describeEvent("message.received", r.payload, fresh);
      if (view) items.push({ ...view, id: r.event_id, at: r.received_at, read: fresh === 0 });
    }
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { items: items.slice(0, limit), unread };
}

/**
 * Scoped by `ext`: an event id of another shop changes nothing. A message.received id stands for its conversation's
 * item, so every earlier message of that conversation is read with it.
 */
export function markNotificationRead(ext: string, eventId: string): void {
  const now = new Date().toISOString();
  const d = getDb();
  d.prepare("UPDATE webhook_events SET read_at = ? WHERE ext = ? AND event_id = ? AND read_at IS NULL").run(now, ext, eventId);
  const target = "FROM webhook_events t WHERE t.ext = ? AND t.event_id = ? AND t.type = 'message.received'";
  d.prepare(
    `UPDATE webhook_events SET read_at = ?
     WHERE ext = ? AND type = 'message.received' AND read_at IS NULL
       AND ${CONV} = (SELECT json_extract(t.payload, '$.data.conversation_id') ${target})
       AND rowid <= (SELECT t.rowid ${target})`,
  ).run(now, ext, ext, eventId, ext, eventId);
}

const TYPES_SQL = NOTIFY_TYPES.map(() => "?").join(", ");

export function markAllNotificationsRead(ext: string): void {
  getDb()
    .prepare(`UPDATE webhook_events SET read_at = ? WHERE ext = ? AND type IN (${TYPES_SQL}) AND read_at IS NULL`)
    .run(new Date().toISOString(), ext, ...NOTIFY_TYPES);
}
