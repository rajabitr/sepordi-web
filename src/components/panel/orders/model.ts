import type { Schemas } from "@/server/bizin/schema";

/*
 * Types, labels and rules of the orders screens. Type-only imports from the API schema, so client components can
 * share this file without pulling server code into the bundle.
 */

export type Order = Schemas["Order"];
export type OrderStatus = Schemas["OrderStatus"];
export type PaymentStatus = Schemas["PaymentStatus"];
export type Evidence = Schemas["Evidence"];
export type RejectReason = Schemas["PaymentRejectReason"];
export type StatusMove = Schemas["OrderStatusMove"]["status"];
export type ShippingBasis = Schemas["ShippingBasis"];

export type Tone = "default" | "secondary" | "success" | "warning" | "brand" | "destructive";

/** What every server action of the panel answers; the message is already the seller's Farsi. */
export type ActionResult = { ok: true } | { ok: false; code: string; message: string; requestId?: string };

export const ORDER_STATUSES: readonly OrderStatus[] = ["draft", "confirmed", "paid", "packing", "shipped", "delivered", "cancelled"];
export const PAYMENT_STATUSES: readonly PaymentStatus[] = ["unpaid", "pending_verification", "rejected", "paid"];

const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  draft: { label: "پیش‌نویس", tone: "secondary" },
  confirmed: { label: "منتظر پرداخت", tone: "brand" },
  paid: { label: "پرداخت‌شده", tone: "success" },
  packing: { label: "در حال آماده‌سازی", tone: "brand" },
  shipped: { label: "ارسال‌شده", tone: "brand" },
  delivered: { label: "تحویل‌شده", tone: "success" },
  cancelled: { label: "لغوشده", tone: "destructive" },
};

const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  unpaid: { label: "پرداخت‌نشده", tone: "secondary" },
  pending_verification: { label: "رسید در انتظار بررسی", tone: "warning" },
  rejected: { label: "رسید ردشده", tone: "destructive" },
  paid: { label: "پرداخت‌شده", tone: "success" },
};

const EVIDENCE_STATUS: Record<Evidence["status"], { label: string; tone: Tone }> = {
  pending_verification: { label: "در انتظار بررسی", tone: "warning" },
  approved: { label: "تأییدشده", tone: "success" },
  rejected: { label: "ردشده", tone: "destructive" },
  closed: { label: "بسته‌شده", tone: "secondary" },
};

const UNKNOWN = { label: "نامشخص", tone: "secondary" as Tone };

// Statuses are extensible: a value this build does not know still renders.
export const orderStatusMeta = (s: string) => ORDER_STATUS[s as OrderStatus] ?? UNKNOWN;
export const paymentStatusMeta = (s: string) => PAYMENT_STATUS[s as PaymentStatus] ?? UNKNOWN;
export const evidenceStatusMeta = (s: string) => EVIDENCE_STATUS[s as Evidence["status"]] ?? UNKNOWN;

const CHANNELS: Record<string, string> = { whatsapp: "واتس‌اپ", instagram: "اینستاگرام", telegram: "تلگرام" };
export const channelLabel = (c: string | null | undefined) => (c ? (CHANNELS[c] ?? "کانال دیگر") : "نامشخص");

export const SOURCE_LABEL: Record<Order["source"], string> = {
  ai: "دستیار هوشمند در گفت‌وگو",
  dashboard: "پنل فروشگاه",
  api: "سپردی",
};

export const REJECT_REASONS: { value: RejectReason; label: string }[] = [
  { value: "amount_mismatch", label: "مبلغ مغایرت دارد" },
  { value: "unreadable", label: "ناخوانا" },
  { value: "not_received", label: "واریزی نرسیده" },
  { value: "wrong_destination", label: "به کارت دیگری واریز شده" },
  { value: "other", label: "سایر" },
];
export const rejectReasonLabel = (r: string | null) => REJECT_REASONS.find((x) => x.value === r)?.label ?? "سایر";

