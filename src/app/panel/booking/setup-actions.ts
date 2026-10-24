"use server";

import { randomUUID } from "node:crypto";

import { refresh } from "next/cache";

import { checkResourceInput, serviceInputToPut, type ResourceInput, type ServiceInput } from "@/components/panel/booking/inputs";
import { DAY_RE, KEY_RE, UUID_RE, validateIntervals, type ActionResult } from "@/components/panel/booking/model";
import { recordActivity, type ActivityAction, type ActivityTarget } from "@/server/audit";
import { requireShopOwner } from "@/server/auth/session";
import {
  createBookingException,
  deleteBookingCategory,
  deleteBookingDayOverride,
  deleteBookingException,
  deleteBookingResource,
  deleteBookingService,
  putBookingCategory,
  putBookingDayOverride,
  putBookingHours,
  putBookingResource,
  putBookingSchedule,
  putBookingService,
  putBookingSettings,
} from "@/server/bizin/booking/client";
import { toBookingFarsiError } from "@/server/bizin/booking/gate";
import {
  CATEGORY_COLORS,
  CATEGORY_KINDS,
  EXCEPTION_KINDS,
  SLOT_STEPS,
  type BookingExceptionCreate,
  type BookingInterval,
  type BookingSettingsPut,
  type CategoryColor,
  type CategoryKind,
  type ExceptionKind,
} from "@/server/bizin/booking/types";

/*
 * The owner's booking setup. Rows made here get the partner's own id, `svc_`/`res_`/`cat_`/`sch_` plus a uuid,
 * generated on the server; an edit sends back the id Bizin listed. A row made in Bizin's panel has no external id and
 * cannot be addressed by path (contract §3.0), so it is never edited from here.
 */

const STALE: ActionResult = { ok: false, code: "bad_input", message: "اطلاعات این صفحه قدیمی است. صفحه را تازه کنید." };
/** Any id Bizin listed for this shop's rows: 1–128 printable characters (escaped into the path by the client). */
const ROW_EXT_RE = /^[^\s\x00-\x1f\x7f]{1,128}$/;

async function owner<T>(
  action: ActivityAction,
  target: ActivityTarget | null,
  call: (ext: string) => Promise<T>,
): Promise<{ ok: true; value: T } | Exclude<ActionResult, { ok: true }>> {
  const ctx = await requireShopOwner();
  try {
    const value = await call(ctx.shop.external_business_id);
    recordActivity(ctx, action, target);
    return { ok: true, value };
  } catch (e) {
    const f = toBookingFarsiError(e);
    return { ok: false, code: f.code, message: f.message, requestId: f.requestId };
  } finally {
    refresh();
  }
}

const done = <T>(r: { ok: true; value: T } | Exclude<ActionResult, { ok: true }>): ActionResult => (r.ok ? { ok: true } : r);
const extOr = (prefix: "svc" | "res" | "cat" | "sch", given: string | null | undefined) =>
  given && ROW_EXT_RE.test(given) ? given : given ? null : `${prefix}_${randomUUID()}`;
const bad = (message: string): ActionResult => ({ ok: false, code: "invalid_value", message });

// ---- settings -----------------------------------------------------------------------------------------------

export interface SettingsInput {
  assistantEnabled: boolean;
  holidaysCloseBooking: boolean;
  horizonDays: number;
  minNoticeMin: number;
  slotStepMin: number;
  maxPerDay: number | null;
  cancelCutoffMin: number;
  paymentWindowMin: number;
  paymentInstructions: string;
  noShowAfterMin: number;
}

