import type { Schemas } from "@/server/bizin/schema";
import { tehranDayStart } from "@/components/panel/orders/model";

/*
 * Inbox types, Farsi labels and pure helpers, shared by the route handlers, the actions and the client screens.
 * Type-only imports from the server keep this module free of server code at runtime.
 */

export type Conversation = Schemas["Conversation"];
export type Message = Schemas["Message"];
export type HandoffState = Schemas["HandoffState"];
export type ChannelKind = Schemas["ChannelKind"];
export type HandoffQueue = Schemas["HandoffQueue"];
export type HandoffPriority = Schemas["HandoffPriority"];
export type HandoffClass = Schemas["HandoffClass"];
export type ConversationStatus = Conversation["status"];

/** A failure as the seller reads it; the request id is for support. */
export interface FaError {
  message: string;
  code: string;
  requestId?: string;
}

/** The shop's partner contract has no `inbox.api` (403 on every inbox route): a plan matter, never a failure. */
export const NOT_ENTITLED: FaError = { message: "این بخش در پلن فروشگاه شما فعال نیست", code: "feature_not_entitled" };

export function notEntitled(e: Pick<FaError, "code"> | null | undefined): boolean {
  return e?.code === NOT_ENTITLED.code;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: FaError };

export const STATES = ["handoff", "human", "ai"] as const satisfies readonly HandoffState[];
export const CHANNELS = ["whatsapp", "instagram", "telegram"] as const satisfies readonly ChannelKind[];
export const QUEUES = ["sales", "support", "accounting", "appointment", "fulfillment"] as const satisfies readonly HandoffQueue[];
export const PRIORITIES = ["urgent", "high", "normal", "low"] as const satisfies readonly HandoffPriority[];
export const STATUSES = ["open", "snoozed", "closed"] as const satisfies readonly ConversationStatus[];
export const REASON_CLASSES = [
  "EXPLICIT_HUMAN_REQUEST",
  "PAYMENT_VERIFICATION",
  "POLICY_REQUIRED",
  "CLARIFICATION_EXHAUSTED",
  "HIGH_RISK_LOW_CONFIDENCE",
  "INTEGRATION_FAILURE",
  "SYSTEM_FAILURE",
] as const satisfies readonly HandoffClass[];

export const STATE_LABEL: Record<HandoffState, string> = {
  handoff: "نیازمند شما",
  human: "در دست شما",
  ai: "دستیار",
};

export const CHANNEL_LABEL: Record<ChannelKind, string> = {
  whatsapp: "واتس‌اپ",
  instagram: "اینستاگرام",
  telegram: "تلگرام",
};

export const QUEUE_LABEL: Record<HandoffQueue, string> = {
  sales: "فروش",
  support: "پشتیبانی",
  accounting: "حسابداری",
  appointment: "نوبت",
  fulfillment: "ارسال",
};

export const PRIORITY_LABEL: Record<HandoffPriority, string> = {
  low: "اولویت کم",
  normal: "اولویت عادی",
  high: "اولویت بالا",
  urgent: "فوری",
};

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: "باز",
  snoozed: "به تعویق افتاده",
  closed: "بسته",
};

export const MESSAGE_STATUS_LABEL: Record<Message["status"], string> = {
  received: "دریافت شد",
  sent: "ارسال شد",
  delivered: "رسید",
  read: "خوانده شد",
  failed: "نرسید",
};

export function customerName(c: Pick<Conversation, "customer">): string {
  return c.customer.display_name?.trim() || c.customer.phone || "مشتری بی‌نام";
}

export function messagePreview(m: Message | null): string {
  if (!m) return "هنوز پیامی نیست";
  const text = m.text.trim();
  if (m.kind === "text") return text || "پیام خالی";
  const kind: Record<Exclude<Message["kind"], "text">, string> = {
    image: "عکس",
    video: "ویدیو",
    audio: "پیام صوتی",
    document: "فایل",
    sticker: "استیکر",
    other: "پیوست",
  };
  return text ? `${kind[m.kind]}: ${text}` : kind[m.kind];
}

