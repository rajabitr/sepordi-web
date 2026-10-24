import "server-only";

import { randomUUID } from "node:crypto";

import { toJalali } from "@/lib/jalali";

import type {
  Booking,
  BookingCategory,
  BookingEvent,
  BookingReceipt,
  BookingResource,
  BookingSchedule,
  BookingService,
  BookingSettings,
} from "../booking/types";
import { mockPng } from "./png";
import type { MockBookingState, MockTenant } from "./state";

/* A hair-and-skin salon's appointment book for every mock shop, made the first time a booking route is called. */

// Iran dropped daylight saving in 2022: Tehran is a fixed UTC+03:30.
const OFFSET_MS = 3.5 * 3600_000;
const DAY_MS = 24 * 3600_000;

export const localDay = (ms: number) => new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
export const atLocal = (day: string, min: number) => Date.parse(`${day}T00:00:00Z`) - OFFSET_MS + min * 60_000;
/** 0 = Sunday, as the contract's weekday. */
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
export const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export const DEFAULT_SETTINGS = (): BookingSettings => ({
  assistant_enabled: true,
  timezone: "Asia/Tehran",
  holidays_close_booking: true,
  horizon_days: 30,
  min_notice_min: 60,
  slot_step_min: 30,
  max_per_day: null,
  max_active_per_customer: 2,
  cancel_cutoff_min: 720,
  hold_ttl_min: 10,
  payment_window_min: 120,
  payment_instructions: "بیعانه را به کارت سالن واریز کنید و عکس رسید را همین‌جا بفرستید.",
  when_full: "tell",
  offers_per_reply: 6,
  no_show_after_min: 30,
  reminder_offsets_min: [1440, 120],
  notify_sms: false,
  config_version: 3,
  updated_at: null,
});

const week = (spans: [number, number][], days: number[]) => days.flatMap((weekday) => spans.map(([s, e]) => ({ weekday, start_min: s, end_min: e })));

