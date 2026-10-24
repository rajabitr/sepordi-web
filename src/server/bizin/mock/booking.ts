import "server-only";

import { randomUUID } from "node:crypto";

import { toJalali } from "@/lib/jalali";
import { iranOccasions } from "@/lib/iran-holidays";

import type {
  Booking,
  BookingDay,
  BookingInterval,
  BookingResource,
  BookingSchedule,
  BookingService,
  BookingSettings,
  BookingSlot,
} from "../booking/types";
import type { TransportRequest } from "../transport";
import { atLocal, localDay, plusDays, seedBooking, weekdayOf } from "./booking-fixtures";
import { fail, iso, noContent, obj, ok, page, tenant, type Ctx, type Handler } from "./http";
import type { MockBookingState } from "./state";

/*
 * Routes 1–35 of the booking contract (docs/handover/2026-10-24-partner-booking-api.md) over an in-memory appointment
 * book. The engine is a small honest copy of Bizin's: weekly hours ∩ the resource's own hours, minus exceptions,
 * holidays, day overrides and taken lanes. Bizin's answer wins wherever the two differ.
 */

const ACTIVE = new Set(["pending_approval", "pending_payment", "confirmed"]);
const MAX_DAYS = 62;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function book(c: Ctx): MockBookingState {
  const t = tenant(c);
  t.booking ??= seedBooking(t, c.now);
  return t.booking;
}

// ---- body checks --------------------------------------------------------------------------------------------

function strict(c: Ctx, allowed: readonly string[]): Record<string, unknown> {
  const b = obj(c);
  for (const k of Object.keys(b)) if (!allowed.includes(k)) fail(400, "bad_request_body", k);
  return b;
}

const invalid = (field: string, params?: Record<string, unknown>): never => fail(422, "invalid_value", field, params);

function str(b: Record<string, unknown>, k: string, max: number, required = false): string | undefined {
  const v = b[k];
  if (v === undefined || v === null) return required ? invalid(k) : undefined;
  if (typeof v !== "string") return invalid(k);
  const s = v.trim();
  if ((required && !s) || s.length > max) invalid(k);
  return s;
}

function int(b: Record<string, unknown>, k: string, min: number, max: number, required = false): number | undefined {
  const v = b[k];
  if (v === undefined || v === null) return required ? invalid(k) : undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) return invalid(k, { min, max });
  return v;
}

function bool(b: Record<string, unknown>, k: string, required = false): boolean | undefined {
  const v = b[k];
  if (v === undefined) return required ? invalid(k) : undefined;
  if (typeof v !== "boolean") return invalid(k);
  return v;
}

function oneOf<T extends string>(b: Record<string, unknown>, k: string, allowed: readonly T[], required = false): T | undefined {
  const v = b[k];
  if (v === undefined || v === null) return required ? invalid(k, { allowed }) : undefined;
  if (typeof v !== "string" || !allowed.includes(v as T)) return invalid(k, { allowed });
  return v as T;
}

function range(c: Ctx): { from: string; to: string } {
  const from = c.query.get("from") ?? "";
  const to = c.query.get("to") ?? "";
  if (!DATE_RE.test(from)) fail(400, "invalid_value", "from");
  if (!DATE_RE.test(to) || to < from) fail(400, "invalid_value", "to");
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_DAYS - 1) fail(400, "invalid_value", "to", { max_days: MAX_DAYS });
  return { from, to };
}

function days(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = plusDays(d, 1)) out.push(d);
  return out;
}

// ---- references ---------------------------------------------------------------------------------------------

type Row = { id: string; external_id: string | null };

/** Either `<x>_id` or `<x>_external_id`, never both (§3.0). */
function ref<T extends Row>(rows: T[], src: { get(k: string): unknown }, name: string, notFound: string): T | undefined {
  const id = src.get(`${name}_id`);
  const ext = src.get(`${name}_external_id`);
  if (id != null && ext != null) invalid(`${name}_external_id`);
  if (id != null) return rows.find((r) => r.id === id) ?? fail(404, notFound);
  if (ext != null) return rows.find((r) => r.external_id === ext) ?? fail(404, notFound);
  return undefined;
}

const fromBody = (b: Record<string, unknown>) => ({ get: (k: string) => b[k] });
const fromQuery = (c: Ctx) => ({ get: (k: string) => c.query.get(k) });

const byExt = <T extends Row>(rows: T[], ext: string) => rows.find((r) => r.external_id === ext);

function scheduleRef(s: MockBookingState, b: Record<string, unknown>): BookingSchedule | null {
  return ref(s.schedules, fromBody(b), "schedule", "schedule_not_found") ?? null;
}

// ---- intervals and the engine -------------------------------------------------------------------------------