export function shippingBasisLabel(basis: ShippingBasis | undefined, zone: string | undefined): string | undefined {
  switch (basis) {
    case "manual":
      return "هزینه‌ی تعیین‌شده توسط شما";
    case "flat":
      return "نرخ ثابت ارسال";
    case "province":
      return zone ? `نرخ استان ${zone}` : "نرخ استان";
    case "city":
      return zone ? `نرخ شهر ${zone}` : "نرخ شهر";
    case "free":
      return "ارسال رایگان";
    case "unresolved":
      return "هنوز محاسبه نشده";
    default:
      return undefined;
  }
}

/**
 * The fulfilment moves the Partner API accepts from each status (partner-api.md §8.16). `paid` is reached only through a
 * receipt approval or mark-paid, so it is never a move here; `confirmed` waits for its payment and can only be cancelled.
 */
const MOVES: Partial<Record<OrderStatus, StatusMove[]>> = {
  draft: ["cancelled"],
  confirmed: ["cancelled"],
  paid: ["packing", "shipped", "cancelled"],
  packing: ["shipped", "cancelled"],
  shipped: ["delivered"],
};

export function allowedOrderMoves(status: string): StatusMove[] {
  return MOVES[status as OrderStatus] ?? [];
}

export const MOVE_LABEL: Record<StatusMove, { button: string; ask: (order: string) => string; done: string }> = {
  packing: { button: "شروع آماده‌سازی", ask: (o) => `آماده‌سازی ${o} را شروع می‌کنید؟`, done: "سفارش به «در حال آماده‌سازی» رفت." },
  shipped: { button: "ثبت ارسال", ask: (o) => `ارسال ${o} را ثبت می‌کنید؟`, done: "ارسال سفارش ثبت شد." },
  delivered: { button: "ثبت تحویل", ask: (o) => `تحویل ${o} را ثبت می‌کنید؟`, done: "تحویل سفارش ثبت شد." },
  cancelled: { button: "لغو سفارش", ask: (o) => `${o} را لغو می‌کنید؟`, done: "سفارش لغو شد." },
};

/** Approve, reject and mark-paid need an order that waits for its payment. */
export const awaitsPayment = (o: Pick<Order, "status">) => o.status === "confirmed";

// ---- list filters and the URL ------------------------------------------------------------------------------

export interface OrderFilters {
  status?: OrderStatus;
  payment?: PaymentStatus;
  /** A Tehran calendar day, YYYY-MM-DD. */
  from?: string;
  cursor?: string;
  /** The cursors of the pages before this one, oldest first; "" is the first page. */
  back: string[];
}

export type OrderTab = "all" | "pending" | "paid" | "shipping" | "cancelled";

export const ORDER_TABS: { value: OrderTab; label: string; status?: OrderStatus; payment?: PaymentStatus }[] = [
  { value: "all", label: "همه" },
  { value: "pending", label: "رسید در انتظار بررسی", payment: "pending_verification" },
  { value: "paid", label: "پرداخت‌شده", status: "paid" },
  { value: "shipping", label: "در حال ارسال", status: "shipped" },
  { value: "cancelled", label: "لغوشده", status: "cancelled" },
];

