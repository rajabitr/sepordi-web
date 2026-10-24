import { fa } from "@/lib/utils";
import {
  BOOKING_CHANNELS,
  CONFIRMATION_MODES,
  RESOURCE_KINDS,
  type BookingConfirmationMode,
  type BookingInterval,
  type BookingService,
  type BookingServicePut,
  type ResourceKind,
} from "@/server/bizin/booking/types";

import { UUID_RE, formToRial, rialToForm, validateIntervals } from "./model";

/*
 * What the setup forms send to their Server Actions, and its translation to the contract's PUT bodies. Money is Toman
 * in the form and Rial on the wire; the conversion happens here and nowhere else.
 */

export interface ServiceInput {
  title: string;
  categoryId: string;
  description: string;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  /** Toman; null = not stated. */
  priceToman: number | null;
  depositToman: number | null;
  mode: BookingConfirmationMode;
  channels: string[];
  offerInChat: boolean;
  requirePhone: boolean;
  active: boolean;
  resourceIds: string[];
  locationText: string;
  onlineLink: string;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; field: string; message: string };

const MAX_TOMAN = 100_000_000_000;

export function serviceToInput(s: BookingService): ServiceInput {
  return {
    title: s.title,
    categoryId: s.category_id,
    description: s.description,
    durationMin: s.duration_min,
    bufferBeforeMin: s.buffer_before_min,
    bufferAfterMin: s.buffer_after_min,
    priceToman: rialToForm(s.price),
    depositToman: rialToForm(s.deposit),
    mode: s.confirmation_mode,
    channels: s.channels,
    offerInChat: s.offer_in_chat,
    requirePhone: s.require_phone,
    active: s.active,
    resourceIds: s.resource_ids,
    locationText: s.location_text,
    onlineLink: s.online_link,
  };
}

const intIn = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** The seller's form as `PUT …/services/{service_ext}` (§3.2 13–16), or the first field to fix. */
export function serviceInputToPut(i: ServiceInput): Checked<BookingServicePut> {
  const title = String(i.title ?? "").trim();
  if (!title || title.length > 80) return { ok: false, field: "title", message: "نام خدمت باید بین ۱ تا ۸۰ نویسه باشد." };
  if (!UUID_RE.test(String(i.categoryId ?? ""))) return { ok: false, field: "category", message: "دسته‌ی خدمت را انتخاب کنید." };
  if (!intIn(i.durationMin, 5, 720)) return { ok: false, field: "duration", message: "مدت خدمت باید بین ۵ دقیقه تا ۱۲ ساعت باشد." };
  if (!intIn(i.bufferBeforeMin, 0, 240) || !intIn(i.bufferAfterMin, 0, 240)) {
    return { ok: false, field: "buffer", message: "فاصله‌ی قبل و بعد از نوبت باید بین ۰ تا ۲۴۰ دقیقه باشد." };
  }
  for (const [field, v] of [["price", i.priceToman], ["deposit", i.depositToman]] as const) {
    if (v !== null && !intIn(v, 0, MAX_TOMAN)) return { ok: false, field, message: "مبلغ را به تومان و بدون اعشار بنویسید." };
  }
  if (!CONFIRMATION_MODES.includes(i.mode)) return { ok: false, field: "mode", message: "روش تأیید نوبت را انتخاب کنید." };
  if (i.mode === "payment" && !(i.depositToman && i.depositToman > 0)) {
    return { ok: false, field: "deposit", message: "برای تأیید با بیعانه، مبلغ بیعانه را بنویسید." };
  }
  if (i.depositToman !== null && i.priceToman !== null && i.depositToman > i.priceToman) {
    return { ok: false, field: "deposit", message: "بیعانه نمی‌تواند از قیمت خدمت بیشتر باشد." };
  }
  const channels = [...new Set(i.channels ?? [])];
  if (channels.length === 0 || channels.some((c) => !(BOOKING_CHANNELS as readonly string[]).includes(c))) {
    return { ok: false, field: "channels", message: "دست‌کم یک کانال را انتخاب کنید." };
  }
  if ((i.resourceIds ?? []).some((id) => !UUID_RE.test(id))) return { ok: false, field: "resources", message: "پرسنل انتخاب‌شده نامعتبر است." };
  const description = String(i.description ?? "").trim();
  if (description.length > 2000) return { ok: false, field: "description", message: "توضیح حداکثر ۲٬۰۰۰ نویسه است." };
  const location = String(i.locationText ?? "").trim();
  const link = String(i.onlineLink ?? "").trim();
  if (location.length > 500) return { ok: false, field: "location", message: "نشانی حداکثر ۵۰۰ نویسه است." };
  if (link && !/^https:\/\/\S{1,490}$/.test(link)) return { ok: false, field: "link", message: "پیوند جلسه‌ی آنلاین باید با https:// شروع شود." };
  return {
    ok: true,
    value: {
      category_id: i.categoryId,
      title,
      description,
      duration_min: i.durationMin,
      buffer_before_min: i.bufferBeforeMin,
      buffer_after_min: i.bufferAfterMin,
      price: formToRial(i.priceToman),
      deposit: formToRial(i.depositToman),
      confirmation_mode: i.mode,
      location_text: location,
      online_link: link,
      require_phone: Boolean(i.requirePhone),
      offer_in_chat: Boolean(i.offerInChat),
      channels,
      resource_ids: i.resourceIds ?? [],
      active: Boolean(i.active),
    },
  };
}

export interface ResourceInput {
  title: string;
  kind: ResourceKind;
  capacity: number;
  /** null = the shop's weekly hours. */
  ownHours: BookingInterval[] | null;
}

export function checkResourceInput(i: ResourceInput): Checked<ResourceInput> {
  const title = String(i.title ?? "").trim();
  if (!title || title.length > 60) return { ok: false, field: "title", message: "نام باید بین ۱ تا ۶۰ نویسه باشد." };
  if (!RESOURCE_KINDS.includes(i.kind)) return { ok: false, field: "kind", message: "نوع را انتخاب کنید." };
  if (!intIn(i.capacity, 1, 50)) return { ok: false, field: "capacity", message: `ظرفیت باید بین ${fa(1)} تا ${fa(50)} باشد.` };
  if (i.ownHours) {
    const problems = validateIntervals(i.ownHours);
    if (problems.length) return { ok: false, field: "hours", message: problems[0].message };
  }
  return { ok: true, value: { ...i, title } };
}