function checkIntervals(v: unknown): BookingInterval[] {
  if (!Array.isArray(v)) return invalid("intervals");
  if (v.length > 98) invalid("intervals", { max: 98 });
  const out = v.map((raw, i) => {
    if (!raw || typeof raw !== "object") return invalid(`intervals[${i}]`);
    const r = raw as Record<string, unknown>;
    for (const k of Object.keys(r)) if (!["weekday", "start_min", "end_min"].includes(k)) fail(400, "bad_request_body", k);
    const weekday = int(r, "weekday", 0, 6, true) ?? 0;
    const start = r.start_min;
    const end = r.end_min;
    if (typeof start !== "number" || !Number.isInteger(start) || start < 0 || start > 1439) invalid(`intervals[${i}].start_min`);
    if (typeof end !== "number" || !Number.isInteger(end) || end < 1 || end > 2880 || end <= (start as number) || end - (start as number) > 1440) invalid(`intervals[${i}].end_min`);
    return { weekday, start_min: start as number, end_min: end as number };
  });
  out.forEach((a, i) => {
    out.forEach((b, j) => {
      if (j < i && a.weekday === b.weekday && a.start_min < b.end_min && b.start_min < a.end_min) invalid(`intervals[${i}]`);
    });
  });
  return out;
}

type Span = [number, number];

function intersect(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  for (const [s1, e1] of a) for (const [s2, e2] of b) if (Math.max(s1, s2) < Math.min(e1, e2)) out.push([Math.max(s1, s2), Math.min(e1, e2)]);
  return out.sort((x, y) => x[0] - y[0]);
}

function subtract(a: Span[], [bs, be]: Span): Span[] {
  return a.flatMap(([s, e]): Span[] => (be <= s || bs >= e ? [[s, e]] : [...(bs > s ? [[s, bs] as Span] : []), ...(be < e ? [[be, e] as Span] : [])]));
}

const defaultSchedule = (s: MockBookingState) => s.schedules.find((x) => x.is_default)!;
const spansOn = (sch: BookingSchedule, day: string): Span[] =>
  sch.intervals.filter((iv) => iv.weekday === weekdayOf(day)).map((iv) => [iv.start_min, iv.end_min]);

