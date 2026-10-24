import "server-only";

import { settings } from "@/server/db/repo";
import { can } from "@/server/team/roles";

import { NOTIFY_TYPES, type NotifyType } from "./events";

/** The switches of /panel/settings/notifications; import.completed answers a seller's own action and has none. */
export const NOTIFY_FAMILIES = ["conversations", "orders", "returns", "bookings", "channels", "credit"] as const;

export type NotifyFamily = (typeof NOTIFY_FAMILIES)[number];

export const FAMILY_TYPES: Record<NotifyFamily, readonly NotifyType[]> = {
  conversations: ["handoff.raised", "handoff.released", "message.received"],
  orders: ["order.created", "order.status_changed", "payment.evidence_received"],
  returns: ["case.opened", "case.updated"],
  bookings: ["booking.created", "booking.status_changed", "booking.rescheduled", "booking.receipt_received"],
  channels: ["channel.connected", "channel.disconnected", "channel.health_changed"],
  credit: ["credit.exhausted"],
};

export interface NotifyPrefs {
  muted: NotifyFamily[];
}

const key = (userId: string, shopId: string) => `notify_prefs:${userId}:${shopId}`;

export function isNotifyFamily(v: unknown): v is NotifyFamily {
  return typeof v === "string" && (NOTIFY_FAMILIES as readonly string[]).includes(v);
}

/** Per user and shop: one teammate muting orders leaves the owner's bell as it was. */
export function getNotifyPrefs(userId: string, shopId: string): NotifyPrefs {
  const stored = settings.get<{ muted?: unknown }>(key(userId, shopId));
  const muted = Array.isArray(stored?.muted) ? stored.muted.filter(isNotifyFamily) : [];
  return { muted: NOTIFY_FAMILIES.filter((f) => muted.includes(f)) };
}

export function setNotifyPrefs(userId: string, shopId: string, muted: readonly unknown[]): NotifyPrefs {
  const prefs: NotifyPrefs = { muted: NOTIFY_FAMILIES.filter((f) => muted.includes(f)) };
  settings.set(key(userId, shopId), prefs);
  return prefs;
}

/** The families a member of this role is told about: every item links to a page the role must be able to open. */
export function familiesFor(role: string): NotifyFamily[] {
  return NOTIFY_FAMILIES.filter((f) => f !== "bookings" || can(role, "booking.view"));
}

/** The event types the bell shows for these preferences and this role. */
export function visibleTypes(prefs: NotifyPrefs, role: string): NotifyType[] {
  const shown = familiesFor(role);
  const hidden = new Set<NotifyType>(NOTIFY_FAMILIES.filter((f) => prefs.muted.includes(f) || !shown.includes(f)).flatMap((f) => FAMILY_TYPES[f]));
  return NOTIFY_TYPES.filter((t) => !hidden.has(t));
}