/** The tab whose filters are exactly the active ones; "" when the seller combined filters by hand. */
export function activeTab(f: Pick<OrderFilters, "status" | "payment">): OrderTab | "" {
  return ORDER_TABS.find((t) => t.status === f.status && t.payment === f.payment)?.value ?? "";
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BACK = 30;

type RawParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Unknown values are dropped rather than sent: the API answers them with a 400. */
export function parseOrderFilters(sp: RawParams): OrderFilters {
  const status = one(sp.status);
  const payment = one(sp.payment);
  const from = one(sp.from);
  const cursor = one(sp.cursor);
  return {
    status: ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : undefined,
    payment: PAYMENT_STATUSES.includes(payment as PaymentStatus) ? (payment as PaymentStatus) : undefined,
    from: from && DAY.test(from) && !Number.isNaN(Date.parse(from)) ? from : undefined,
    cursor: cursor || undefined,
    back: cursor ? many(sp.back).slice(-MAX_BACK) : [],
  };
}

export function ordersHref(f: Partial<OrderFilters>): string {
  const qs = new URLSearchParams();
  if (f.status) qs.set("status", f.status);
  if (f.payment) qs.set("payment", f.payment);
  if (f.from) qs.set("from", f.from);
  if (f.cursor) {
    qs.set("cursor", f.cursor);
    for (const b of (f.back ?? []).slice(-MAX_BACK)) qs.append("back", b);
  }
  const s = qs.toString();
  return s ? `/panel/orders?${s}` : "/panel/orders";
}

/** A filter change: the other filters stay, the page goes back to the first. */
export function filteredOrdersHref(f: Partial<OrderFilters>, change: Partial<OrderFilters>): string {
  return ordersHref({ status: f.status, payment: f.payment, from: f.from, ...change, cursor: undefined, back: [] });
}

/** The next page keeps the filters and remembers this page's cursor. */
export function nextPageHref(f: OrderFilters, nextCursor: string): string {
  return ordersHref({ ...f, cursor: nextCursor, back: [...f.back, f.cursor ?? ""] });
}

/** The previous page, or undefined on the first one. */
export function prevPageHref(f: OrderFilters): string | undefined {
  if (!f.cursor) return undefined;
  const back = f.back.slice(0, -1);
  const prev = f.back.at(-1) ?? "";
  return ordersHref({ ...f, cursor: prev || undefined, back });
}

// ---- Tehran days ---------------------------------------------------------------------------------------------

// Iran dropped daylight saving in 2022: Tehran is a fixed UTC+03:30.
const TEHRAN_OFFSET_MS = 3.5 * 3600_000;
const DAY_MS = 24 * 3600_000;

/** The UTC instant a Tehran calendar day (YYYY-MM-DD) starts. */
export function tehranDayStart(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - TEHRAN_OFFSET_MS);
}

/** The Tehran calendar day of an instant, YYYY-MM-DD. */
export function tehranDay(at: Date): string {
  return new Date(at.getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
}

/** The start of today and of this Saturday-first week in Tehran, as UTC instants. */
export function tehranTodayAndWeek(now: Date = new Date()): { today: Date; week: Date } {
  const today = tehranDayStart(tehranDay(now));
  const weekday = new Date(today.getTime() + TEHRAN_OFFSET_MS).getUTCDay();
  const sinceSaturday = (weekday + 1) % 7;
  return { today, week: new Date(today.getTime() - sinceSaturday * DAY_MS) };
}

/** A day the date picker returned (the browser's local midnight), as the YYYY-MM-DD the seller meant. */
export function pickedDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The YYYY-MM-DD in the URL back as a local Date for the picker. */
export function dayToPicker(day: string | undefined): Date | null {
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Timestamps of an order in the order they happened. The API has no delivered_at: a delivered order's last update is it. */
export function orderTimeline(o: Order): { key: string; title: string; at: string }[] {
  const rows: { key: string; title: string; at: string | null | undefined }[] = [
    { key: "created", title: "ثبت سفارش", at: o.created_at },
    { key: "confirmed", title: "تأیید سفارش توسط مشتری", at: o.confirmed_at },
    { key: "paid", title: "تأیید پرداخت", at: o.paid_at ?? o.payment.paid_at },
    { key: "packing", title: "شروع آماده‌سازی", at: o.packing_at },
    { key: "shipped", title: "ارسال", at: o.shipped_at },
    { key: "delivered", title: "تحویل به مشتری", at: o.status === "delivered" ? o.updated_at : null },
    { key: "cancelled", title: "لغو سفارش", at: o.cancelled_at },
  ];
  return rows
    .filter((r): r is { key: string; title: string; at: string } => Boolean(r.at))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Order, receipt, case and photo ids are uuids; anything else is refused before the API is called. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
