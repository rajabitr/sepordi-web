import type { Schemas } from "@/server/bizin/schema";

import type { Tone } from "@/components/panel/orders/model";

/* Types, labels and rules of the returns screens; type-only imports, safe for client components. */

export type Case = Schemas["Case"];
export type CaseSummary = Schemas["CaseSummary"];
export type CaseState = Schemas["CaseState"];
export type CaseKind = Schemas["CaseKind"];
export type CaseAction = Schemas["CaseAction"]["action"];
export type CaseRejectReason = Schemas["RejectReason"];
export type CaseEvent = Schemas["CaseEvent"];

export const CASE_STATES: readonly CaseState[] = ["open", "awaiting_customer", "accepted", "rejected", "refunded", "exchanged", "closed"];
export const CASE_KINDS: readonly CaseKind[] = ["return", "exchange", "refund", "complaint", "issue"];

const STATE: Record<CaseState, { label: string; tone: Tone }> = {
  open: { label: "باز", tone: "warning" },
  awaiting_customer: { label: "منتظر پاسخ مشتری", tone: "brand" },
  accepted: { label: "پذیرفته‌شده", tone: "success" },
  rejected: { label: "ردشده", tone: "destructive" },
  refunded: { label: "پول برگشت داده شد", tone: "success" },
  exchanged: { label: "تعویض شد", tone: "success" },
  closed: { label: "بسته‌شده", tone: "secondary" },
};

const KIND: Record<CaseKind, string> = {
  return: "مرجوعی",
  exchange: "تعویض",
  refund: "بازگشت پول",
  complaint: "شکایت",
  issue: "مشکل ارسال",
};

const UNKNOWN = { label: "نامشخص", tone: "secondary" as Tone };
export const caseStateMeta = (s: string) => STATE[s as CaseState] ?? UNKNOWN;
export const caseKindLabel = (k: string) => KIND[k as CaseKind] ?? "درخواست دیگر";

export const CASE_REJECT_REASONS: { value: CaseRejectReason; label: string }[] = [
  { value: "outside_window", label: "مهلت مرجوعی گذشته است" },
  { value: "condition_not_met", label: "شرایط مرجوعی رعایت نشده" },
  { value: "item_not_returnable", label: "این کالا مرجوعی ندارد" },
  { value: "order_not_found", label: "سفارش پیدا نشد" },
  { value: "other", label: "سایر" },
];
export const caseRejectReasonLabel = (r: string | null) => CASE_REJECT_REASONS.find((x) => x.value === r)?.label ?? "سایر";

/**
 * The shop's decisions the API accepts from each state (partner-api.md §8.14): open → awaiting_customer, open or
 * awaiting_customer → accepted or rejected, accepted → refunded or exchanged, any open state → closed. The final states
 * (rejected, refunded, exchanged, closed) take none.
 */
const ACTIONS: Partial<Record<CaseState, CaseAction[]>> = {
  open: ["accept", "reject", "request_info", "close"],
  awaiting_customer: ["accept", "reject", "close"],
  accepted: ["mark_refunded", "mark_exchanged", "close"],
};

export function allowedCaseActions(state: string): CaseAction[] {
  return ACTIONS[state as CaseState] ?? [];
}

export const isFinalCaseState = (state: string) => allowedCaseActions(state).length === 0;

export const ACTION_META: Record<CaseAction, { button: string; title: (code: string) => string; hint: string; done: string; danger?: boolean }> = {
  accept: {
    button: "پذیرفتن درخواست",
    title: (c) => `درخواست ${c} را می‌پذیرید؟`,
    hint: "بعد از پذیرفتن، پول را خودتان برمی‌گردانید یا کالا را تعویض می‌کنید و همین‌جا ثبت می‌کنید.",
    done: "درخواست پذیرفته شد.",
  },
  reject: {
    button: "رد درخواست",
    title: (c) => `درخواست ${c} را رد می‌کنید؟`,
    hint: "دلیل رد با یک پیام ثابت به مشتری گفته می‌شود.",
    done: "درخواست رد شد.",
    danger: true,
  },
  request_info: {
    button: "درخواست توضیح بیشتر",
    title: (c) => `برای درخواست ${c} از مشتری توضیح بیشتر می‌خواهید؟`,
    hint: "با پیام بعدی مشتری، درخواست دوباره باز می‌شود.",
    done: "از مشتری توضیح بیشتر خواسته شد.",
  },
  mark_refunded: {
    button: "ثبت بازگشت پول",
    title: (c) => `بازگشت پول درخواست ${c} را ثبت می‌کنید؟`,
    hint: "سپردی پولی جابه‌جا نمی‌کند؛ این فقط ثبت واریزی است که خودتان انجام داده‌اید.",
    done: "بازگشت پول ثبت شد.",
  },
  mark_exchanged: {
    button: "ثبت تعویض",
    title: (c) => `تعویض کالای درخواست ${c} را ثبت می‌کنید؟`,
    hint: "این کار درخواست را می‌بندد.",
    done: "تعویض کالا ثبت شد.",
  },
  close: {
    button: "بستن درخواست",
    title: (c) => `درخواست ${c} را می‌بندید؟`,
    hint: "درخواست بسته‌شده دیگر قابل تغییر نیست.",
    done: "درخواست بسته شد.",
    danger: true,
  },
};

