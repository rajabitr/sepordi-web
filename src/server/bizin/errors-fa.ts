import "server-only";

import { fa } from "@/lib/utils";

import { BizinError } from "./error";

type Params = Record<string, unknown> | undefined;
type Message = string | ((p: Params) => string);

const num = (p: Params, key: string) => (p && p[key] !== undefined ? fa(String(p[key])) : undefined);

/**
 * Every documented Partner API error code (partner-api.md §4 and the per-route sections) in seller-facing Farsi.
 * Codes about the partner key, scopes and contract are sepordi's own fault, so the seller is told to contact support.
 */
const MESSAGES: Record<string, Message> = {
  // the client itself
  network_error: "اتصال به سرور دستیار برقرار نشد. چند لحظه بعد دوباره امتحان کنید.",
  timeout: "پاسخ سرور دستیار طول کشید. چند لحظه بعد دوباره امتحان کنید.",
  not_configured: "اتصال سپردی به دستیار هنوز تنظیم نشده است. با پشتیبانی تماس بگیرید.",
  unexpected_response: "پاسخ نامعتبری از سرور دستیار رسید. دوباره امتحان کنید.",

  // gateway, keys, limits
  not_found: "این مورد پیدا نشد.",
  invalid_partner_key: "اتصال سپردی به دستیار برقرار نیست. با پشتیبانی تماس بگیرید.",
  partner_suspended: "سرویس دستیار موقتاً در دسترس نیست. با پشتیبانی تماس بگیرید.",
  insufficient_scope: "این امکان هنوز برای سپردی فعال نشده است. با پشتیبانی تماس بگیرید.",
  feature_not_entitled: "این امکان در طرح فعلی شما فعال نیست.",
  entitlement_exceeded: "سقف تعداد فروشگاه‌ها پر شده است. با پشتیبانی تماس بگیرید.",
  entitlement_set_by_operator: "این تنظیم را فقط پشتیبانی می‌تواند تغییر دهد.",
  unknown_feature: "این امکان شناخته‌شده نیست.",
  unknown_limit: "این سقف شناخته‌شده نیست.",
  rate_limited: (p) =>
    num(p, "retry_after_seconds")
      ? `درخواست‌ها زیاد شد. ${num(p, "retry_after_seconds")} ثانیه‌ی دیگر دوباره امتحان کنید.`
      : "درخواست‌ها زیاد شد. کمی بعد دوباره امتحان کنید.",
  quota_exceeded: "سقف ساخت فروشگاه امروز پر شده است. فردا دوباره امتحان کنید.",
  not_implemented: "این امکان هنوز آماده نیست.",
  internal_error: "مشکلی در سرور دستیار پیش آمد. چند لحظه بعد دوباره امتحان کنید.",

  // idempotency
  idempotency_key_required: "درخواست ناقص ارسال شد. دوباره امتحان کنید.",
  idempotency_key_invalid: "درخواست ناقص ارسال شد. دوباره امتحان کنید.",
  idempotency_body_unreadable: "درخواست خوانده نشد. دوباره امتحان کنید.",
  idempotency_body_too_large: "حجم درخواست زیاد است. آن را کوچک‌تر کنید.",
  idempotency_key_reused: "این درخواست قبلاً با اطلاعات دیگری ثبت شده است. صفحه را تازه کنید.",
  idempotency_request_in_progress: "همین درخواست هنوز در حال انجام است. چند لحظه صبر کنید.",
  idempotency_replay_unavailable: "این کار قبلاً انجام شده است. صفحه را تازه کنید تا نتیجه را ببینید.",
  idempotency_unavailable: "ثبت امن درخواست الان ممکن نیست. چند لحظه بعد دوباره امتحان کنید.",

  // validation
  bad_request_body: "اطلاعات فرستاده‌شده درست نیست. فرم را بررسی کنید.",
  invalid_value: "یکی از مقدارها درست نیست. فرم را بررسی کنید.",
  limit_invalid: "تعداد درخواستی درست نیست.",
  filter_unavailable: "این فیلتر الان در دسترس نیست.",
  stats_range_invalid: (p) =>
    `بازه‌ی تاریخ درست نیست. تاریخ شروع باید قبل از پایان باشد و بازه حداکثر ${num(p, "max_days") ?? "۹۲"} روز.`,
  external_business_id_invalid: "شناسه‌ی فروشگاه درست نیست.",
  tenant_not_found: "فروشگاه شما در سرویس دستیار پیدا نشد. با پشتیبانی تماس بگیرید.",

  // owner and activation
  owner_email_in_use: "این ایمیل قبلاً برای حساب دیگری ثبت شده است. ایمیل دیگری وارد کنید.",
  owner_mismatch: "این فروشگاه قبلاً با مالک دیگری ساخته شده است. با پشتیبانی تماس بگیرید.",
  owner_external_id_in_use: "این حساب به فروشگاه دیگری وصل است. با پشتیبانی تماس بگیرید.",
  owner_already_active: "حساب مالک قبلاً فعال شده است.",
  owner_not_pending: "حسابی در انتظار فعال‌سازی برای این فروشگاه نیست.",

  // channels
  channel_not_supported: "این کانال با لینک وصل نمی‌شود.",
  return_url_not_allowed: "آدرس بازگشت مجاز نیست. با پشتیبانی تماس بگیرید.",
  channel_already_connected: "این کانال از قبل وصل است. برای وصل کردن حساب دیگر، اول آن را جدا کنید.",
  channel_account_not_found: "این اتصال دیگر وجود ندارد. صفحه را تازه کنید.",
  channel_create_failed: "اتصال ساخته نشد. دوباره امتحان کنید.",
  whatsapp_pairing_in_progress: "یک اتصال واتس‌اپ در حال انجام است. همان را کامل کنید یا چند دقیقه صبر کنید.",
  whatsapp_pairing_failed: "اتصال واتس‌اپ شروع نشد. دوباره امتحان کنید.",
  telegram_unavailable: "اتصال ربات تلگرام الان در دسترس نیست.",
  telegram_token_invalid: "این توکن ربات تلگرام نیست. توکن را از BotFather کپی کنید.",
  telegram_token_rejected: "تلگرام این توکن را قبول نکرد. توکن تازه بگیرید و دوباره امتحان کنید.",
  telegram_bot_taken: "این ربات به حساب دیگری وصل است.",
  telegram_failed: "ارتباط با تلگرام برقرار نشد. دوباره امتحان کنید.",
  channel_not_connected: "این کانال وصل نیست. اول کانال را دوباره وصل کنید.",

  // catalogue
  product_not_found: "این محصول دیگر وجود ندارد.",
  sku_taken: "محصول دیگری همین کد کالا (SKU) را دارد.",
  sku_in_use: "محصول دیگری همین کد کالا (SKU) را دارد.",
  variant_external_id_taken: "محصول دیگری تنوعی با همین شناسه دارد.",
  price_invalid: "قیمت درست نیست.",
  price_negative: "قیمت نمی‌تواند منفی باشد.",
  price_not_integral: "قیمت باید عدد صحیح باشد.",
  stock_invalid: "موجودی درست نیست.",
  title_missing: "عنوان محصول را وارد کنید.",

  // bulk jobs
  import_job_not_found: "این فایل ورودی دیگر وجود ندارد.",
  import_file_invalid: "فایل خوانده نشد. یک فایل CSV یا اکسل درست بفرستید.",
  file_format_unsupported: "فقط فایل CSV یا اکسل (xlsx) قبول می‌شود.",
  file_xls_or_encrypted: "فایل اکسل قدیمی (xls) یا رمزدار است. آن را به xlsx بدون رمز ذخیره کنید.",
  file_unreadable: "فایل خوانده نشد. یک فایل CSV یا اکسل درست بفرستید.",
  file_too_large_uncompressed: "حجم فایل زیاد است. آن را به چند فایل کوچک‌تر تقسیم کنید.",
  columns_missing: "ستون‌های لازم در فایل نیست. از قالب نمونه استفاده کنید.",
  rows_missing: "فایل هیچ ردیفی ندارد.",
  too_many_rows: (p) => `تعداد ردیف‌ها زیاد است${num(p, "max") ? `؛ حداکثر ${num(p, "max")} ردیف` : ""}.`,
  job_not_ready: "این فایل هنوز آماده‌ی ثبت نیست.",
  job_has_row_errors: "بعضی ردیف‌ها خطا دارند. اول آن‌ها را درست کنید.",
  price_unit_mismatch: "واحد ستون قیمت با واحد فروشگاه یکی نیست. ستون قیمت را به همان واحد فروشگاه بنویسید.",
  commit_interrupted: "ثبت نیمه‌کاره ماند. صفحه را تازه کنید و دوباره ثبت کنید.",
  market_changed: "تنظیمات بازار فروشگاه بعد از پیش‌نمایش عوض شد و چیزی ثبت نشد. فایل را دوباره بفرستید.",

  // payment details
  card_number_invalid: "شماره‌ی کارت درست نیست. هر ۱۶ رقم را بررسی کنید.",
  iban_invalid: "شماره‌ی شبا درست نیست. باید با IR شروع شود و ۲۴ رقم داشته باشد.",
  payment_destination_required: "شماره‌ی کارت یا شماره‌ی شبا را وارد کنید.",

  // orders and receipts
  order_not_found: "این سفارش دیگر وجود ندارد.",
  evidence_not_found: "این رسید پرداخت دیگر وجود ندارد.",
  evidence_already_decided: "درباره‌ی این رسید قبلاً تصمیم گرفته شده است. صفحه را تازه کنید.",
  order_not_awaiting_payment: "این سفارش منتظر پرداخت نیست.",
  payment_verification_off: "بررسی رسید پرداخت برای فروشگاه شما فعال نیست.",
  use_mark_paid: "برای این سفارش از «ثبت پرداخت» استفاده کنید.",
  invalid_transition: "سفارش از وضعیت فعلی به این وضعیت نمی‌رود.",

  // inbox
  conversation_not_found: "این گفت‌وگو دیگر وجود ندارد.",
  conversation_not_handed_off: "این گفت‌وگو به شما واگذار نشده است.",
  message_not_found: "این پیام دیگر وجود ندارد.",
  no_customer_message: "مشتری هنوز در این گفت‌وگو پیامی نداده، پس نمی‌شود برایش پیام فرستاد.",
  customer_opted_out: "مشتری خواسته دستیار جواب ندهد. این را فقط از پنل پیشرفته می‌شود برگرداند.",
  window_closed: "مهلت پاسخ در این کانال تمام شده است. منتظر پیام بعدی مشتری بمانید.",
  recipient_refused: "پیام به مشتری نرسید؛ کانال آن را نپذیرفت.",
  send_paused: "ارسال پیام در این کانال موقتاً متوقف است. کمی بعد امتحان کنید.",
  conversation_busy: "این گفت‌وگو الان در حال ارسال پیام است. چند لحظه بعد دوباره بفرستید.",
  image_not_supported_on_channel: "در اینستاگرام از این‌جا نمی‌شود عکس فرستاد. متن بفرستید.",
  media_not_found: "این عکس دیگر وجود ندارد. دوباره آپلود کنید.",
  image_type_unsupported: "عکس باید JPEG یا PNG باشد.",
  image_undecodable: "این عکس باز نشد. عکس دیگری انتخاب کنید.",
  image_empty: "فایل عکس خالی است.",
  file_too_large: (p) => `حجم فایل زیاد است${num(p, "max_mb") ? `؛ حداکثر ${num(p, "max_mb")} مگابایت` : ""}.`,
  bad_multipart: "فایل درست ارسال نشد. دوباره انتخاب کنید.",
  file_field_missing: "فایلی انتخاب نشده است.",
  text_required: "متن پیام را بنویسید.",
  text_too_long: (p) => `متن طولانی است${num(p, "max") ? `؛ حداکثر ${num(p, "max")} نویسه` : ""}. آن را کوتاه‌تر کنید.`,
  send_rate_limited: "ارسال پیام‌ها زیاد شد. کمی بعد دوباره بفرستید.",
  send_failed: "پیام به مشتری نرسید. دوباره بفرستید.",
  media_unavailable: "فایل الان در دسترس نیست. کمی بعد دوباره امتحان کنید.",
  media_store_unavailable: "فایل الان در دسترس نیست. کمی بعد دوباره امتحان کنید.",

  // cases
  case_not_found: "این درخواست مرجوعی دیگر وجود ندارد.",
  photo_not_found: "این عکس دیگر وجود ندارد.",
  case_state_conflict: "این درخواست از وقتی باز کردید تغییر کرده است. صفحه را تازه کنید.",
  case_closed: "این درخواست بسته شده است.",
  invalid_action: "این کار برای این درخواست مجاز نیست.",
  refund_exceeds_total: "مبلغ بازپرداخت از جمع سفارش بیشتر است.",
  return_policy_not_set: "هنوز قانون مرجوعی تعریف نکرده‌اید.",
  return_policy_empty: "برای قانون مرجوعی فعال، مهلت یا شرایط را بنویسید.",

  // webhooks and branding (admin screens)
  webhook_url_refused: "آدرس وب‌هوک باید https روی پورت ۴۴۳ و یک دامنه‌ی عمومی باشد.",
  webhook_limit_reached: (p) => `حداکثر ${num(p, "max") ?? "۵"} وب‌هوک مجاز است.`,
  webhook_disabled: "این وب‌هوک غیرفعال است. اول آن را فعال کنید.",
  secrets_unavailable: "ذخیره‌ی کلید الان ممکن نیست. کمی بعد دوباره امتحان کنید.",
  brand_mode_read_only: "حالت برند از این‌جا تغییر نمی‌کند.",
  disclosure_invalid: "متن اطلاع‌رسانی باید بگوید پاسخ‌ها خودکار است و راه گفت‌وگو با انسان را بدهد.",
  logo_invalid: "لوگو باید PNG یا WebP باشد.",
  logo_type_unsupported: "لوگو باید PNG یا WebP باشد.",
  logo_too_large: "حجم لوگو باید کمتر از ۲۵۶ کیلوبایت باشد.",
  logo_too_wide: "ابعاد لوگو باید حداکثر ۵۱۲ در ۵۱۲ پیکسل باشد.",
  invalid_scopes: "دسترسی‌های کلید درست نیست.",
};

/** Farsi text for a code, without the request id. */
export function bizinErrorMessage(code: string, params?: Record<string, unknown>): string | undefined {
  const m = MESSAGES[code];
  if (!m) return undefined;
  return typeof m === "function" ? m(params) : m;
}

/** What the seller sees for any failure. Unknown codes fall back to a generic line with the request id for support. */
export function toFarsiError(e: unknown): { message: string; code: string; field?: string; requestId?: string } {
  if (e instanceof BizinError) {
    const known = bizinErrorMessage(e.code, e.params);
    const message =
      known ??
      (e.requestId
        ? `کار انجام نشد. اگر دوباره پیش آمد، این کد را به پشتیبانی بدهید: ${e.requestId}`
        : "کار انجام نشد. دوباره امتحان کنید.");
    return { message, code: e.code, field: e.field, requestId: e.requestId };
  }
  return { message: "کار انجام نشد. دوباره امتحان کنید.", code: "unknown" };
}

export const KNOWN_ERROR_CODES = Object.keys(MESSAGES);
