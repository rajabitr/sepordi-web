/*
 * The one place a team role becomes access. Pages, Server Actions, Route Handlers and the menu all ask `can()`;
 * none compares role names. Pure data: the client menu imports it too.
 */

export const MEMBER_ROLES = ["owner", "agent", "responder", "finance", "fulfillment"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ROLE_FA: Record<MemberRole, string> = {
  owner: "مالک",
  agent: "کارشناس",
  responder: "پاسخ‌گو",
  finance: "مالی",
  fulfillment: "انبار و ارسال",
};

export const ROLE_HINT_FA: Record<MemberRole, string> = {
  owner: "همه‌چیز، از جمله تیم، پرداخت، کانال‌ها، خرید اعتبار و دستیار",
  agent: "صندوق پیام، سفارش‌ها، نوبت‌ها، محصولات و مرجوعی‌ها",
  responder: "فقط صندوق پیام",
  finance: "سفارش‌ها، دیدن نوبت‌ها، تأیید یا رد رسید، دیدن اعتبار و فعالیت‌ها",
  fulfillment: "وضعیت سفارش‌ها، دیدن نوبت‌ها، محصولات و دیدن تنظیمات ارسال",
};

export type Capability =
  | "dashboard.view"
  | "inbox.view"
  | "inbox.reply"
  | "orders.view"
  | "orders.status"
  | "orders.payment"
  | "products.view"
  | "products.edit"
  | "returns.view"
  | "returns.manage"
  | "booking.view"
  | "booking.manage"
  | "shipping.view"
  | "shipping.edit"
  | "credit.view"
  | "credit.buy"
  | "payments.manage"
  | "channels.manage"
  | "assistant.manage"
  | "team.manage"
  | "activity.view";

const AGENT: readonly Capability[] = [
  "dashboard.view",
  "inbox.view",
  "inbox.reply",
  "orders.view",
  "orders.status",
  "orders.payment",
  "products.view",
  "products.edit",
  "returns.view",
  "returns.manage",
  "booking.view",
  "booking.manage",
];

export const ROLE_CAPABILITIES: Record<MemberRole, readonly Capability[]> = {
  owner: [
    ...AGENT,
    "shipping.view",
    "shipping.edit",
    "credit.view",
    "credit.buy",
    "payments.manage",
    "channels.manage",
    "assistant.manage",
    "team.manage",
    "activity.view",
  ],
  agent: AGENT,
  responder: ["dashboard.view", "inbox.view", "inbox.reply"],
  finance: ["dashboard.view", "orders.view", "orders.payment", "booking.view", "credit.view", "activity.view"],
  fulfillment: ["dashboard.view", "orders.view", "orders.status", "booking.view", "products.view", "products.edit", "shipping.view"],
};

export function isMemberRole(v: unknown): v is MemberRole {
  return typeof v === "string" && (MEMBER_ROLES as readonly string[]).includes(v);
}

/** False for an unknown role: a row written by a newer build grants nothing here. */
export function can(role: string | undefined | null, cap: Capability): boolean {
  return isMemberRole(role) && ROLE_CAPABILITIES[role].includes(cap);
}
