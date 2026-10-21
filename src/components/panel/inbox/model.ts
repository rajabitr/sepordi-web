import type { Schemas } from "@/server/bizin/schema";

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

/** A failure as the seller reads it; the request id is for support. */
export interface FaError {
  message: string;
  code: string;
  requestId?: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: FaError };

export const STATES = ["handoff", "human", "ai"] as const satisfies readonly HandoffState[];
export const CHANNELS = ["whatsapp", "instagram", "telegram"] as const satisfies readonly ChannelKind[];
export const QUEUES = ["sales", "support", "accounting", "appointment", "fulfillment"] as const satisfies readonly HandoffQueue[];

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
}

const Q_MIN = 2;
const Q_MAX = 64;

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Reads the filters from a URL; anything unknown is dropped rather than sent to the API. */
export function filtersFromSearch(sp: Pick<URLSearchParams, "get">): ListFilters {
  const q = sp.get("q")?.trim().slice(0, Q_MAX);
  return {
    state: pick(sp.get("state"), STATES) ?? "all",
    channel: pick(sp.get("channel"), CHANNELS),
    queue: pick(sp.get("queue"), QUEUES),
    q: q && q.length >= Q_MIN ? q : undefined,
  };
}

/** The filters as a query string for our own URLs (empty values left out). */
export function filtersToSearch(f: ListFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.state !== "all") sp.set("state", f.state);
  if (f.channel) sp.set("channel", f.channel);
  if (f.queue) sp.set("queue", f.queue);
  if (f.q) sp.set("q", f.q);
  return sp;
}

/** The Partner API query for one list page. */
export function filtersToApiQuery(f: ListFilters, cursor?: string) {
  return {
    limit: 30,
    state: f.state === "all" ? undefined : [f.state],
    channel: f.channel,
    queue: f.queue ? [f.queue] : undefined,
    q: f.q,
    cursor: cursor || undefined,
  };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
