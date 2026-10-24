/** Every action the activity log records, grouped for the filter, with its Persian label. */
export const ACTIVITY_ACTIONS = {
  "inbox.reply": "پاسخ در گفت‌وگو",
  "inbox.claim": "برداشتن گفت‌وگو",
  "inbox.release": "سپردن گفت‌وگو به دستیار",
  "inbox.queue": "برگرداندن گفت‌وگو به صف",
  "order.status": "تغییر وضعیت سفارش",
  "order.receipt_approve": "تأیید رسید پرداخت",
  "order.receipt_reject": "رد رسید پرداخت",
  "order.mark_paid": "ثبت پرداخت سفارش",
  "product.save": "ذخیره‌ی محصول",
  "product.archive": "بایگانی محصول",
  "product.images": "فرستادن تصویر محصول",
  "product.import": "درون‌ریزی محصولات",
  "channel.connect": "اتصال کانال",
  "channel.disconnect": "قطع کانال",
  "assistant.save": "ذخیره‌ی تنظیمات دستیار",
  "knowledge.save": "ذخیره‌ی دانسته‌های دستیار",
  "payments.save": "ذخیره‌ی اطلاعات پرداخت",
  "shipping.save": "ذخیره‌ی تنظیمات ارسال",
  "return.update": "اقدام روی مرجوعی",
  "booking.approve": "تأیید نوبت",
  "booking.reject": "رد نوبت",
  "booking.cancel": "لغو نوبت",
  "booking.reschedule": "جابه‌جایی زمان نوبت",
  "booking.complete": "ثبت انجام نوبت",
  "booking.no_show": "ثبت «نیامد» برای نوبت",
  "booking.payment_confirm": "تأیید بیعانه‌ی نوبت",
  "booking.payment_reject": "رد بیعانه‌ی نوبت",
  "booking.service_save": "ذخیره‌ی خدمت نوبت‌دهی",
  "booking.service_archive": "بایگانی خدمت نوبت‌دهی",
  "booking.resource_save": "ذخیره‌ی پرسنل یا منبع نوبت‌دهی",
  "booking.resource_archive": "بایگانی پرسنل یا منبع نوبت‌دهی",
  "booking.category_save": "ذخیره‌ی دسته‌ی خدمت",
  "booking.category_archive": "بایگانی دسته‌ی خدمت",
  "booking.hours_save": "ذخیره‌ی ساعات کاری",
  "booking.exception_save": "ثبت استثنای نوبت‌دهی",
  "booking.exception_delete": "حذف استثنای نوبت‌دهی",
  "booking.day_save": "ثبت باز یا تعطیل بودن یک روز",
  "booking.day_clear": "حذف تنظیم یک روز",
  "booking.settings_save": "ذخیره‌ی تنظیمات نوبت‌دهی",
  "team.invite": "دعوت عضو تیم",
  "team.invite_cancel": "لغو دعوت",
  "team.role": "تغییر نقش عضو",
  "team.remove": "حذف عضو از تیم",
  "credit.order": "سفارش اعتبار",
} as const;

export type ActivityAction = keyof typeof ACTIVITY_ACTIONS;

export const ACTIVITY_GROUPS = {
  inbox: "صندوق پیام",
  order: "سفارش‌ها",
  product: "محصولات",
  channel: "کانال‌ها",
  assistant: "دستیار",
  knowledge: "دانسته‌ها",
  payments: "پرداخت",
  shipping: "ارسال",
  return: "مرجوعی‌ها",
  booking: "نوبت‌ها",
  team: "تیم",
  credit: "اعتبار",
} as const;

export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;

export function isActivityGroup(v: unknown): v is ActivityGroup {
  return typeof v === "string" && Object.hasOwn(ACTIVITY_GROUPS, v);
}

export function activityLabel(action: string): string {
  return Object.hasOwn(ACTIVITY_ACTIONS, action) ? ACTIVITY_ACTIONS[action as ActivityAction] : action;
}
