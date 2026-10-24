import "server-only";

import { randomUUID } from "node:crypto";

import { seg, type WriteOptions } from "../client";
import { BizinError, parseRetryAfter } from "../error";
import { bizinMode, liveTransport, type Transport, type TransportRequest } from "../transport";
import type {
  Booking,
  BookingAction,
  BookingCategory,
  BookingCategoryPut,
  BookingCreate,
  BookingDayOverride,
  BookingDays,
  BookingDetail,
  BookingException,
  BookingExceptionCreate,
  BookingHours,
  BookingInterval,
  BookingReschedule,
  BookingResource,
  BookingResourcePut,
  BookingSchedule,
  BookingSchedulePut,
  BookingService,
  BookingServicePut,
  BookingSettings,
  BookingSettingsPut,
  BookingSlots,
  ListBookingsQuery,
  Page,
  Written,
} from "./types";

/*
 * Routes 1–35 of /partner/v1/tenants/{ext}/booking. The same rules as ../client.ts (that file is the door for every
 * other route): `ext` only from requireSeller, Idempotency-Key on every POST and DELETE and never on PUT, one 429 retry
 * with the same key, the stable error code in a BizinError.
 */

const TIMEOUT_MS = 30_000;
const MAX_RETRY_AFTER_S = 10;

type QueryValue = string | number | boolean | readonly (string | number | boolean)[] | undefined | null;

interface Call {
  method: TransportRequest["method"];
  path: string;
  query?: object;
  json?: unknown;
  idempotencyKey?: string;
  accept?: string;
}

let override: Transport | undefined;

/** Tests swap the transport; production code never calls this. */
export function setBookingTransportForTests(t: Transport | undefined): void {
  override = t;
}

async function transport(): Promise<Transport> {
  if (override) return override;
  if (bizinMode() === "mock") {
    const { mockTransport } = await import("../mock");
    return mockTransport;
  }
  return liveTransport();
}

function queryString(query: Call["query"]): string {
  if (!query) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query as Record<string, QueryValue>)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) for (const item of v) qs.append(k, String(item));
    else qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(call: Call): Promise<{ res: Response; requestId: string }> {
  const t = await transport();
  const requestId = randomUUID();
  const headers: Record<string, string> = {
    Accept: call.accept ?? "application/json",
    "X-Request-Id": requestId,
    "User-Agent": "sepordi-web/1",
  };
  if (call.method === "POST" || call.method === "DELETE") headers["Idempotency-Key"] = call.idempotencyKey ?? randomUUID();
  let body: string | undefined;
  if (call.json !== undefined) {
    body = JSON.stringify(call.json);
    headers["Content-Type"] = "application/json";
  }
  const path = `${call.path}${queryString(call.query)}`;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await t({ method: call.method, path, headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (e instanceof BizinError) throw e;
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new BizinError({ status: 0, code: timedOut ? "timeout" : "network_error", message: e instanceof Error ? e.message : String(e), requestId });
    }
    if (res.status === 429 && attempt === 0) {
      const wait = parseRetryAfter(res.headers.get("retry-after")) ?? 1;
      if (wait <= MAX_RETRY_AFTER_S) {
        await res.body?.cancel();
        await sleep(wait * 1000);
        continue;
      }
    }
    return { res, requestId };
  }
}

async function json<T>(call: Call): Promise<T> {
  const { res, requestId } = await send(call);
  if (!res.ok) throw await BizinError.fromResponse(res, requestId);
  return (await res.json()) as T;
}

async function none(call: Call): Promise<void> {
  const { res, requestId } = await send(call);
  if (!res.ok) throw await BizinError.fromResponse(res, requestId);
  await res.body?.cancel();
}

const B = (ext: string) => `/tenants/${seg(ext)}/booking`;
const BK = (ext: string, id: string) => `${B(ext)}/bookings/${seg(id)}`;

// ---- 1–2 settings -----------------------------------------------------------------------------------------

export const getBookingSettings = (ext: string) => json<BookingSettings>({ method: "GET", path: `${B(ext)}/settings` });

export const putBookingSettings = (ext: string, body: BookingSettingsPut) =>
  json<BookingSettings>({ method: "PUT", path: `${B(ext)}/settings`, json: body });

// ---- 3–5 categories ---------------------------------------------------------------------------------------

export const listBookingCategories = (ext: string, query?: Page) =>
  json<{ categories: BookingCategory[]; next_cursor: string | null }>({ method: "GET", path: `${B(ext)}/categories`, query });

export const putBookingCategory = (ext: string, categoryExt: string, body: BookingCategoryPut) =>
  json<Written<BookingCategory>>({ method: "PUT", path: `${B(ext)}/categories/${seg(categoryExt)}`, json: body });

export const deleteBookingCategory = (ext: string, categoryExt: string, opts?: WriteOptions) =>
  none({ method: "DELETE", path: `${B(ext)}/categories/${seg(categoryExt)}`, ...opts });

// ---- 6–8 resources ----------------------------------------------------------------------------------------

export const listBookingResources = (ext: string, query?: Page) =>
  json<{ resources: BookingResource[]; next_cursor: string | null }>({ method: "GET", path: `${B(ext)}/resources`, query });

export const putBookingResource = (ext: string, resourceExt: string, body: BookingResourcePut) =>
  json<Written<BookingResource>>({ method: "PUT", path: `${B(ext)}/resources/${seg(resourceExt)}`, json: body });

