import { en } from "@/lib/utils";

/* What a seller reads about a channel account. Pure and client-safe; the pages hand in the API's channel rows. */

export type ChannelKind = "whatsapp" | "telegram" | "instagram";
export type ChannelStatus = "disconnected" | "pairing" | "connected" | "banned" | "error";
export type HealthState = "ok" | "quiet" | "degraded" | "broken" | "unknown";

export interface ChannelView {
  channel_id: string;
  kind: ChannelKind;
  status: ChannelStatus;
  connected_at: string | null;
  health?: { state: HealthState; reason: string; since: string } | null;
}

export const CHANNEL_ORDER: ChannelKind[] = ["whatsapp", "telegram", "instagram"];

export const CHANNEL_LABEL: Record<ChannelKind, string> = {
  whatsapp: "واتس‌اپ",
  telegram: "تلگرام",
  instagram: "اینستاگرام",
};

export const STATUS_LABEL: Record<ChannelStatus, string> = {
  connected: "وصل",
  pairing: "در حال اتصال",
  disconnected: "قطع",
  banned: "مسدود",
  error: "خطا",
};

export const STATUS_VARIANT: Record<ChannelStatus, "success" | "warning" | "secondary" | "destructive"> = {
  connected: "success",
  pairing: "warning",
  disconnected: "secondary",
  banned: "destructive",
  error: "destructive",
};

export const HEALTH_LABEL: Record<HealthState, string> = {
  ok: "سالم",
  quiet: "بی‌پیام",
  degraded: "اختلال",
  broken: "از کار افتاده",
  unknown: "هنوز بررسی نشده",
};

export const HEALTH_VARIANT: Record<HealthState, "success" | "secondary" | "warning" | "destructive"> = {
  ok: "success",
  quiet: "secondary",
  degraded: "warning",
  broken: "destructive",
  unknown: "secondary",
};

/** Every ChannelHealthReason token; `none` says nothing beyond the state. */
export const HEALTH_REASON_FA: Record<string, string> = {
  none: "",
  idle: "مدتی است پیامی نیامده، ولی اتصال سالم است.",
  unusual_silence: "برای این کانال، سکوت این‌قدر طولانی غیرعادی است. یک پیام آزمایشی بفرستید.",
  wa_socket_down: "اتصال واتس‌اپ موقتاً قطع شده است. گوشی را روشن و به اینترنت وصل نگه دارید.",
  wa_session_missing: "نشست واتس‌اپ از دست رفته است. کانال را جدا و دوباره وصل کنید.",
  tg_webhook_empty: "ربات تلگرام دیگر پیام‌ها را به دستیار نمی‌فرستد. کانال را جدا و دوباره وصل کنید.",
  tg_webhook_foreign: "سرویس دیگری ربات را در اختیار گرفته است. اگر ربات را جای دیگری هم وصل کرده‌اید، آن را جدا کنید.",
  tg_delivery_failing: "تلگرام در رساندن پیام‌ها به دستیار خطا می‌گیرد.",
  tg_updates_incomplete: "بعضی پیام‌های تلگرام به دستیار نمی‌رسد.",
  tg_token_rejected: "تلگرام توکن ربات را دیگر قبول نمی‌کند. توکن تازه بگیرید و دوباره وصل کنید.",
  ig_subscription_missing: "اینستاگرام پیام‌ها را برای دستیار نمی‌فرستد. کانال را جدا و دوباره وصل کنید.",
  ig_token_rejected: "اجازه‌ی دسترسی اینستاگرام باطل شده است. دوباره وصل کنید.",
  ig_token_expiring: "اجازه‌ی دسترسی اینستاگرام به‌زودی تمام می‌شود. دوباره وصل کنید.",
  ig_scope_missing: "یکی از دسترسی‌های لازم اینستاگرام داده نشده است. دوباره وصل کنید و همه‌ی دسترسی‌ها را بدهید.",
  probe_unreachable: "بررسی وضعیت این کانال الان ممکن نشد.",
};

export function healthReasonFa(reason: string): string {
  return HEALTH_REASON_FA[reason] ?? "";
}

/** The WhatsApp account whose pairing a 409 `whatsapp_pairing_in_progress` refers to: the newest one in `pairing`. */
export function pendingWhatsApp(channels: ChannelView[]): string | null {
  const pairing = channels.filter((c) => c.kind === "whatsapp" && c.status === "pairing");
  return pairing.length ? pairing[pairing.length - 1].channel_id : null;
}

// ---- WhatsApp pairing ------------------------------------------------------------------------------------

export type PairingStatus = "pending" | "qr" | "connected" | "failed" | "expired";

/** The QR dialog stops polling after this long even if Bizin still says pending. */
export const PAIRING_MAX_MS = 3 * 60_000;
export const PAIRING_POLL_MS = 3000;

/** What the dialog does after a poll answered `status`, `elapsedMs` after the pairing started. */
export function pairingNext(status: PairingStatus, elapsedMs: number): "poll" | "connected" | "restart" | "timeout" {
  if (status === "connected") return "connected";
  if (status === "failed" || status === "expired") return "restart";
  return elapsedMs >= PAIRING_MAX_MS ? "timeout" : "poll";
}

// ---- Telegram ---------------------------------------------------------------------------------------------

/** @BotFather's shape, as Bizin checks it: 5–16 digits, a colon, 30–64 of A–Z a–z 0–9 _ -. */
const TELEGRAM_TOKEN_RE = /^\d{5,16}:[A-Za-z0-9_-]{30,64}$/;

export function normalizeTelegramToken(input: string): string {
  return en(input).replace(/[\s‌‎‏]/g, "");
}

export function isTelegramToken(input: string): boolean {
  return TELEGRAM_TOKEN_RE.test(normalizeTelegramToken(input));
}

// ---- Instagram --------------------------------------------------------------------------------------------

/** The `reason` Bizin adds to return_url on a failed Instagram connect. */
export const INSTAGRAM_REASON_FA: Record<string, string> = {
  denied: "در صفحه‌ی اینستاگرام اجازه‌ی دسترسی داده نشد. دوباره امتحان کنید و «اجازه دادن» را بزنید.",
  state: "لینک اتصال منقضی یا قبلاً استفاده شده است. از همین صفحه دوباره شروع کنید.",
  browser: "اتصال باید در همان مرورگری تمام شود که شروعش کردید. دوباره از همین مرورگر امتحان کنید.",
  exchange: "اینستاگرام اتصال را تأیید نکرد. تا وقتی بررسی متا تمام نشده، فقط حساب‌های آزمایشی وصل می‌شوند و این خطا برای بقیه طبیعی است.",
  scope: "همه‌ی دسترسی‌های لازم داده نشد. دوباره وصل کنید و همه‌ی گزینه‌ها را تأیید کنید.",
  profile: "این حساب اینستاگرام حرفه‌ای (Business یا Creator) نیست یا اطلاعاتش خوانده نشد.",
  taken: "این حساب اینستاگرام به فروشگاه دیگری وصل است.",
  config: "اتصال اینستاگرام هنوز آماده نیست. بعداً امتحان کنید.",
  server: "مشکلی در سرور پیش آمد. چند دقیقه بعد دوباره امتحان کنید.",
};

export function instagramReasonFa(reason: string | undefined): string {
  return (reason && INSTAGRAM_REASON_FA[reason]) || "اتصال اینستاگرام کامل نشد. دوباره امتحان کنید.";
}