const intIn = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export async function saveSettingsAction(i: SettingsInput): Promise<ActionResult> {
  if (!intIn(i.horizonDays, 1, 365)) return bad("بازه‌ی نوبت‌دهی باید بین ۱ تا ۳۶۵ روز باشد.");
  if (!intIn(i.minNoticeMin, 0, 43200)) return bad("کمترین فاصله تا نوبت نامعتبر است.");
  if (i.minNoticeMin > i.horizonDays * 1440) return bad("کمترین فاصله تا نوبت از بازه‌ی نوبت‌دهی بیشتر است.");
  if (!(SLOT_STEPS as readonly number[]).includes(i.slotStepMin)) return bad("فاصله‌ی شروع نوبت‌ها را از فهرست انتخاب کنید.");
  if (i.maxPerDay !== null && !intIn(i.maxPerDay, 1, 1000)) return bad("سقف نوبت روزانه باید دست‌کم ۱ باشد.");
  if (!intIn(i.cancelCutoffMin, 0, 10080)) return bad("مهلت لغو حداکثر ۷ روز است.");
  if (!intIn(i.paymentWindowMin, 15, 1440)) return bad("مهلت واریز بیعانه باید بین ۱۵ دقیقه تا ۲۴ ساعت باشد.");
  if (!intIn(i.noShowAfterMin, 0, 720)) return bad("زمان ثبت «نیامد» باید بین ۰ تا ۷۲۰ دقیقه باشد.");
  const instructions = String(i.paymentInstructions ?? "").trim();
  if (instructions.length > 2000) return bad("راهنمای واریز حداکثر ۲٬۰۰۰ نویسه است.");
  const body: BookingSettingsPut = {
    assistant_enabled: Boolean(i.assistantEnabled),
    holidays_close_booking: Boolean(i.holidaysCloseBooking),
    horizon_days: i.horizonDays,
    min_notice_min: i.minNoticeMin,
    slot_step_min: i.slotStepMin,
    max_per_day: i.maxPerDay,
    cancel_cutoff_min: i.cancelCutoffMin,
    payment_window_min: i.paymentWindowMin,
    payment_instructions: instructions,
    no_show_after_min: i.noShowAfterMin,
  };
  return done(await owner("booking.settings_save", null, (ext) => putBookingSettings(ext, body)));
}

// ---- categories ---------------------------------------------------------------------------------------------

export async function saveCategoryAction(categoryExt: string | null, title: string, kind: CategoryKind, color: CategoryColor): Promise<ActionResult | { ok: true; value: string }> {
  const ext = extOr("cat", categoryExt);
  const t = String(title ?? "").trim();
  if (!ext) return STALE;
  if (!t || t.length > 60) return bad("نام دسته باید بین ۱ تا ۶۰ نویسه باشد.");
  if (!CATEGORY_KINDS.includes(kind) || !CATEGORY_COLORS.includes(color)) return STALE;
  const r = await owner("booking.category_save", { type: "booking_category", id: ext }, (shopExt) => putBookingCategory(shopExt, ext, { title: t, kind, color }));
  return r.ok ? { ok: true, value: r.value.id } : r;
}

export async function archiveCategoryAction(categoryExt: string, idempotencyKey: string): Promise<ActionResult> {
  if (!ROW_EXT_RE.test(categoryExt) || !KEY_RE.test(idempotencyKey)) return STALE;
  return done(await owner("booking.category_archive", { type: "booking_category", id: categoryExt }, (ext) => deleteBookingCategory(ext, categoryExt, { idempotencyKey })));
}

// ---- services -----------------------------------------------------------------------------------------------

export async function saveServiceAction(serviceExt: string | null, input: ServiceInput): Promise<ActionResult> {
  const ext = extOr("svc", serviceExt);
  if (!ext) return STALE;
  const checked = serviceInputToPut(input);
  if (!checked.ok) return bad(checked.message);
  return done(await owner("booking.service_save", { type: "booking_service", id: ext }, (shopExt) => putBookingService(shopExt, ext, checked.value)));
}

export async function archiveServiceAction(serviceExt: string, idempotencyKey: string): Promise<ActionResult> {
  if (!ROW_EXT_RE.test(serviceExt) || !KEY_RE.test(idempotencyKey)) return STALE;
  return done(await owner("booking.service_archive", { type: "booking_service", id: serviceExt }, (ext) => deleteBookingService(ext, serviceExt, { idempotencyKey })));
}

// ---- resources ----------------------------------------------------------------------------------------------

/** A resource with its own week writes that schedule first (`PUT …/schedules/{sch_…}`), then points at it. */
export async function saveResourceAction(resourceExt: string | null, scheduleExt: string | null, input: ResourceInput): Promise<ActionResult> {
  const ext = extOr("res", resourceExt);
  const sch = input.ownHours ? extOr("sch", scheduleExt) : null;
  if (!ext || (input.ownHours && !sch)) return STALE;
  const checked = checkResourceInput(input);
  if (!checked.ok) return bad(checked.message);
  const v = checked.value;
  return done(
    await owner("booking.resource_save", { type: "booking_resource", id: ext }, async (shopExt) => {
      if (v.ownHours && sch) await putBookingSchedule(shopExt, sch, { title: `ساعات ${v.title}`.slice(0, 60), intervals: v.ownHours });
      return putBookingResource(shopExt, ext, {
        title: v.title,
        kind: v.kind,
        capacity: v.capacity,
        ...(v.ownHours && sch ? { schedule_external_id: sch } : { schedule_id: null }),
      });
    }),
  );
}

