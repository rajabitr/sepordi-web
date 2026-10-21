import type { Conversation, HandoffClass } from "./model";

/*
 * Why a thread waits for the seller, and what they can do about it.
 * Reason tokens are open-ended (the contract adds new ones over time), so an unknown token falls back to its class,
 * then to a generic line; the class is absent while bizin's queue flag is off.
 */

export interface HandoffExplanation {
  /** Short, for a list row or a badge. */
  label: string;
  /** What happened and what the seller should do next. */
  detail: string;
}

const RETURN_HINT = "بعد از جواب دادن، گفت‌وگو را به دستیار برگردانید.";

const BY_REASON: Record<string, HandoffExplanation> = {
  no_product_matched: {
    label: "محصول پیدا نشد",
    detail: "دستیار این مورد را در محصولات شما پیدا نکرد. خودتان جواب بدهید، یا محصولش را اضافه کنید و گفت‌وگو را به دستیار برگردانید.",
  },
  commercial_intent: {
    label: "سؤال قیمت یا موجودی",
    detail: "مشتری قیمت یا موجودی پرسید و دستیار به فهرست محصولات شما دسترسی نداشت. خودتان جواب بدهید و محصولات‌تان را کامل کنید.",
  },
  catalog_unavailable: {
    label: "محصولات در دسترس نبود",
    detail: "دستیار موقتاً نتوانست محصولات شما را بخواند و حدس نزد. خودتان جواب بدهید؛ مشکل معمولاً خودش رفع می‌شود.",
  },
  model_requested_human: {
    label: "دستیار جواب مطمئنی نداشت",
    detail: `دستیار تشخیص داد این پیام را بهتر است خودتان جواب بدهید. ${RETURN_HINT}`,
  },
  low_confidence: {
    label: "دستیار مطمئن نبود",
    detail: `دستیار مطمئن نبود مشتری چه می‌خواهد و حدس نزد. خودتان جواب بدهید؛ ${RETURN_HINT}`,
  },
  low_confidence_sensitive: {
    label: "دستیار از جوابش مطمئن نبود",
    detail: `این پیام حساس بود و دستیار از جوابش مطمئن نبود. خودتان جواب بدهید؛ ${RETURN_HINT}`,
  },
  clarification_exhausted: {
    label: "دستیار منظور مشتری را متوجه نشد",
    detail: `دستیار چند بار سؤال کرد و باز منظور مشتری روشن نشد. خودتان جواب بدهید؛ ${RETURN_HINT}`,
  },
  cancel_or_stop_unclear: {
    label: "معلوم نشد مشتری چه می‌خواهد",
    detail: "معلوم نشد مشتری می‌خواهد سفارش را لغو کند یا فقط گفت‌وگوی خودکار را قطع کند. خودتان از او بپرسید.",
  },
  customer_requested_human: {
    label: "مشتری خواست با شما صحبت کند",
    detail: "مشتری خواست با خود شما صحبت کند (مثلاً نوشت «اپراتور»). خودتان جواب بدهید.",
  },
  customer_request: {
    label: "مشتری خواست با شما صحبت کند",
    detail: "مشتری خواست با خود شما صحبت کند (مثلاً نوشت «اپراتور»). خودتان جواب بدهید.",
  },
  customer_requested_order_cancel: {
    label: "مشتری لغو سفارش خواست",
    detail: "مشتری می‌خواهد سفارشش را لغو کند. لغو سفارش با خودتان است؛ تصمیم بگیرید و به مشتری خبر بدهید.",
  },
  customer_opted_out: {
    label: "مشتری پیام خودکار نمی‌خواهد",
    detail: "مشتری گفت پیام خودکار نمی‌خواهد. خودتان جواب بدهید؛ دستیار تا وقتی مشتری دوباره نخواهد جواب نمی‌دهد.",
  },
  discount_request: {
    label: "مشتری تخفیف خواست",
    detail: "مشتری تخفیف خواست و دستیار اجازهٔ تخفیف دادن ندارد. خودتان تصمیم بگیرید و جواب بدهید.",
  },
  receipt_received: {
    label: "مشتری رسید پرداخت فرستاد",
    detail: "مشتری رسید پرداخت فرستاد. رسید را با حساب‌تان چک کنید و پرداخت سفارش را تأیید یا رد کنید.",
  },
  order_checkout: {
    label: "مشتری آمادهٔ خرید است",
    detail: "مشتری می‌خواهد خرید کند. سفارش را ثبت کنید و به مشتری خبر بدهید.",
  },
  booking_request: {
    label: "درخواست نوبت",
    detail: "مشتری نوبت می‌خواهد. زمان را با او هماهنگ کنید.",
  },
  booking_change_request: {
    label: "درخواست تغییر نوبت",
    detail: "مشتری می‌خواهد نوبتش را عوض کند. زمان تازه را با او هماهنگ کنید.",
  },
  safety_emergency: {
    label: "موقعیت اضطراری",
    detail: "مشتری از یک موقعیت اضطراری گفت. هر چه زودتر خودتان جواب بدهید.",
  },
  safety_regulated_advice: {
    label: "سؤال پزشکی، حقوقی یا مالی",
    detail: "مشتری مشاورهٔ پزشکی، حقوقی یا مالی خواست و دستیار در این موارد نظر نمی‌دهد. خودتان جواب بدهید.",
  },
  reply_budget_exhausted: {
    label: "سقف جواب‌های دستیار پر شد",
    detail: `دستیار به سقف جواب‌هایش در این گفت‌وگو رسید. خودتان ادامه بدهید؛ ${RETURN_HINT}`,
  },
  unsupported_media: {
    label: "پیامی که دستیار نمی‌تواند بخواند",
    detail: "مشتری صدا، ویدیو یا فایلی فرستاد که دستیار نمی‌تواند بخواند. خودتان نگاهش کنید و جواب بدهید.",
  },
  image_not_actionable: {
    label: "عکسی که دستیار نفهمید",
    detail: "دستیار از عکسی که مشتری فرستاد سر درنیاورد. خودتان نگاهش کنید و جواب بدهید.",
  },
  unsafe_reply: {
    label: "جواب دستیار فرستاده نشد",
    detail: "جوابی که دستیار نوشت از قواعد فروشگاه بیرون می‌زد و فرستاده نشد. خودتان جواب بدهید.",
  },
  empty_reply: {
    label: "دستیار جوابی نساخت",
    detail: `دستیار نتوانست برای این پیام جوابی بسازد. خودتان جواب بدهید؛ ${RETURN_HINT}`,
  },
  provider_failure: {
    label: "خطا در سرویس دستیار",
    detail: `سرویس دستیار موقتاً جواب نداد. خودتان جواب بدهید؛ ${RETURN_HINT}`,
  },
  flow_classification_unavailable: {
    label: "خطا در سرویس دستیار",
    detail: `دستیار نتوانست پیام را بررسی کند. خودتان جواب بدهید؛ ${RETURN_HINT}`,
  },
  out_of_credit: {
    label: "اعتبار دستیار تمام شد",
    detail: "اعتبار دستیار تمام شده است. خودتان جواب بدهید و برای ادامهٔ کار دستیار، اعتبار را شارژ کنید.",
  },
};