export const deleteBookingResource = (ext: string, resourceExt: string, opts?: WriteOptions) =>
  none({ method: "DELETE", path: `${B(ext)}/resources/${seg(resourceExt)}`, ...opts });

// ---- 9–12 hours and schedules -----------------------------------------------------------------------------

export const getBookingHours = (ext: string) => json<BookingHours>({ method: "GET", path: `${B(ext)}/hours` });

export const putBookingHours = (ext: string, intervals: BookingInterval[]) =>
  json<BookingHours>({ method: "PUT", path: `${B(ext)}/hours`, json: { intervals } });

export const listBookingSchedules = (ext: string, query?: Page) =>
  json<{ schedules: BookingSchedule[]; next_cursor: string | null }>({ method: "GET", path: `${B(ext)}/schedules`, query });

export const putBookingSchedule = (ext: string, scheduleExt: string, body: BookingSchedulePut) =>
  json<Written<BookingSchedule>>({ method: "PUT", path: `${B(ext)}/schedules/${seg(scheduleExt)}`, json: body });

// ---- 13–16 services ---------------------------------------------------------------------------------------

export const listBookingServices = (ext: string, query?: Page) =>
  json<{ services: BookingService[]; next_cursor: string | null }>({ method: "GET", path: `${B(ext)}/services`, query });

export const getBookingService = (ext: string, serviceExt: string) =>
  json<BookingService>({ method: "GET", path: `${B(ext)}/services/${seg(serviceExt)}` });

export const putBookingService = (ext: string, serviceExt: string, body: BookingServicePut) =>
  json<Written<BookingService>>({ method: "PUT", path: `${B(ext)}/services/${seg(serviceExt)}`, json: body });

export const deleteBookingService = (ext: string, serviceExt: string, opts?: WriteOptions) =>
  none({ method: "DELETE", path: `${B(ext)}/services/${seg(serviceExt)}`, ...opts });

// ---- 17–19 exceptions -------------------------------------------------------------------------------------

export const listBookingExceptions = (ext: string, query: { from: string; to: string }) =>
  json<{ from: string; to: string; exceptions: BookingException[] }>({ method: "GET", path: `${B(ext)}/exceptions`, query });

export const createBookingException = (ext: string, body: BookingExceptionCreate, opts?: WriteOptions) =>
  json<BookingException>({ method: "POST", path: `${B(ext)}/exceptions`, json: body, ...opts });

export const deleteBookingException = (ext: string, exceptionId: string, opts?: WriteOptions) =>
  none({ method: "DELETE", path: `${B(ext)}/exceptions/${seg(exceptionId)}`, ...opts });

// ---- 20–22 days and day overrides -------------------------------------------------------------------------

export const listBookingDays = (ext: string, query: { from: string; to: string }) =>
  json<BookingDays>({ method: "GET", path: `${B(ext)}/days`, query });

export const putBookingDayOverride = (ext: string, date: string, body: { kind: "open" | "closed"; note: string }) =>
  json<BookingDayOverride>({ method: "PUT", path: `${B(ext)}/day-overrides/${seg(date)}`, json: body });

export const deleteBookingDayOverride = (ext: string, date: string, opts?: WriteOptions) =>
  none({ method: "DELETE", path: `${B(ext)}/day-overrides/${seg(date)}`, ...opts });

// ---- 23 slots ---------------------------------------------------------------------------------------------

export const listBookingSlots = (
  ext: string,
  query: { service_id?: string; service_external_id?: string; resource_id?: string; resource_external_id?: string; from: string; to: string; limit?: number },
) => json<BookingSlots>({ method: "GET", path: `${B(ext)}/slots`, query });

// ---- 24–35 bookings ---------------------------------------------------------------------------------------

export const listBookings = (ext: string, query?: ListBookingsQuery) =>
  json<{ bookings: Booking[]; next_cursor: string | null }>({ method: "GET", path: `${B(ext)}/bookings`, query });

export const getBooking = (ext: string, bookingId: string) => json<BookingDetail>({ method: "GET", path: BK(ext, bookingId) });

export const createBooking = (ext: string, body: BookingCreate, opts?: WriteOptions) =>
  json<Booking>({ method: "POST", path: `${B(ext)}/bookings`, json: body, ...opts });

/** Routes 27–29 and 31–34: one move of the state machine with the seller's rights. */
export const actOnBooking = (ext: string, bookingId: string, action: BookingAction, body: { reason?: string } = {}, opts?: WriteOptions) =>
  json<Booking>({ method: "POST", path: `${BK(ext, bookingId)}/${action}`, json: body, ...opts });

export const rescheduleBooking = (ext: string, bookingId: string, body: BookingReschedule, opts?: WriteOptions) =>
  json<Booking>({ method: "POST", path: `${BK(ext, bookingId)}/reschedule`, json: body, ...opts });

/** The receipt's bytes; the caller proxies the body as-is and never caches it. */
export async function getBookingReceiptContent(ext: string, bookingId: string, mediaId: string): Promise<Response> {
  const { res, requestId } = await send({ method: "GET", path: `${BK(ext, bookingId)}/receipts/${seg(mediaId)}/content`, accept: "*/*" });
  if (!res.ok) throw await BizinError.fromResponse(res, requestId);
  return res;
}