function holidayOn(day: string): string | null {
  const [y, m, d] = day.split("-").map(Number);
  const h = iranOccasions(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`).find((o) => o.holiday);
  return h ? h.title : null;
}

type Closed = "closed_holiday" | "closed_by_seller" | "no_schedule" | "blocked";

/** The local minutes a (service, resource) pair is open on a day, or why it is not. */
function windows(s: MockBookingState, svc: BookingService, res: BookingResource, day: string): { spans: Span[]; reason?: Closed } {
  const override = s.overrides.find((o) => o.date === day);
  if (override?.kind === "closed") return { spans: [], reason: "closed_by_seller" };
  if (override?.kind !== "open" && s.settings.holidays_close_booking && holidayOn(day)) return { spans: [], reason: "closed_holiday" };
  const svcSch = s.schedules.find((x) => x.id === svc.schedule_id) ?? defaultSchedule(s);
  const resSch = s.schedules.find((x) => x.id === res.schedule_id) ?? defaultSchedule(s);
  let spans = intersect(spansOn(svcSch, day), spansOn(resSch, day));
  const mine = s.exceptions.filter(
    (x) => x.on_date === day && (x.service_id === null || x.service_id === svc.id) && (x.resource_id === null || x.resource_id === res.id),
  );
  if (mine.some((x) => x.kind === "closed")) return { spans: [], reason: "closed_by_seller" };
  for (const x of mine.filter((x) => x.kind === "hours")) spans = [[x.start_min!, x.end_min!]];
  if (spans.length === 0) return { spans, reason: "no_schedule" };
  for (const x of mine.filter((x) => x.kind === "block")) spans = subtract(spans, [x.start_min!, x.end_min!]);
  return spans.length ? { spans } : { spans, reason: "blocked" };
}

function laneFree(s: MockBookingState, svc: BookingService, res: BookingResource, start: number, end: number, except?: string): boolean {
  const before = svc.buffer_before_min * 60_000;
  const after = svc.buffer_after_min * 60_000;
  const taken = s.bookings.filter(
    (b) => b.id !== except && b.resource_id === res.id && ACTIVE.has(b.status) && Date.parse(b.starts_at) < end + after && start - before < Date.parse(b.ends_at),
  );
  return taken.length < res.capacity;
}

const resourcesOf = (s: MockBookingState, svc: BookingService): BookingResource[] => {
  const linked = svc.resource_ids.map((id) => s.resources.find((r) => r.id === id)).filter((r): r is BookingResource => Boolean(r && !r.archived_at));
  return linked.length ? linked : s.resources.filter((r) => r.is_default);
};

function rulesOf(s: MockBookingState, svc: BookingService) {
  return {
    horizon: svc.horizon_days ?? s.settings.horizon_days,
    notice: svc.min_notice_min ?? s.settings.min_notice_min,
    step: svc.slot_step_min ?? s.settings.slot_step_min,
  };
}

function computeSlots(s: MockBookingState, svc: BookingService, list: string[], only: BookingResource | undefined, now: number, except?: string) {
  const rules = rulesOf(s, svc);
  const today = localDay(now);
  const horizonEnd = plusDays(today, rules.horizon);
  const slots: BookingSlot[] = [];
  const summary: { date: string; slots: number; reason: string | null }[] = [];
  for (const day of list) {
    let count = 0;
    let reason: string | null = null;
    if (day < today) reason = "in_the_past";
    else if (day > horizonEnd) reason = "outside_horizon";
    else {
      let sawWindow = false;
      let sawNotice = false;
      let lastClosed: string | null = null;
      for (const res of only ? [only] : resourcesOf(s, svc)) {
        const w = windows(s, svc, res, day);
        if (w.reason) lastClosed = w.reason;
        for (const [ws, we] of w.spans) {
          if (we - ws < svc.duration_min) continue;
          sawWindow = true;
          for (let m = ws; m + svc.duration_min <= we; m += rules.step) {
            const start = atLocal(day, m);
            const end = start + svc.duration_min * 60_000;
            if (start < now + rules.notice * 60_000) {
              sawNotice = true;
              continue;
            }
            if (!laneFree(s, svc, res, start, end, except)) continue;
            count++;
            slots.push({
              starts_at: iso(start),
              ends_at: iso(end),
              resource_id: res.id,
              resource_external_id: res.external_id,
              local_date: day,
              local_start_min: m,
              local_end_date: m + svc.duration_min > 1440 ? plusDays(day, 1) : day,
              local_end_min: (m + svc.duration_min) % 1440 || 1440,
            });
          }
        }
      }
      if (count === 0) reason = lastClosed && !sawWindow ? lastClosed : sawNotice ? "before_min_notice" : sawWindow ? "fully_booked" : (lastClosed ?? "duration_does_not_fit");
    }
    summary.push({ date: day, slots: count, reason: count ? null : reason });
  }
  slots.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return { slots, summary, horizonEnd };
}

/** Bizin recomputes `conflict` after every config write (P6); so does the mock, for active future bookings. */
function recompute(s: MockBookingState, now: number) {
  for (const b of s.bookings) {
    if (!ACTIVE.has(b.status) || Date.parse(b.starts_at) < now) continue;
    const res = s.resources.find((r) => r.id === b.resource_id);
    const svc = s.services.find((x) => x.id === b.service_id);
    if (!res || !svc) continue;
    if (res.archived_at) {
      b.conflict = "resource_archived";
      continue;
    }
    const day = localDay(Date.parse(b.starts_at));
    const w = windows(s, svc, res, day);
    const sm = Math.round((Date.parse(b.starts_at) - atLocal(day, 0)) / 60_000);
    const fits = w.spans.some(([ws, we]) => ws <= sm && sm + b.duration_min <= we);
    b.conflict = fits ? "" : w.reason === "closed_holiday" || w.reason === "closed_by_seller" ? "holiday_changed" : w.reason === "blocked" ? "blocked" : "outside_hours";
  }
}

// ---- bookings -----------------------------------------------------------------------------------------------

const findBooking = (s: MockBookingState, id: string) => s.bookings.find((b) => b.id === id) ?? fail(404, "booking_not_found");

function moved(s: MockBookingState, b: Booking, c: Ctx, event: string, to: string, extra: Partial<Booking> = {}) {
  const from = b.status;
  Object.assign(b, extra, { status: to, updated_at: iso(c.now) });
  const list = s.events.get(b.id) ?? [];
  list.push({ at: iso(c.now), event, actor_kind: "seller", from_status: from, to_status: to });
  s.events.set(b.id, list);
}

function wrongState(b: Booking, action: string): never {
  return fail(409, "booking_wrong_state", undefined, { status: b.status, action });
}

function placeAt(s: MockBookingState, c: Ctx, svc: BookingService, startsAt: unknown, res: BookingResource | undefined, force: boolean, except?: string): { start: number; res: BookingResource } {
  if (typeof startsAt !== "string" || Number.isNaN(Date.parse(startsAt))) invalid("starts_at");
  const start = Date.parse(startsAt as string);
  const end = start + svc.duration_min * 60_000;
  const candidates = res ? [res] : resourcesOf(s, svc);
  if (!force) {
    const day = localDay(start);
    const { slots } = computeSlots(s, svc, [day], res, c.now, except);
    const hit = slots.find((x) => Date.parse(x.starts_at) === start);
    if (!hit) {
      const free = candidates.some((r) => laneFree(s, svc, r, start, end, except));
      return free ? fail(422, "slot_not_available", "starts_at", { reason: "outside_hours" }) : fail(409, "slot_taken");
    }
    return { start, res: s.resources.find((r) => r.id === hit.resource_id)! };
  }
  const lane = candidates.find((r) => laneFree(s, svc, r, start, end, except));
  return lane ? { start, res: lane } : fail(409, "slot_taken");
}

const detail = (s: MockBookingState, b: Booking) => ({ ...b, events: s.events.get(b.id) ?? [], receipts: s.receipts.get(b.id) ?? [] });

// ---- settings -----------------------------------------------------------------------------------------------

const SETTINGS_PUT = [
  "assistant_enabled", "holidays_close_booking", "horizon_days", "min_notice_min", "slot_step_min", "max_per_day",
  "max_active_per_customer", "cancel_cutoff_min", "hold_ttl_min", "payment_window_min", "payment_instructions",
  "when_full", "offers_per_reply", "no_show_after_min", "reminder_offsets_min", "notify_sms",
] as const;

function putSettings(c: Ctx) {
  const s = book(c);
  const b = strict(c, SETTINGS_PUT);
  const next: BookingSettings = { ...s.settings };
  next.assistant_enabled = bool(b, "assistant_enabled", true)!;
  next.holidays_close_booking = bool(b, "holidays_close_booking") ?? next.holidays_close_booking;
  next.horizon_days = int(b, "horizon_days", 1, 365) ?? next.horizon_days;
  next.min_notice_min = int(b, "min_notice_min", 0, 43200) ?? next.min_notice_min;
  if (b.slot_step_min !== undefined && ![5, 10, 15, 20, 30, 60].includes(b.slot_step_min as number)) invalid("slot_step_min", { allowed: [5, 10, 15, 20, 30, 60] });
  next.slot_step_min = (b.slot_step_min as number | undefined) ?? next.slot_step_min;
  if ("max_per_day" in b) next.max_per_day = b.max_per_day === null ? null : int(b, "max_per_day", 1, 1000)!;
  next.max_active_per_customer = int(b, "max_active_per_customer", 1, 20) ?? next.max_active_per_customer;
  next.cancel_cutoff_min = int(b, "cancel_cutoff_min", 0, 10080) ?? next.cancel_cutoff_min;
  next.hold_ttl_min = int(b, "hold_ttl_min", 3, 60) ?? next.hold_ttl_min;
  next.payment_window_min = int(b, "payment_window_min", 15, 1440) ?? next.payment_window_min;
  next.payment_instructions = str(b, "payment_instructions", 2000) ?? next.payment_instructions;
  next.when_full = oneOf(b, "when_full", ["tell", "handoff"] as const) ?? next.when_full;
  next.offers_per_reply = int(b, "offers_per_reply", 3, 9) ?? next.offers_per_reply;
  next.no_show_after_min = int(b, "no_show_after_min", 0, 720) ?? next.no_show_after_min;
  next.notify_sms = bool(b, "notify_sms") ?? next.notify_sms;
  if (b.reminder_offsets_min !== undefined) {
    const r = b.reminder_offsets_min;
    if (!Array.isArray(r) || r.length > 2 || r.some((x) => typeof x !== "number" || !Number.isInteger(x) || x < 5 || x > 10080)) invalid("reminder_offsets_min");
    next.reminder_offsets_min = r as number[];
  }
  if (next.min_notice_min > next.horizon_days * 1440) invalid("min_notice_min");
  next.config_version = s.settings.config_version + 1;
  next.updated_at = iso(c.now);
  s.settings = next;
  recompute(s, c.now);
  return ok(next);
}

// ---- services -----------------------------------------------------------------------------------------------

const SERVICE_PUT = [
  "category_id", "category_external_id", "title", "description", "duration_min", "buffer_before_min", "buffer_after_min",
  "price", "deposit", "confirmation_mode", "location_text", "online_link", "require_phone", "offer_in_chat", "channels",
  "schedule_id", "schedule_external_id", "horizon_days", "min_notice_min", "slot_step_min", "max_per_day",
  "max_active_per_customer", "cancel_cutoff_min", "resource_ids", "resource_external_ids", "active", "position",
] as const;

function nullableInt(b: Record<string, unknown>, k: string, min: number, max: number): number | null {
  return b[k] === null || b[k] === undefined ? null : int(b, k, min, max)!;
}

function putService(c: Ctx) {
  const s = book(c);
  const ext = c.params[1];
  const b = strict(c, SERVICE_PUT);
  const category = ref(s.categories, fromBody(b), "category", "category_not_found") ?? invalid("category_id");
  const schedule = scheduleRef(s, b);
  if (b.resource_ids !== undefined && b.resource_external_ids !== undefined) invalid("resource_external_ids");
  const ids = (b.resource_ids ?? []) as unknown[];
  const exts = (b.resource_external_ids ?? []) as unknown[];
  if (!Array.isArray(ids) || !Array.isArray(exts)) invalid("resource_ids");
  const resources = [
    ...ids.map((id) => s.resources.find((r) => r.id === id) ?? fail(404, "resource_not_found")),
    ...exts.map((e) => s.resources.find((r) => r.external_id === e) ?? fail(404, "resource_not_found")),
  ];
  const price = nullableInt(b, "price", 0, Number.MAX_SAFE_INTEGER);
  const deposit = nullableInt(b, "deposit", 0, Number.MAX_SAFE_INTEGER);
  const mode = oneOf(b, "confirmation_mode", ["auto", "seller", "payment"] as const) ?? "seller";
  if (mode === "payment" && !(deposit && deposit > 0)) invalid("deposit");
  if (b.slot_step_min != null && ![5, 10, 15, 20, 30, 60].includes(b.slot_step_min as number)) invalid("slot_step_min", { allowed: [5, 10, 15, 20, 30, 60] });
  let channels = ["instagram", "telegram", "whatsapp"];
  if (b.channels !== undefined) {
    const ch = b.channels;
    if (!Array.isArray(ch) || new Set(ch).size !== ch.length || ch.some((x) => !channels.includes(x as string))) invalid("channels", { allowed: channels });
    channels = ch as string[];
  }
  const prev = byExt(s.services, ext);
  const at = iso(c.now);
  const row: BookingService = {
    id: prev?.id ?? randomUUID(),
    external_id: ext,
    category_id: category.id,
    category_external_id: category.external_id,
    title: str(b, "title", 80, true)!,
    description: str(b, "description", 2000) ?? "",
    duration_min: int(b, "duration_min", 5, 720, true)!,
    buffer_before_min: int(b, "buffer_before_min", 0, 240) ?? 0,
    buffer_after_min: int(b, "buffer_after_min", 0, 240) ?? 0,
    price,
    deposit,
    currency: "IRR",
    price_exponent: 0,
    confirmation_mode: mode,
    location_text: str(b, "location_text", 500) ?? "",
    online_link: str(b, "online_link", 500) ?? "",
    require_phone: bool(b, "require_phone") ?? false,
    offer_in_chat: bool(b, "offer_in_chat") ?? true,
    channels,
    schedule_id: schedule?.id ?? null,
    schedule_external_id: schedule?.external_id ?? null,
    horizon_days: nullableInt(b, "horizon_days", 1, 365),
    min_notice_min: nullableInt(b, "min_notice_min", 0, 43200),
    slot_step_min: (b.slot_step_min as number | null | undefined) ?? null,
    max_per_day: nullableInt(b, "max_per_day", 1, 1000),
    max_active_per_customer: nullableInt(b, "max_active_per_customer", 1, 20),
    cancel_cutoff_min: nullableInt(b, "cancel_cutoff_min", 0, 10080),
    resource_ids: resources.map((r) => r.id),
    resource_external_ids: resources.map((r) => r.external_id),
    active: bool(b, "active", true)!,
    position: int(b, "position", -1_000_000, 1_000_000) ?? 0,
    archived_at: null,
    created_at: prev?.created_at ?? at,
    updated_at: at,
  };
  if (prev) Object.assign(prev, row);
  else s.services.push(row);
  recompute(s, c.now);
  return ok({ ...row, created: !prev }, prev ? 200 : 201);
}

const ordered = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position);

// ---- routes -------------------------------------------------------------------------------------------------

const P = (rest: string) => new RegExp(`^\\/tenants\\/([^/]+)\\/booking${rest}$`);
type Route = [TransportRequest["method"], RegExp, Handler];

export const bookingRoutes: Route[] = [
  // 1–2 settings
  ["GET", P("\\/settings"), (c) => ok(book(c).settings)],
  ["PUT", P("\\/settings"), putSettings],

  // 3–5 categories
  ["GET", P("\\/categories"), (c) => {
    const p = page(c, ordered(book(c).categories));
    return ok({ categories: p.items, next_cursor: p.next_cursor });
  }],
  ["PUT", P("\\/categories\\/([^/]+)"), (c) => {
    const s = book(c);
    const b = strict(c, ["title", "kind", "color", "position"]);
    const prev = byExt(s.categories, c.params[1]);
    const row = {
      id: prev?.id ?? randomUUID(),
      external_id: c.params[1],
      title: str(b, "title", 60, true)!,
      kind: oneOf(b, "kind", ["in_person", "online", "phone", "on_site", "other"] as const, true)!,
      color: oneOf(b, "color", ["teal", "blue", "violet", "amber", "rose", "slate", "green", "orange"] as const) ?? "teal",
      position: int(b, "position", -1_000_000, 1_000_000) ?? 0,
      archived_at: null,
    };
    if (prev) Object.assign(prev, row);
    else s.categories.push(row);
    return ok({ ...row, created: !prev }, prev ? 200 : 201);
  }],
  ["DELETE", P("\\/categories\\/([^/]+)"), (c) => {
    const s = book(c);
    const row = byExt(s.categories, c.params[1]) ?? fail(404, "category_not_found");
    if (s.services.some((x) => x.category_id === row.id && !x.archived_at)) fail(409, "booking_row_in_use");
    row.archived_at ??= iso(c.now);
    return noContent();
  }],

  // 6–8 resources
  ["GET", P("\\/resources"), (c) => {
    const p = page(c, ordered(book(c).resources));
    return ok({ resources: p.items, next_cursor: p.next_cursor });
  }],
  ["PUT", P("\\/resources\\/([^/]+)"), (c) => {
    const s = book(c);
    const b = strict(c, ["title", "kind", "capacity", "schedule_id", "schedule_external_id", "position"]);
    const schedule = scheduleRef(s, b);
    const prev = byExt(s.resources, c.params[1]);
    const row: BookingResource = {
      id: prev?.id ?? randomUUID(),
      external_id: c.params[1],
      title: str(b, "title", 60, true)!,
      kind: oneOf(b, "kind", ["person", "room", "equipment", "line"] as const) ?? "person",
      capacity: int(b, "capacity", 1, 50, true)!,
      schedule_id: schedule?.id ?? null,
      schedule_external_id: schedule?.external_id ?? null,
      is_default: false,
      position: int(b, "position", -1_000_000, 1_000_000) ?? 0,
      archived_at: null,
    };
    if (prev) Object.assign(prev, row);
    else s.resources.push(row);
    recompute(s, c.now);
    return ok({ ...row, created: !prev }, prev ? 200 : 201);
  }],
  ["DELETE", P("\\/resources\\/([^/]+)"), (c) => {
    const s = book(c);
    const row = byExt(s.resources, c.params[1]) ?? fail(404, "resource_not_found");
    row.archived_at ??= iso(c.now);
    recompute(s, c.now);
    return noContent();
  }],

  // 9–12 hours and schedules
  ["GET", P("\\/hours"), (c) => {
    const d = defaultSchedule(book(c));
    return ok({ schedule_id: d.id, intervals: d.intervals });
  }],
  ["PUT", P("\\/hours"), (c) => {
    const s = book(c);
    const b = strict(c, ["intervals"]);
    const d = defaultSchedule(s);
    d.intervals = checkIntervals(b.intervals);
    recompute(s, c.now);
    return ok({ schedule_id: d.id, intervals: d.intervals });
  }],
  ["GET", P("\\/schedules"), (c) => {
    const p = page(c, book(c).schedules);
    return ok({ schedules: p.items, next_cursor: p.next_cursor });
  }],
  ["PUT", P("\\/schedules\\/([^/]+)"), (c) => {
    const s = book(c);
    const b = strict(c, ["title", "intervals"]);
    const title = str(b, "title", 60, true)!;
    const intervals = checkIntervals(b.intervals);
    const prev = byExt(s.schedules, c.params[1]);
    const row: BookingSchedule = { id: prev?.id ?? randomUUID(), external_id: c.params[1], title, is_default: false, intervals };
    if (prev) Object.assign(prev, row);
    else s.schedules.push(row);
    recompute(s, c.now);
    return ok({ ...row, created: !prev }, prev ? 200 : 201);
  }],

  // 13–16 services
  ["GET", P("\\/services"), (c) => {
    const p = page(c, ordered(book(c).services));
    return ok({ services: p.items, next_cursor: p.next_cursor });
  }],
  ["GET", P("\\/services\\/([^/]+)"), (c) => ok(byExt(book(c).services, c.params[1]) ?? fail(404, "service_not_found"))],
  ["PUT", P("\\/services\\/([^/]+)"), putService],
  ["DELETE", P("\\/services\\/([^/]+)"), (c) => {
    const row = byExt(book(c).services, c.params[1]) ?? fail(404, "service_not_found");
    row.archived_at ??= iso(c.now);
    return noContent();
  }],

  // 17–19 exceptions
  ["GET", P("\\/exceptions"), (c) => {
    const { from, to } = range(c);
    const list = book(c).exceptions.filter((x) => x.on_date >= from && x.on_date <= to).sort((a, b) => a.on_date.localeCompare(b.on_date));
    return ok({ from, to, exceptions: list });
  }],
  ["POST", P("\\/exceptions"), (c) => {
    const s = book(c);
    const b = strict(c, ["on_date", "kind", "start_min", "end_min", "service_id", "service_external_id", "resource_id", "resource_external_id", "note"]);
    const onDate = b.on_date;
    if (typeof onDate !== "string" || !DATE_RE.test(onDate)) invalid("on_date");
    const kind = oneOf(b, "kind", ["closed", "open", "hours", "block"] as const, true)!;
    const svc = ref(s.services, fromBody(b), "service", "service_not_found");
    const res = ref(s.resources, fromBody(b), "resource", "resource_not_found");
    if (svc && res) invalid("resource_id");
    if (!svc && !res && (kind === "closed" || kind === "open")) invalid("kind");
    const timed = kind === "hours" || kind === "block";
    if (!timed && (b.start_min !== undefined || b.end_min !== undefined)) invalid("start_min");
    const start = timed ? int(b, "start_min", 0, 1439, true)! : null;
    const end = timed ? int(b, "end_min", 1, 2880, true)! : null;
    if (timed && (end! <= start! || end! - start! > 1440)) invalid("end_min");
    const row = {
      id: randomUUID(),
      on_date: onDate as string,
      kind,
      start_min: start,
      end_min: end,
      service_id: svc?.id ?? null,
      service_external_id: svc?.external_id ?? null,
      resource_id: res?.id ?? null,
      resource_external_id: res?.external_id ?? null,
      note: str(b, "note", 200) ?? "",
      created_at: iso(c.now),
    };
    s.exceptions.push(row);
    recompute(s, c.now);
    return ok(row, 201);
  }],
  ["DELETE", P("\\/exceptions\\/([^/]+)"), (c) => {
    const s = book(c);
    const i = s.exceptions.findIndex((x) => x.id === c.params[1]);
    if (i < 0) fail(404, "exception_not_found");
    s.exceptions.splice(i, 1);
    recompute(s, c.now);
    return noContent();
  }],

  // 20–22 days and day overrides
  ["GET", P("\\/days"), (c) => {
    const s = book(c);
    const { from, to } = range(c);
    const list: BookingDay[] = days(from, to).map((date) => {
      const override = s.overrides.find((o) => o.date === date);
      const holiday = holidayOn(date);
      const weekend = weekdayOf(date) === 5;
      const reasons: BookingDay["reasons"] = [];
      if (override) reasons.push({ code: override.kind === "open" ? "override_open" : "override_closed", note: override.note });
      if (holiday) reasons.push({ code: "holiday", kind: "official", title_fa: holiday, title_en: "", tentative: false });
      if (weekend) reasons.push({ code: "weekend" });
      const closed = override ? override.kind === "closed" : Boolean(holiday) || weekend;
      return { date, status: closed ? "closed" : "open", closes_at_min: null, weekend, reasons };
    });
    return ok({ from, to, timezone: s.settings.timezone, days: list, overrides: s.overrides.filter((o) => o.date >= from && o.date <= to) });
  }],
  ["PUT", P("\\/day-overrides\\/([^/]+)"), (c) => {
    const s = book(c);
    const date = c.params[1];
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) fail(400, "invalid_value", "date");
    const b = strict(c, ["kind", "note"]);
    const row = { date, kind: oneOf(b, "kind", ["open", "closed"] as const, true)!, note: str(b, "note", 200) ?? "" };
    s.overrides = [...s.overrides.filter((o) => o.date !== date), row].sort((a, b2) => a.date.localeCompare(b2.date));
    recompute(s, c.now);
    return ok(row);
  }],
  ["DELETE", P("\\/day-overrides\\/([^/]+)"), (c) => {
    const s = book(c);
    if (!DATE_RE.test(c.params[1])) fail(400, "invalid_value", "date");
    s.overrides = s.overrides.filter((o) => o.date !== c.params[1]);
    recompute(s, c.now);
    return noContent();
  }],

  // 23 slots
  ["GET", P("\\/slots"), (c) => {
    const s = book(c);
    const svc = ref(s.services, fromQuery(c), "service", "service_not_found") ?? fail(400, "invalid_value", "service_id");
    const res = ref(s.resources, fromQuery(c), "resource", "resource_not_found");
    const { from, to } = range(c);
    const limit = c.query.has("limit") ? Number(c.query.get("limit")) : 500;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) fail(400, "limit_invalid", undefined, { max: 500 });
    const r = computeSlots(s, svc, days(from, to), res, c.now);
    return ok({
      service_id: svc.id,
      service_external_id: svc.external_id,
      timezone: s.settings.timezone,
      from,
      to,
      horizon_end: r.horizonEnd,
      slots: r.slots.slice(0, limit),
      days: r.summary,
    });
  }],

  // 24–26 bookings
  ["GET", P("\\/bookings"), (c) => {
    const s = book(c);
    const q = c.query;
    const instant = (k: string) => {
      const v = q.get(k);
      if (v === null) return undefined;
      const t = Date.parse(v);
      return Number.isNaN(t) ? fail(400, "invalid_value", k) : t;
    };
    const from = instant("from");
    const to = instant("to");
    const since = instant("since");
    if (from !== undefined && to !== undefined && to < from) fail(400, "invalid_value", "to");
    const statuses = q.getAll("status");
    const svc = q.get("service_id") ?? (q.get("service_external_id") ? (byExt(s.services, q.get("service_external_id")!)?.id ?? "none") : null);
    const res = q.get("resource_id") ?? (q.get("resource_external_id") ? (byExt(s.resources, q.get("resource_external_id")!)?.id ?? "none") : null);
    const conflict = q.get("has_conflict");
    const sort = q.get("sort") ?? "starts_at";
    if (sort !== "starts_at" && sort !== "-created_at") fail(400, "invalid_value", "sort", { allowed: ["starts_at", "-created_at"] });
    const rows = s.bookings
      .filter((b) => from === undefined || Date.parse(b.starts_at) >= from)
      .filter((b) => to === undefined || Date.parse(b.starts_at) < to)
      .filter((b) => since === undefined || Date.parse(b.created_at) >= since)
      .filter((b) => statuses.length === 0 || statuses.includes(b.status))
      .filter((b) => !q.get("payment_state") || b.payment_state === q.get("payment_state"))
      .filter((b) => !svc || b.service_id === svc)
      .filter((b) => !res || b.resource_id === res)
      .filter((b) => !q.get("conversation_id") || b.conversation_id === q.get("conversation_id"))
      .filter((b) => conflict === null || (conflict === "true") === Boolean(b.conflict))
      .sort((a, b) => (sort === "starts_at" ? a.starts_at.localeCompare(b.starts_at) : b.created_at.localeCompare(a.created_at)));
    const p = page(c, rows);
    return ok({ bookings: p.items, next_cursor: p.next_cursor });
  }],
  ["GET", P("\\/bookings\\/([^/]+)"), (c) => {
    const s = book(c);
    return ok(detail(s, findBooking(s, c.params[1])));
  }],
  ["POST", P("\\/bookings"), (c) => {
    const s = book(c);
    const b = strict(c, ["service_id", "service_external_id", "resource_id", "resource_external_id", "starts_at", "customer_name", "customer_phone", "note", "status", "force"]);
    const svc = ref(s.services, fromBody(b), "service", "service_not_found") ?? invalid("service_id");
    const wanted = ref(s.resources, fromBody(b), "resource", "resource_not_found");
    const status = oneOf(b, "status", ["confirmed", "pending_payment"] as const) ?? "confirmed";
    if (status === "pending_payment" && !(svc.deposit && svc.deposit > 0)) fail(422, "no_deposit_for_service", "status");
    const placed = placeAt(s, c, svc, b.starts_at, wanted, bool(b, "force") ?? false);
    const at = iso(c.now);
    const row: Booking = {
      id: randomUUID(),
      code: `N-${toJalali(new Date(c.now)).jy}-${String(++s.seq).padStart(4, "0")}`,
      status,
      confirmation_mode: status === "pending_payment" ? "payment" : "auto",
      source: "partner",
      channel: null,
      service_id: svc.id,
      service_external_id: svc.external_id,
      service_title: svc.title,
      resource_id: placed.res.id,
      resource_external_id: placed.res.external_id,
      starts_at: iso(placed.start),
      ends_at: iso(placed.start + svc.duration_min * 60_000),
      duration_min: svc.duration_min,
      conversation_id: null,
      customer_name: str(b, "customer_name", 120) ?? "",
      customer_phone: str(b, "customer_phone", 32) ?? "",
      note: str(b, "note", 2000) ?? "",
      price: svc.price,
      deposit: svc.deposit,
      currency: "IRR",
      price_exponent: 0,
      payment_state: status === "pending_payment" ? "awaiting" : "none",
      payment_due_at: status === "pending_payment" ? iso(c.now + s.settings.payment_window_min * 60_000) : null,
      payment_confirmed_at: null,
      approval_due_at: null,
      conflict: "",
      cancelled_by: null,
      cancel_reason: "",
      created_at: at,
      updated_at: at,
    };
    s.bookings.push(row);
    s.events.set(row.id, [
      { at, event: "created", actor_kind: "seller", from_status: null, to_status: "held" },
      { at, event: "accept", actor_kind: "seller", from_status: "held", to_status: status },
    ]);
    return ok(row, 201);
  }],

  // 27–34 actions
  ["POST", P("\\/bookings\\/([^/]+)\\/(approve|reject|cancel|complete|no-show|confirm-payment|reject-payment)"), (c) => {
    const s = book(c);
    const b = findBooking(s, c.params[1]);
    const action = c.params[2];
    const body = strict(c, action === "reject" || action === "cancel" || action === "reject-payment" ? ["reason"] : []);
    const reason = str(body, "reason", 500) ?? "";
    switch (action) {
      case "approve":
        if (b.status !== "pending_approval") wrongState(b, action);
        moved(s, b, c, "approve", "confirmed", { approval_due_at: null });
        break;
      case "reject":
        if (b.status !== "pending_approval") wrongState(b, action);
        moved(s, b, c, "reject", "cancelled", { cancelled_by: "seller", cancel_reason: reason });
        break;
      case "cancel":
        if (!ACTIVE.has(b.status)) wrongState(b, action);
        if (b.status === "confirmed" && !reason) fail(422, "cancel_reason_required", "reason");
        moved(s, b, c, "cancel", "cancelled", { cancelled_by: "seller", cancel_reason: reason, payment_state: b.payment_state === "confirmed" ? "refund_due" : b.payment_state });
        break;
      case "complete":
        if (b.status !== "confirmed") wrongState(b, action);
        moved(s, b, c, "complete", "completed");
        break;
      case "no-show": {
        if (b.status !== "confirmed") wrongState(b, action);
        const notBefore = Date.parse(b.starts_at) + s.settings.no_show_after_min * 60_000;
        if (c.now < notBefore) fail(422, "no_show_too_early", undefined, { not_before: iso(notBefore) });
        moved(s, b, c, "no_show", "no_show");
        break;
      }
      case "confirm-payment":
        if (b.status !== "pending_payment") wrongState(b, action);
        moved(s, b, c, "confirm_payment", "confirmed", { payment_state: "confirmed", payment_confirmed_at: iso(c.now) });
        break;
      case "reject-payment":
        if (b.status !== "pending_payment") wrongState(b, action);
        moved(s, b, c, "reject_payment", "pending_payment", { payment_state: "rejected" });
        break;
    }
    return ok(b);
  }],
  ["POST", P("\\/bookings\\/([^/]+)\\/reschedule"), (c) => {
    const s = book(c);
    const b = findBooking(s, c.params[1]);
    if (b.status !== "pending_approval" && b.status !== "confirmed") wrongState(b, "reschedule");
    const body = strict(c, ["starts_at", "resource_id", "resource_external_id"]);
    const svc = s.services.find((x) => x.id === b.service_id) ?? fail(404, "service_not_found");
    const wanted = ref(s.resources, fromBody(body), "resource", "resource_not_found");
    const placed = placeAt(s, c, svc, body.starts_at, wanted, false, b.id);
    moved(s, b, c, "reschedule", b.status, {
      starts_at: iso(placed.start),
      ends_at: iso(placed.start + b.duration_min * 60_000),
      resource_id: placed.res.id,
      resource_external_id: placed.res.external_id,
      conflict: "",
    });
    return ok(b);
  }],

  // 35 receipt content
  ["GET", P("\\/bookings\\/([^/]+)\\/receipts\\/([^/]+)\\/content"), (c) => {
    const s = book(c);
    const b = findBooking(s, c.params[1]);
    const r = (s.receipts.get(b.id) ?? []).find((x) => x.media_id === c.params[2]) ?? fail(404, "receipt_not_found");
    const media = tenant(c).media.get(r.media_id) ?? fail(404, "receipt_not_found");
    return { status: 200, bytes: { mime: media.mime, data: media.bytes } };
  }],
];