const EVENT: Record<CaseEvent["action"], string> = {
  opened: "ثبت درخواست",
  photo_added: "عکس اضافه شد",
  customer_replied: "پاسخ مشتری",
  request_info: "درخواست توضیح بیشتر",
  accept: "پذیرفته شد",
  reject: "رد شد",
  mark_refunded: "بازگشت پول ثبت شد",
  mark_exchanged: "تعویض ثبت شد",
  close: "بسته شد",
};
export const caseEventLabel = (a: string) => EVENT[a as CaseEvent["action"]] ?? "تغییر درخواست";

const ACTOR: Record<CaseEvent["actor"], string> = {
  customer: "مشتری",
  assistant: "دستیار هوشمند",
  partner: "سپردی",
  seller: "فروشگاه",
  system: "سیستم",
};
export const caseActorLabel = (a: string) => ACTOR[a as CaseEvent["actor"]] ?? "نامشخص";

const NOTICE: Record<NonNullable<CaseEvent["notice"]>, string> = {
  sent: "پیام به مشتری فرستاده شد",
  window_closed: "مهلت پاسخ در کانال تمام شده بود؛ پیام فرستاده نشد",
  blocked: "ارسال پیام به این مشتری مسدود بود؛ پیام فرستاده نشد",
  failed: "پیام به مشتری نرسید",
};
export const caseNoticeLabel = (n: string | null) => (n ? (NOTICE[n as keyof typeof NOTICE] ?? null) : null);

// ---- list filters and the URL ------------------------------------------------------------------------------

export interface CaseFilters {
  state?: CaseState;
  kind?: CaseKind;
  cursor?: string;
  back: string[];
}

type RawParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const MAX_BACK = 30;

export function parseCaseFilters(sp: RawParams): CaseFilters {
  const state = one(sp.state);
  const kind = one(sp.kind);
  const cursor = one(sp.cursor);
  return {
    state: CASE_STATES.includes(state as CaseState) ? (state as CaseState) : undefined,
    kind: CASE_KINDS.includes(kind as CaseKind) ? (kind as CaseKind) : undefined,
    cursor: cursor || undefined,
    back: cursor ? many(sp.back).slice(-MAX_BACK) : [],
  };
}

export function casesHref(f: Partial<CaseFilters>): string {
  const qs = new URLSearchParams();
  if (f.state) qs.set("state", f.state);
  if (f.kind) qs.set("kind", f.kind);
  if (f.cursor) {
    qs.set("cursor", f.cursor);
    for (const b of (f.back ?? []).slice(-MAX_BACK)) qs.append("back", b);
  }
  const s = qs.toString();
  return s ? `/panel/returns?${s}` : "/panel/returns";
}

/** A filter change: the other filters stay, the page goes back to the first. */
export function filteredCasesHref(f: Partial<CaseFilters>, change: Partial<CaseFilters>): string {
  return casesHref({ state: f.state, kind: f.kind, ...change, cursor: undefined, back: [] });
}

export const nextCasesHref = (f: CaseFilters, nextCursor: string) =>
  casesHref({ ...f, cursor: nextCursor, back: [...f.back, f.cursor ?? ""] });

export function prevCasesHref(f: CaseFilters): string | undefined {
  if (!f.cursor) return undefined;
  const prev = f.back.at(-1) ?? "";
  return casesHref({ ...f, cursor: prev || undefined, back: f.back.slice(0, -1) });
}