/** Instagram's 24 h window; the API sets the deadline only where a channel has one. */
export function replyWindowClosed(c: Pick<Conversation, "reply_window_closes_at">, now: number = Date.now()): boolean {
  if (!c.reply_window_closes_at) return false;
  const at = Date.parse(c.reply_window_closes_at);
  return Number.isFinite(at) && at <= now;
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

export function imageAllowed(channel: ChannelKind): boolean {
  return channel !== "instagram";
}

/** Text cap per channel (Instagram 1000, others 4096); a caption is 1024. */
export function textLimit(channel: ChannelKind): number {
  return channel === "instagram" ? 1000 : 4096;
}
export const CAPTION_LIMIT = 1024;

/** Merges pages by id (a re-read or a late message must not duplicate) and keeps the thread oldest-first. */
export function mergeMessages(current: readonly Message[], incoming: readonly Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => {
    const d = Date.parse(a.created_at) - Date.parse(b.created_at);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/** Why the composer is closed, or null when the seller may write. */
export type ComposerBlock = { title: string; detail: string } | null;

export function imageProblem(file: Pick<File, "type" | "size">): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "عکس باید JPEG یا PNG باشد.";
  if (file.size > MAX_IMAGE_BYTES) return "حجم عکس باید حداکثر ۸ مگابایت باشد.";
  return null;
}

export function composerBlock(c: Conversation, now: number): ComposerBlock {
  if (!c.last_customer_message_at) {
    return { title: "مشتری هنوز پیامی نداده است", detail: "تا مشتری در این گفت‌وگو پیام ندهد، نمی‌شود برایش پیام فرستاد." };
  }
  if (replyWindowClosed(c, now)) {
    return {
      title: "مهلت پاسخ تمام شده است",
      detail: `در ${CHANNEL_LABEL[c.channel_kind]} فقط تا ۲۴ ساعت بعد از آخرین پیام مشتری می‌شود جواب داد. وقتی مشتری دوباره پیام بدهد، می‌توانید بنویسید.`,
    };
  }
  return null;
}

// ---- list filters -----------------------------------------------------------------------------------------

export type StateTab = "all" | HandoffState;

export interface ListFilters {
  state: StateTab;
  channel?: ChannelKind;
  queue?: HandoffQueue;
  q?: string;
  priority?: HandoffPriority;
  reasonClass?: HandoffClass;
  status?: ConversationStatus;
  hasOrder?: boolean;
  /** The last Tehran calendar day included, YYYY-MM-DD. */
  until?: string;
}

const Q_MIN = 2;
const Q_MAX = 64;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 3600_000;

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function pickDay(value: string | null | undefined): string | undefined {
  if (!value || !DAY_RE.test(value)) return undefined;
  const at = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(at.getTime()) && at.toISOString().slice(0, 10) === value ? value : undefined;
}

/** Reads the filters from a URL; anything unknown is dropped rather than sent to the API. */
export function filtersFromSearch(sp: Pick<URLSearchParams, "get">): ListFilters {
  const q = sp.get("q")?.trim().slice(0, Q_MAX);
  const hasOrder = sp.get("has_order");
  return {
    state: pick(sp.get("state"), STATES) ?? "all",
    channel: pick(sp.get("channel"), CHANNELS),
    queue: pick(sp.get("queue"), QUEUES),
    q: q && q.length >= Q_MIN ? q : undefined,
    priority: pick(sp.get("priority"), PRIORITIES),
    reasonClass: pick(sp.get("reason_class"), REASON_CLASSES),
    status: pick(sp.get("status"), STATUSES),
    hasOrder: hasOrder === "true" ? true : hasOrder === "false" ? false : undefined,
    until: pickDay(sp.get("until")),
  };
}

/** The filters as a query string for our own URLs (empty values left out). */
export function filtersToSearch(f: ListFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.state !== "all") sp.set("state", f.state);
  if (f.channel) sp.set("channel", f.channel);
  if (f.queue) sp.set("queue", f.queue);
  if (f.q) sp.set("q", f.q);
  if (f.priority) sp.set("priority", f.priority);
  if (f.reasonClass) sp.set("reason_class", f.reasonClass);
  if (f.status) sp.set("status", f.status);
  if (f.hasOrder !== undefined) sp.set("has_order", String(f.hasOrder));
  if (f.until) sp.set("until", f.until);
  return sp;
}

/** How many of the filters behind the «فیلترها» sheet are set (state, channel and search sit outside it). */
export function sheetFilterCount(f: ListFilters): number {
  return [f.queue, f.priority, f.reasonClass, f.status, f.hasOrder, f.until].filter((v) => v !== undefined).length;
}

/** The Partner API query for one list page. `until` is exclusive there, so the picked day ends at the next Tehran midnight. */
export function filtersToApiQuery(f: ListFilters, cursor?: string) {
  return {
    limit: 30,
    state: f.state === "all" ? undefined : [f.state],
    channel: f.channel,
    queue: f.queue ? [f.queue] : undefined,
    q: f.q,
    priority: f.priority ? [f.priority] : undefined,
    reason_class: f.reasonClass ? [f.reasonClass] : undefined,
    status: f.status ? [f.status] : undefined,
    has_order: f.hasOrder,
    until: f.until ? new Date(tehranDayStart(f.until).getTime() + DAY_MS).toISOString() : undefined,
    cursor: cursor || undefined,
  };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
