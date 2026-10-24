import { tehranDay, tehranDayStart, type ActionResult, type Tone } from "@/components/panel/orders/model";
import { rialToToman, tomanToRial } from "@/lib/money";
import { fa } from "@/lib/utils";
import type { Booking, BookingAction, BookingInterval, ListBookingsQuery } from "@/server/bizin/booking/types";
import type { Capability } from "@/server/team/roles";

/*
 * Labels and rules of the booking screens. Pure: client components share it, and every rule here has a unit test.
 * Contract: docs/handover/2026-10-24-partner-booking-api.md.
 */

export type { ActionResult, Tone };

export const BOOKING_VIEW: Capability = "booking.view";
export const BOOKING_MANAGE: Capability = "booking.manage";
/** Deposits are payments: the same capability as an order's receipt. */
export const BOOKING_PAYMENTS: Capability = "orders.payment";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const KEY_RE = /^[\x21-\x7e]{1,255}$/;

// ---- statuses -----------------------------------------------------------------------------------------------

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_approval: { label: "در انتظار تأیید", tone: "warning" },
  pending_payment: { label: "در انتظار بیعانه", tone: "warning" },
  confirmed: { label: "تأییدشده", tone: "success" },
  completed: { label: "انجام‌شده", tone: "secondary" },
  no_show: { label: "نیامد", tone: "destructive" },
  cancelled: { label: "لغوشده", tone: "secondary" },
  expired: { label: "منقضی‌شده", tone: "secondary" },
};

const PAYMENT: Record<string, { label: string; tone: Tone }> = {
  none: { label: "بدون بیعانه", tone: "secondary" },
  awaiting: { label: "منتظر واریز", tone: "warning" },
  receipt_received: { label: "رسید رسیده", tone: "brand" },
  confirmed: { label: "بیعانه تأیید شد", tone: "success" },
  rejected: { label: "رسید رد شد", tone: "destructive" },
  refund_due: { label: "باید برگردانده شود", tone: "warning" },
};

const SOURCE: Record<string, string> = {
  ai: "دستیار در گفت‌وگو",
  flow: "فرم گفت‌وگو",
  panel: "پنل بیزین",
  import: "ورود از فایل",
  partner: "پنل سپردی",
};

const CONFLICT: Record<string, string> = {
  holiday_changed: "این روز بعداً تعطیل شد",
  blocked: "این ساعت بعداً بسته شد",
  outside_hours: "خارج از ساعت کاری فعلی",
  resource_archived: "پرسنل این نوبت بایگانی شد",
};

export const statusMeta = (s: string) => STATUS[s] ?? { label: "سایر", tone: "secondary" as Tone };
export const paymentMeta = (s: string) => PAYMENT[s] ?? { label: "سایر", tone: "secondary" as Tone };
export const sourceLabel = (s: string) => SOURCE[s] ?? "سایر";
export const conflictLabel = (c: string) => (c ? (CONFLICT[c] ?? "با برنامه‌ی فعلی هم‌خوان نیست") : "");

const ACTIVE = new Set(["pending_approval", "pending_payment", "confirmed"]);
export const isActive = (status: string) => ACTIVE.has(status);

export type DeskAction = BookingAction | "reschedule";

/** The moves the contract's state machine (§1.1, §3.2 27–34) allows from a status. */
export function allowedActions(b: Pick<Booking, "status">): DeskAction[] {
  switch (b.status) {
    case "pending_approval":
      return ["approve", "reject", "reschedule", "cancel"];
    case "pending_payment":
      return ["confirm-payment", "reject-payment", "cancel"];
    case "confirmed":
      return ["complete", "no-show", "reschedule", "cancel"];
    default:
      return [];
  }
}

/** A cancel of a confirmed booking needs a reason (422 cancel_reason_required); reject's reason is optional. */
export function reasonRule(action: DeskAction, status: string): "required" | "optional" | "none" {
  if (action === "cancel") return status === "confirmed" ? "required" : "optional";
  if (action === "reject" || action === "reject-payment") return "optional";
  return "none";
}

export const ACTION_LABEL: Record<DeskAction, { button: string; ask: string; done: string }> = {
  approve: { button: "تأیید نوبت", ask: "این نوبت تأیید شود؟", done: "نوبت تأیید شد" },
  reject: { button: "رد درخواست", ask: "درخواست این نوبت رد شود؟", done: "درخواست رد شد" },
  cancel: { button: "لغو نوبت", ask: "این نوبت لغو شود؟", done: "نوبت لغو شد" },
  reschedule: { button: "تغییر زمان", ask: "زمان تازه‌ی نوبت را انتخاب کنید", done: "زمان نوبت عوض شد" },
  complete: { button: "انجام شد", ask: "انجام این نوبت ثبت شود؟", done: "نوبت انجام‌شده ثبت شد" },
  "no-show": { button: "مشتری نیامد", ask: "«نیامد» برای این نوبت ثبت شود؟", done: "«نیامد» ثبت شد" },
  "confirm-payment": { button: "تأیید بیعانه", ask: "واریز بیعانه تأیید شود؟", done: "بیعانه تأیید شد و نوبت قطعی شد" },
  "reject-payment": { button: "رد رسید", ask: "رسید بیعانه رد شود؟", done: "رسید رد شد" },
};