export async function archiveResourceAction(resourceExt: string, idempotencyKey: string): Promise<ActionResult> {
  if (!ROW_EXT_RE.test(resourceExt) || !KEY_RE.test(idempotencyKey)) return STALE;
  return done(await owner("booking.resource_archive", { type: "booking_resource", id: resourceExt }, (ext) => deleteBookingResource(ext, resourceExt, { idempotencyKey })));
}

// ---- hours --------------------------------------------------------------------------------------------------

export async function saveHoursAction(intervals: BookingInterval[]): Promise<ActionResult> {
  if (!Array.isArray(intervals)) return STALE;
  const clean = intervals.map((iv) => ({ weekday: iv.weekday, start_min: iv.start_min, end_min: iv.end_min }));
  const problems = validateIntervals(clean);
  if (problems.length) return bad(problems[0].message);
  return done(await owner("booking.hours_save", null, (ext) => putBookingHours(ext, clean)));
}

// ---- exceptions and day overrides ---------------------------------------------------------------------------

export interface ExceptionInput {
  onDate: string;
  kind: ExceptionKind;
  startMin: number | null;
  endMin: number | null;
  serviceId: string | null;
  resourceId: string | null;
  note: string;
}

export async function createExceptionAction(i: ExceptionInput, idempotencyKey: string): Promise<ActionResult> {
  if (!DAY_RE.test(i.onDate) || !EXCEPTION_KINDS.includes(i.kind) || !KEY_RE.test(idempotencyKey)) return STALE;
  if (i.serviceId && i.resourceId) return bad("استثنا را یا برای یک خدمت بگذارید یا برای یک پرسنل، نه هر دو.");
  if ((i.serviceId && !UUID_RE.test(i.serviceId)) || (i.resourceId && !UUID_RE.test(i.resourceId))) return STALE;
  const timed = i.kind === "hours" || i.kind === "block";
  if (!timed && !i.serviceId && !i.resourceId) return bad("بستن یا باز کردن کل روز فروشگاه از بخش «تعطیلی روز» انجام می‌شود.");
  if (timed) {
    const problems = validateIntervals([{ weekday: 0, start_min: i.startMin ?? -1, end_min: i.endMin ?? -1 }]);
    if (problems.length) return bad(problems[0].message);
  }
  const note = String(i.note ?? "").trim();
  if (note.length > 200) return bad("یادداشت حداکثر ۲۰۰ نویسه است.");
  const body: BookingExceptionCreate = {
    on_date: i.onDate,
    kind: i.kind,
    ...(timed ? { start_min: i.startMin!, end_min: i.endMin! } : {}),
    ...(i.serviceId ? { service_id: i.serviceId } : {}),
    ...(i.resourceId ? { resource_id: i.resourceId } : {}),
    note,
  };
  return done(await owner("booking.exception_save", { type: "booking_exception", id: i.onDate }, (ext) => createBookingException(ext, body, { idempotencyKey })));
}

export async function deleteExceptionAction(exceptionId: string, idempotencyKey: string): Promise<ActionResult> {
  if (!UUID_RE.test(exceptionId) || !KEY_RE.test(idempotencyKey)) return STALE;
  return done(await owner("booking.exception_delete", { type: "booking_exception", id: exceptionId }, (ext) => deleteBookingException(ext, exceptionId, { idempotencyKey })));
}

export async function setDayOverrideAction(date: string, kind: "open" | "closed", note: string): Promise<ActionResult> {
  if (!DAY_RE.test(date) || (kind !== "open" && kind !== "closed")) return STALE;
  const n = String(note ?? "").trim();
  if (n.length > 200) return bad("یادداشت حداکثر ۲۰۰ نویسه است.");
  return done(await owner("booking.day_save", { type: "booking_day", id: date }, (ext) => putBookingDayOverride(ext, date, { kind, note: n })));
}

export async function clearDayOverrideAction(date: string, idempotencyKey: string): Promise<ActionResult> {
  if (!DAY_RE.test(date) || !KEY_RE.test(idempotencyKey)) return STALE;
  return done(await owner("booking.day_clear", { type: "booking_day", id: date }, (ext) => deleteBookingDayOverride(ext, date, { idempotencyKey })));
}
