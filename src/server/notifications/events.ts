import "server-only";

import { getDb } from "@/server/db";
import type { WebhookEventRow } from "@/server/db/repo";

/*
 * Webhook events a seller is told about. message.* and the like are stored by the receiver but never shown:
 * the inbox already carries them, and one per message would bury everything else.
 */
export const NOTIFY_TYPES = [
  "handoff.raised",
  "order.created",
  "payment.evidence_received",
  "credit.exhausted",
  "channel.disconnected",
  "channel.health_changed",
  "case.opened",
  "import.completed",
] as const;

export type NotifyType = (typeof NOTIFY_TYPES)[number];

export type NotificationKind = "handoff" | "order" | "receipt" | "credit" | "channel" | "case" | "import";

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

const s = (v: unknown) => (typeof v === "string" ? v : "");
/** Codes go into a Farsi sentence; keep them short and printable. */
const code = (v: unknown) => s(v).replace(/[^\w-]/g, "").slice(0, 32);
const uuidish = (v: unknown) => (/^[0-9a-fA-F-]{8,64}$/.test(s(v)) ? s(v) : "");

/** The Farsi line and target page of one stored event, or null for a type the bell does not show. */
export function describeEvent(type: string, payload: string): Omit<NotificationItem, "id" | "at" | "read"> | null {
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
    case "import.completed": {
      const failed = Number(data.failed) || 0;
      return {
        kind: "import",
        title: s(data.status) === "error" ? "ورود محصولات با خطا تمام شد" : "ورود محصولات تمام شد",
        description: failed > 0 ? "چند ردیف وارد نشد؛ جزئیات را ببینید." : undefined,
        href: "/panel/products",
      };
    }
    default:
      return null;
  }
}

const TYPES_SQL = NOTIFY_TYPES.map(() => "?").join(", ");

export function notificationsForExt(ext: string, limit = 20): { items: NotificationItem[]; unread: number } {
  const d = getDb();
  const rows = d
    .prepare(`SELECT * FROM webhook_events WHERE ext = ? AND type IN (${TYPES_SQL}) ORDER BY received_at DESC LIMIT ?`)
    .all(ext, ...NOTIFY_TYPES, limit) as unknown as WebhookEventRow[];
  const unread = d
    .prepare(`SELECT COUNT(*) AS n FROM webhook_events WHERE ext = ? AND type IN (${TYPES_SQL}) AND read_at IS NULL`)
    .get(ext, ...NOTIFY_TYPES) as { n: number };
  const items: NotificationItem[] = [];
  for (const r of rows) {
    const view = describeEvent(r.type, r.payload);
    if (view) items.push({ ...view, id: r.event_id, at: r.received_at, read: r.read_at !== null });
  }
  return { items, unread: Number(unread.n) };
}

/** Scoped by `ext`: an event id of another shop changes nothing. */
export function markNotificationRead(ext: string, eventId: string): void {
  getDb()
    .prepare("UPDATE webhook_events SET read_at = ? WHERE ext = ? AND event_id = ? AND read_at IS NULL")
    .run(new Date().toISOString(), ext, eventId);
}

export function markAllNotificationsRead(ext: string): void {
  getDb()
    .prepare(`UPDATE webhook_events SET read_at = ? WHERE ext = ? AND type IN (${TYPES_SQL}) AND read_at IS NULL`)
    .run(new Date().toISOString(), ext, ...NOTIFY_TYPES);
}