export function seedBooking(t: MockTenant, now: number): MockBookingState {
  const at = new Date(now).toISOString();
  const today = localDay(now);

  const defaultSchedule: BookingSchedule = {
    id: randomUUID(),
    external_id: null,
    title: "ساعات کاری فروشگاه",
    is_default: true,
    // Saturday to Wednesday 10–14 and 16–20, Thursday mornings; Friday closed.
    intervals: [...week([[600, 840], [960, 1200]], [6, 0, 1, 2, 3]), ...week([[600, 840]], [4])],
  };
  const negarSchedule: BookingSchedule = {
    id: randomUUID(),
    external_id: `sch_${randomUUID()}`,
    title: "ساعات نگار رضایی",
    is_default: false,
    intervals: week([[720, 1200]], [6, 0, 1, 2]),
  };

  const cat = (title: string, color: BookingCategory["color"], position: number): BookingCategory => ({
    id: randomUUID(),
    external_id: `cat_${randomUUID()}`,
    title,
    kind: "in_person",
    color,
    position,
    archived_at: null,
  });
  const hair = cat("خدمات مو", "violet", 0);
  const skin = cat("پوست و زیبایی", "rose", 1);

  const res = (title: string, kind: BookingResource["kind"], position: number, schedule?: BookingSchedule): BookingResource => ({
    id: randomUUID(),
    external_id: `res_${randomUUID()}`,
    title,
    kind,
    capacity: 1,
    schedule_id: schedule?.id ?? null,
    schedule_external_id: schedule?.external_id ?? null,
    is_default: false,
    position,
    archived_at: null,
  });
  const fallback: BookingResource = { ...res("سالن", "line", 99), external_id: null, is_default: true };
  const sara = res("سارا محمدی", "person", 0);
  const negar = res("نگار رضایی", "person", 1, negarSchedule);
  const room = res("اتاق مراقبت پوست", "room", 2);

  const svc = (over: Partial<BookingService> & Pick<BookingService, "title" | "category_id" | "duration_min">, links: BookingResource[], position: number): BookingService => ({
    id: randomUUID(),
    external_id: `svc_${randomUUID()}`,
    category_external_id: null,
    description: "",
    buffer_before_min: 0,
    buffer_after_min: 0,
    price: null,
    deposit: null,
    currency: "IRR",
    price_exponent: 0,
    confirmation_mode: "seller",
    location_text: "تهران، خیابان ولیعصر، بالاتر از پارک ساعی، پلاک ۱۲۰",
    online_link: "",
    require_phone: true,
    offer_in_chat: true,
    channels: ["instagram", "telegram", "whatsapp"],
    schedule_id: null,
    schedule_external_id: null,
    horizon_days: null,
    min_notice_min: null,
    slot_step_min: null,
    max_per_day: null,
    max_active_per_customer: null,
    cancel_cutoff_min: null,
    resource_ids: links.map((r) => r.id),
    resource_external_ids: links.map((r) => r.external_id),
    active: true,
    position,
    archived_at: null,
    created_at: at,
    updated_at: at,
    ...over,
  });
  const haircut = svc({ title: "کوتاهی مو بانوان", category_id: hair.id, category_external_id: hair.external_id, duration_min: 45, buffer_after_min: 15, price: 4_500_000, description: "کوتاهی و حالت‌دهی با سشوار." }, [sara, negar], 0);
  const color = svc({ title: "رنگ مو", category_id: hair.id, category_external_id: hair.external_id, duration_min: 120, buffer_after_min: 15, price: 25_000_000, deposit: 5_000_000, confirmation_mode: "payment", description: "رنگ کامل ریشه تا سر با مواد ایتالیایی." }, [sara], 1);
  const facial = svc({ title: "پاکسازی پوست", category_id: skin.id, category_external_id: skin.external_id, duration_min: 60, buffer_before_min: 10, price: 12_000_000, confirmation_mode: "auto" }, [room], 2);
  const consult = svc({ title: "مشاوره‌ی آنلاین پوست", category_id: skin.id, category_external_id: skin.external_id, duration_min: 20, price: 2_000_000, confirmation_mode: "auto", location_text: "", online_link: "https://meet.sepordi.ir/skin", require_phone: false }, [], 3);

  // Open days from today, skipping Fridays and the private closure below.
  const closure = plusDays(today, 6);
  const open: string[] = [];
  for (let i = -21; open.length < 60 && i < 60; i++) {
    const d = plusDays(today, i);
    if (weekdayOf(d) !== 5 && d !== closure) open.push(d);
  }
  const dayAt = (offset: number) => {
    const future = open.filter((d) => (offset >= 0 ? d >= today : d < today));
    return offset >= 0 ? future[offset] : future[future.length + offset];
  };

  const convs = t.conversations;
  let seq = 40;
  const year = toJalali(new Date(now)).jy;
  const events = new Map<string, BookingEvent[]>();
  const receipts = new Map<string, BookingReceipt[]>();
  const bookings: Booking[] = [];

  function book(
    service: BookingService,
    resource: BookingResource,
    day: string,
    startMin: number,
    status: string,
    over: Partial<Booking> = {},
  ): Booking {
    const starts = atLocal(day, startMin);
    const created = Math.min(now - 3600_000, starts - 2 * DAY_MS);
    const b: Booking = {
      id: randomUUID(),
      code: `N-${year}-${String(++seq).padStart(4, "0")}`,
      status,
      confirmation_mode: service.confirmation_mode,
      source: "ai",
      channel: "instagram",
      service_id: service.id,
      service_external_id: service.external_id,
      service_title: service.title,
      resource_id: resource.id,
      resource_external_id: resource.external_id,
      starts_at: new Date(starts).toISOString(),
      ends_at: new Date(starts + service.duration_min * 60_000).toISOString(),
      duration_min: service.duration_min,
      conversation_id: null,
      customer_name: "",
      customer_phone: "",
      note: "",
      price: service.price,
      deposit: service.deposit,
      currency: "IRR",
      price_exponent: 0,
      payment_state: service.deposit ? "awaiting" : "none",
      payment_due_at: null,
      payment_confirmed_at: null,
      approval_due_at: null,
      conflict: "",
      cancelled_by: null,
      cancel_reason: "",
      created_at: new Date(created).toISOString(),
      updated_at: new Date(created).toISOString(),
      ...over,
    };
    bookings.push(b);
    const ev: BookingEvent[] = [{ at: b.created_at, event: "created", actor_kind: b.source === "ai" ? "assistant" : "seller", from_status: null, to_status: "held" }];
    ev.push({ at: b.created_at, event: "accept", actor_kind: "customer", from_status: "held", to_status: status === "cancelled" || status === "expired" || status === "completed" || status === "no_show" ? (service.confirmation_mode === "payment" ? "pending_payment" : "confirmed") : status });
    events.set(b.id, ev);
    return b;
  }

  const conv = (i: number) => convs[i % Math.max(1, convs.length)]?.id ?? null;
  const later = (h: number) => new Date(now + h * 3600_000).toISOString();

  book(haircut, sara, dayAt(1), 630, "pending_approval", { customer_name: "مریم احمدی", customer_phone: "09121234567", conversation_id: conv(0), approval_due_at: later(6), note: "مو تا سرشانه است، فقط مرتب شود." });
  book(haircut, negar, dayAt(2), 960, "pending_approval", { customer_name: "زهرا کریمی", customer_phone: "09351112233", channel: "whatsapp", conversation_id: conv(1), approval_due_at: later(10) });
  book(facial, room, dayAt(3), 660, "pending_approval", { customer_name: "الهام نوری", customer_phone: "09129876543", channel: "telegram", confirmation_mode: "seller", conversation_id: conv(2), approval_due_at: later(20) });
  const paid = book(color, sara, dayAt(2), 600, "pending_payment", { customer_name: "سمیرا رحیمی", customer_phone: "09123334455", conversation_id: conv(3), payment_state: "receipt_received", payment_due_at: later(1.5) });
  book(color, sara, dayAt(4), 960, "pending_payment", { customer_name: "فاطمه جعفری", customer_phone: "09367778899", channel: "whatsapp", conversation_id: conv(4), payment_due_at: later(2) });
  book(haircut, sara, dayAt(0), 1020, "confirmed", { customer_name: "نرگس صادقی", customer_phone: "09125556677", conversation_id: conv(5) });
  book(facial, room, dayAt(0), 1080, "confirmed", { customer_name: "لیلا حسینی", customer_phone: "09194445566", source: "partner", channel: null, note: "پوست حساس" });
  book(consult, fallback, dayAt(1), 1140, "confirmed", { customer_name: "پریسا مرادی", customer_phone: "09130001122", channel: "telegram", conversation_id: conv(6) });
  book(haircut, negar, dayAt(3), 780, "confirmed", { customer_name: "آیدا شریفی", customer_phone: "09382223344", conversation_id: conv(7) });
  book(facial, room, dayAt(5), 600, "confirmed", { customer_name: "مهسا کاظمی", customer_phone: "09126667788", source: "panel", channel: null });
  book(haircut, sara, dayAt(-1), 660, "completed", { customer_name: "شیما باقری", customer_phone: "09121110000" });
  book(color, sara, dayAt(-3), 960, "completed", { customer_name: "رویا قاسمی", customer_phone: "09359990011", payment_state: "confirmed", payment_confirmed_at: new Date(now - 5 * DAY_MS).toISOString() });
  book(facial, room, dayAt(-2), 1020, "no_show", { customer_name: "ترانه امیری", customer_phone: "09124443322" });
  book(haircut, negar, dayAt(2), 1080, "cancelled", { customer_name: "نازنین یوسفی", customer_phone: "09367771100", cancelled_by: "customer", cancel_reason: "برنامه‌ام عوض شد" });
  book(facial, room, dayAt(-4), 660, "cancelled", { customer_name: "سحر عباسی", customer_phone: "09121212121", cancelled_by: "seller", cancel_reason: "اتاق در دست تعمیر بود" });
  book(color, sara, dayAt(-5), 600, "expired", { customer_name: "مینا رستمی", customer_phone: "09392223311", payment_state: "awaiting" });

  const mediaId = randomUUID();
  t.media.set(mediaId, { mime: "image/png", bytes: mockPng(240, 360, [226, 232, 240], [99, 102, 241]) });
  receipts.set(paid.id, [{ media_id: mediaId, at: new Date(now - 20 * 60_000).toISOString(), amount: 5_000_000, reference: "۴۸۲۹۱۷" }]);
  events.get(paid.id)!.push({ at: new Date(now - 20 * 60_000).toISOString(), event: "receipt_attached", actor_kind: "customer", from_status: "pending_payment", to_status: "pending_payment" });

  return {
    settings: DEFAULT_SETTINGS(),
    categories: [hair, skin],
    resources: [sara, negar, room, fallback],
    schedules: [defaultSchedule, negarSchedule],
    services: [haircut, color, facial, consult],
    exceptions: [
      { id: randomUUID(), on_date: dayAt(2), kind: "block", start_min: 780, end_min: 840, service_id: null, service_external_id: null, resource_id: sara.id, resource_external_id: sara.external_id, note: "دوره‌ی آموزشی رنگ", created_at: at },
    ],
    overrides: [{ date: closure, kind: "closed", note: "تعطیلی خصوصی سالن" }],
    bookings,
    events,
    receipts,
    seq,
  };
}