export const PAYMENT_ACTIONS: readonly DeskAction[] = ["confirm-payment", "reject-payment"];

// ---- Tehran days and list queries ---------------------------------------------------------------------------

const DAY_MS = 24 * 3600_000;

/** YYYY-MM-DD plus n civil days. */
export function addDay(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Tehran civil days [fromDay, toDay], both inclusive as the seller picked them, as the half-open UTC instants
 * `GET /bookings?from&to` filters `starts_at` on (§3.2 24).
 */
export function tehranDaysToUtc(fromDay: string, toDay: string): { from: string; to: string } {
  return { from: tehranDayStart(fromDay).toISOString(), to: tehranDayStart(addDay(toDay, 1)).toISOString() };
}

/** Saturday of the week that holds `day`. */
export function weekStart(day: string): string {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDay(day, -((wd + 1) % 7));
}

export const BOOKING_TABS = [
  { value: "pending", label: "در انتظار تأیید" },
  { value: "today", label: "امروز" },
  { value: "upcoming", label: "پیش‌رو" },
  { value: "past", label: "گذشته" },
  { value: "cancelled", label: "لغوشده" },
] as const;
export type BookingTab = (typeof BOOKING_TABS)[number]["value"];
export type BookingView = "list" | "day" | "week";

export interface BookingFilters {
  tab: BookingTab;
  view: BookingView;
  service?: string;
  resource?: string;
  /** Tehran days, YYYY-MM-DD. */
  from?: string;
  to?: string;
  /** The calendar's day (day view) or any day of its week. */
  date?: string;
  cursor?: string;
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseBookingFilters(sp: SP): BookingFilters {
  const tab = BOOKING_TABS.find((t) => t.value === one(sp.tab))?.value ?? "pending";
  const viewRaw = one(sp.view);
  const view: BookingView = viewRaw === "day" || viewRaw === "week" ? viewRaw : "list";
  const day = (v: string | undefined) => (v && DAY_RE.test(v) ? v : undefined);
  const id = (v: string | undefined) => (v && UUID_RE.test(v) ? v : undefined);
  const cursor = one(sp.cursor);
  return {
    tab,
    view,
    service: id(one(sp.service)),
    resource: id(one(sp.resource)),
    from: day(one(sp.from)),
    to: day(one(sp.to)),
    date: day(one(sp.date)),
    cursor: cursor && cursor.length <= 512 ? cursor : undefined,
  };
}

export function bookingsHref(f: Partial<BookingFilters>): string {
  const qs = new URLSearchParams();
  if (f.tab && f.tab !== "pending") qs.set("tab", f.tab);
  if (f.view && f.view !== "list") qs.set("view", f.view);
  for (const k of ["service", "resource", "from", "to", "date", "cursor"] as const) {
    const v = f[k];
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `/panel/booking?${s}` : "/panel/booking";
}

/** The `GET /bookings` query of a list tab, with the seller's service, resource and date filters. */
export function listQueryFor(f: BookingFilters, now: Date = new Date()): ListBookingsQuery {
  const today = tehranDay(now);
  const base: ListBookingsQuery = { service_id: f.service, resource_id: f.resource, cursor: f.cursor };
  const first = f.from ?? f.to;
  const last = f.to ?? f.from;
  const range = first && last ? tehranDaysToUtc(first <= last ? first : last, first <= last ? last : first) : null;
  const nowIso = now.toISOString();
  switch (f.tab) {
    case "pending":
      return { ...base, ...range, status: ["pending_approval", "pending_payment"], sort: "-created_at" };
    case "today":
      return { ...base, ...tehranDaysToUtc(today, today), status: ["pending_approval", "pending_payment", "confirmed", "completed", "no_show"], sort: "starts_at" };
    case "upcoming":
      return { ...base, from: range && range.from > nowIso ? range.from : nowIso, to: range?.to, status: ["pending_approval", "pending_payment", "confirmed"], sort: "starts_at" };
    case "past":
      return { ...base, from: range?.from, to: range && range.to < nowIso ? range.to : nowIso, status: ["confirmed", "completed", "no_show"], sort: "-created_at" };
    case "cancelled":
      return { ...base, ...range, status: ["cancelled", "expired"], sort: "-created_at" };
  }
}

/** The calendar's visible days (one, or Saturday to Friday) and their UTC window. */
export function calendarWindow(f: Pick<BookingFilters, "view" | "date">, now: Date = new Date()): { days: string[]; from: string; to: string } {
  const anchor = f.date ?? tehranDay(now);
  const first = f.view === "week" ? weekStart(anchor) : anchor;
  const count = f.view === "week" ? 7 : 1;
  const days = Array.from({ length: count }, (_, i) => addDay(first, i));
  return { days, ...tehranDaysToUtc(days[0], days[days.length - 1]) };
}

// ---- weekly intervals ---------------------------------------------------------------------------------------

/** Saturday-first, as the seller reads a week; values are the contract's weekday (0 = Sunday). */
export const UI_WEEKDAYS: readonly { weekday: number; label: string }[] = [
  { weekday: 6, label: "شنبه" },
  { weekday: 0, label: "یکشنبه" },
  { weekday: 1, label: "دوشنبه" },
  { weekday: 2, label: "سه‌شنبه" },
  { weekday: 3, label: "چهارشنبه" },
  { weekday: 4, label: "پنجشنبه" },
  { weekday: 5, label: "جمعه" },
];

export const MAX_INTERVALS = 98;
const HM_RE = /^(\d{1,2}):(\d{2})$/;

/** "09:30" → 570; null for anything that is not HH:MM inside a day. */
export function hmToMin(hm: string): number | null {
  const m = hm.trim().match(HM_RE);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 570 → "09:30"; past midnight wraps (1560 → "02:00"). */
export function minToHm(min: number): string {
  const v = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

/** «۰۹:۳۰»; an end past midnight reads «۰۲:۰۰ بامداد فردا». */
export function minLabel(min: number): string {
  if (min === 1440) return fa("24:00");
  return min > 1440 ? `${fa(minToHm(min))} بامداد فردا` : fa(minToHm(min));
}

/**
 * An editor row (start and end clock times) as a contract interval. An end at or before the start runs past midnight
 * into the next morning: end_min = end + 1440 (≤ 2880).
 */
export function rowToInterval(weekday: number, startHm: string, endHm: string): BookingInterval | null {
  const s = hmToMin(startHm);
  const e = hmToMin(endHm);
  if (s === null || e === null) return null;
  return { weekday, start_min: s, end_min: e <= s ? e + 1440 : e };
}

export interface IntervalProblem {
  /** -1 for a problem of the whole week. */
  index: number;
  field: "start_min" | "end_min" | "interval" | "intervals";
  message: string;
}

/** The rules of `PUT /hours` and `PUT /schedules/{ext}` (§3.2 9–12), checked before the seller saves. */
export function validateIntervals(intervals: readonly BookingInterval[]): IntervalProblem[] {
  const out: IntervalProblem[] = [];
  if (intervals.length > MAX_INTERVALS) {
    out.push({ index: -1, field: "intervals", message: `حداکثر ${fa(MAX_INTERVALS)} بازه در هفته می‌شود ثبت کرد.` });
  }
  intervals.forEach((iv, i) => {
    if (!Number.isInteger(iv.weekday) || iv.weekday < 0 || iv.weekday > 6) {
      out.push({ index: i, field: "interval", message: "روز هفته نامعتبر است." });
    } else if (!Number.isInteger(iv.start_min) || iv.start_min < 0 || iv.start_min > 1439) {
      out.push({ index: i, field: "start_min", message: "ساعت شروع باید بین ۰۰:۰۰ و ۲۳:۵۹ باشد." });
    } else if (!Number.isInteger(iv.end_min) || iv.end_min < 1 || iv.end_min > 2880) {
      out.push({ index: i, field: "end_min", message: "ساعت پایان نامعتبر است." });
    } else if (iv.end_min <= iv.start_min) {
      out.push({ index: i, field: "end_min", message: "ساعت پایان باید بعد از ساعت شروع باشد." });
    } else if (iv.end_min - iv.start_min > 1440) {
      out.push({ index: i, field: "end_min", message: "هر بازه حداکثر ۲۴ ساعت است." });
    }
  });
  const bad = new Set(out.map((p) => p.index));
  for (let i = 0; i < intervals.length; i++) {
    if (bad.has(i)) continue;
    for (let j = 0; j < i; j++) {
      if (bad.has(j)) continue;
      const a = intervals[i];
      const b = intervals[j];
      if (a.weekday === b.weekday && a.start_min < b.end_min && b.start_min < a.end_min) {
        out.push({ index: i, field: "interval", message: "این بازه با بازه‌ی دیگری در همین روز هم‌پوشانی دارد." });
        bad.add(i);
        break;
      }
    }
  }
  return out;
}

// ---- money --------------------------------------------------------------------------------------------------

/** A service's Rial amount (or null, "not stated") as the Toman the form shows. */
export const rialToForm = (rial: number | null | undefined): number | null => (rial === null || rial === undefined ? null : rialToToman(rial));

/** The Toman the seller typed as the Rial the API stores; empty stays null. */
export const formToRial = (toman: number | null | undefined): number | null =>
  toman === null || toman === undefined || !Number.isFinite(toman) ? null : tomanToRial(toman);

export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${fa(h)} ساعت و ${fa(m)} دقیقه`;
  if (h) return `${fa(h)} ساعت`;
  return `${fa(m)} دقیقه`;
}

/** `svc_`/`res_`/`cat_`/`sch_` plus a uuid: the partner's own id of a row made in sepordi. */
export const EXT_RE = /^(svc|res|cat|sch)_[0-9a-f-]{36}$/;
