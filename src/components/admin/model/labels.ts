/* Farsi labels for Partner API enums on the staff screens. Browser-safe. */

/** Every scope a sepordi key needs (partner-api.md §1): one missing turns a whole screen into 403s. */
export const ALL_SCOPES = [
  "tenants:provision", "tenants:read", "channels:read", "channels:connect", "stats:read", "webhooks:manage",
  "users:activate", "orders:read", "assistant:read", "assistant:write", "payments:read", "payments:write",
  "catalog:write", "catalog:read", "cases:read", "cases:write", "payments:verify", "orders:fulfil", "inbox:read",
  "inbox:media", "inbox:write", "shipping:read", "shipping:write", "entitlements:read", "entitlements:write",
  "branding:read", "branding:write",
] as const;

export function missingScopes(granted: readonly string[]): string[] {
  const have = new Set(granted);
  return ALL_SCOPES.filter((s) => !have.has(s));
}

export const FEATURE_FA: Record<string, string> = {
  "channel.whatsapp": "کانال واتس‌اپ",
  "channel.instagram": "کانال اینستاگرام",
  "channel.telegram": "کانال تلگرام",
  "inbox.api": "صندوق پیام از طریق API",
  "payments.verification": "تأیید رسید پرداخت",
  "returns.cases": "پرونده‌ی مرجوعی",
  "shipping.rules": "قانون‌های ارسال",
  "flows.advanced": "گفت‌وگوهای پیشرفته",
  "instagram.comments": "پاسخ به کامنت اینستاگرام",
};

export const LIMIT_FA: Record<string, string> = {
  "tenants.max": "حداکثر فروشگاه",
  "channels.max": "حداکثر کانال هر فروشگاه",
  "products.max": "حداکثر محصول هر فروشگاه",
};

export const SOURCE_FA: Record<string, string> = {
  contract: "قرارداد",
  tenant: "محدودیت سپردی",
  operator: "پشتیبانی بیزین",
};

export const CHANNEL_KIND_FA: Record<string, string> = {
  whatsapp: "واتس‌اپ",
  instagram: "اینستاگرام",
  telegram: "تلگرام",
};

export const CHANNEL_STATUS_FA: Record<string, string> = {
  disconnected: "قطع",
  pairing: "در حال اتصال",
  connected: "وصل",
  banned: "مسدود",
  error: "خطا",
};

export const OWNER_STATUS_FA: Record<string, string> = {
  pending: "در انتظار فعال‌سازی",
  active: "فعال",
  disabled: "غیرفعال",
};

export const BRAND_MODE_FA: Record<string, string> = {
  direct: "مستقیم (نام بیزین)",
  partner: "برند سپردی",
  co_brand: "برند مشترک",
};

export const WEBHOOK_DISABLED_FA: Record<string, string> = {
  partner: "به دست سپردی",
  gone: "آدرس دیگر وجود ندارد",
  failing: "خطاهای پشت‌سرهم",
  operator: "به دست پشتیبانی بیزین",
};

export const DELIVERY_STATE_FA: Record<string, string> = {
  pending: "در صف",
  delivered: "رسید",
  dead: "ناموفق",
  cancelled: "لغو شد",
};

export const DELIVERY_ERROR_FA: Record<string, string> = {
  timeout: "پاسخ دیر رسید",
  dial_refused: "اتصال رد شد",
  tls: "خطای گواهی",
  http_4xx: "خطای ۴xx",
  http_5xx: "خطای ۵xx",
  gone: "آدرس حذف شده",
};

export const EVENT_TYPE_FA: Record<string, string> = {
  "*": "همه‌ی رویدادها",
  "tenant.provisioned": "ساخت فروشگاه",
  "channel.connected": "وصل شدن کانال",
  "channel.disconnected": "قطع شدن کانال",
  "channel.health_changed": "تغییر سلامت کانال",
  "handoff.raised": "ارجاع به انسان",
  "handoff.released": "پایان ارجاع",
  "message.received": "پیام دریافتی",
  "message.sent": "پیام ارسالی",
  "order.created": "سفارش تازه",
  "order.status_changed": "تغییر وضعیت سفارش",
  "payment.evidence_received": "رسید پرداخت",
  "credit.exhausted": "تمام شدن اعتبار",
  "case.opened": "پرونده‌ی تازه",
  "case.updated": "به‌روزرسانی پرونده",
  "entitlements.changed": "تغییر امکانات",
  "import.completed": "پایان درون‌ریزی",
  ping: "آزمایش",
};

export const JOB_STATUS_FA: Record<string, string> = {
  ready: "آماده‌ی ثبت",
  committing: "در حال ثبت",
  done: "انجام شد",
  error: "خطا",
  expired: "منقضی",
  cancelled: "لغو شد",
};

export const JOB_TONE = { ready: "brand", committing: "warning", done: "success", error: "danger", expired: "neutral", cancelled: "neutral" } as const;

export const ROW_ACTION_FA: Record<string, string> = {
  create: "ساخته می‌شود",
  update: "به‌روز می‌شود",
  unchanged: "بدون تغییر",
  fail: "خطا",
  not_attempted: "انجام نشد",
};

export const ROW_ERROR_FA: Record<string, string> = {
  required_missing: "ستون لازم خالی است",
  too_long: "مقدار طولانی است",
  invalid_value: "مقدار نادرست",
  invalid_email: "ایمیل نادرست",
  invalid_phone: "شماره‌ی موبایل نادرست",
  market_profile_invalid: "بازار نادرست",
  reply_language_invalid: "زبان پاسخ نادرست",
  locale_invalid: "زبان پنل نادرست",
  metadata_invalid: "متادیتا نادرست",
  external_id_invalid: "شناسه‌ی فروشگاه نادرست",
  duplicate_in_file: "شناسه‌ی تکراری در فایل",
  owner_email_duplicate_in_file: "ایمیل تکراری در فایل",
  owner_email_in_use: "ایمیل قبلاً ثبت شده",
  owner_mismatch: "مالک فروشگاه فرق دارد",
  owner_external_id_in_use: "حساب مالک به فروشگاه دیگری وصل است",
  entitlement_exceeded: "سقف فروشگاه‌های قرارداد پر است",
  quota_exceeded: "سقف ساخت امروز پر است",
  id_precision_lost: "شناسه در اکسل گرد شده؛ ستون را متنی کنید",
  formula_no_value: "فرمول بدون مقدار",
  row_unreadable: "سطر خوانده نشد",
  write_failed: "ثبت نشد",
};

export const CREDIT_STATUS_FA: Record<string, string> = {
  pending: "در انتظار تأیید پرداخت",
  paid: "در انتظار شارژ",
  granted: "شارژ شد",
  rejected: "رد شد",
  failed: "ناموفق",
  cancelled: "لغو شد",
};

export const PAYMENT_METHOD_FA: Record<string, string> = {
  card_to_card: "کارت‌به‌کارت",
  zarinpal: "درگاه زرین‌پال",
  card: "کارت‌به‌کارت",
  online: "درگاه پرداخت",
  gateway: "درگاه پرداخت",
};

export const PLAN_FA: Record<string, string> = {
  free: "رایگان",
  bronze: "برنزی",
  silver: "نقره‌ای",
  gold: "طلایی",
};

export const label = (map: Record<string, string>, key: string | null | undefined) => (key ? (map[key] ?? key) : "—");