const BY_CLASS: Record<HandoffClass, HandoffExplanation | undefined> = {
  PAYMENT_VERIFICATION: {
    label: "بررسی رسید پرداخت",
    detail: "پرداختی باید بررسی شود. رسید را با حساب‌تان چک کنید و پرداخت سفارش را تأیید یا رد کنید.",
  },
  POLICY_REQUIRED: {
    label: "نیاز به تصمیم شما",
    detail: "این مورد را باید خودتان تصمیم بگیرید. جواب مشتری را بدهید.",
  },
  CLARIFICATION_EXHAUSTED: BY_REASON.clarification_exhausted,
  INTEGRATION_FAILURE: {
    label: "خطا در اتصال به سرویس",
    detail: `دستیار به یکی از سرویس‌ها دسترسی نداشت و حدس نزد. خودتان جواب بدهید؛ ${RETURN_HINT}`,
  },
  EXPLICIT_HUMAN_REQUEST: BY_REASON.customer_requested_human,
  HIGH_RISK_LOW_CONFIDENCE: BY_REASON.low_confidence_sensitive,
  SYSTEM_FAILURE: {
    label: "خطای سیستم",
    detail: `دستیار به خطا خورد و جوابی نفرستاد. خودتان جواب بدهید؛ ${RETURN_HINT}`,
  },
  NONE: undefined,
};

export const GENERIC_HANDOFF: HandoffExplanation = {
  label: "نیاز به پاسخ شما",
  detail: `دستیار این گفت‌وگو را به شما سپرد. خودتان جواب بدهید؛ ${RETURN_HINT}`,
};

export function explainHandoff(handoff: Conversation["handoff"]): HandoffExplanation {
  const byReason = handoff?.reason && Object.hasOwn(BY_REASON, handoff.reason) ? BY_REASON[handoff.reason] : undefined;
  return byReason ?? (handoff?.reason_class ? BY_CLASS[handoff.reason_class] : undefined) ?? GENERIC_HANDOFF;
}

export function handoffReasonLabel(handoff: Conversation["handoff"]): string {
  return explainHandoff(handoff).label;
}
