import type { Conversation } from "./model";

/*
 * Unread markers. The Partner API has no read state, so each seller remembers, per conversation, the
 * `last_message_at` they last opened it at. Both sides of a comparison are the API's clock, never the browser's.
 */

/** Conversation id → the `last_message_at` it was last opened at. */
export type SeenMap = Record<string, string>;

/** Older activity never counts as unread, so a seen entry past it can be dropped without a marker coming back. */
export const SEEN_HORIZON_MS = 30 * 24 * 3600_000;
/** The most entries one seller keeps per shop; the oldest go first. */
export const SEEN_MAX = 1000;

export function isUnread(
  c: Pick<Conversation, "id" | "last_message_at" | "last_message">,
  seen: SeenMap,
  now: number = Date.now(),
): boolean {
  if (c.last_message?.direction !== "in") return false;
  const last = Date.parse(c.last_message_at);
  if (!Number.isFinite(last) || last <= now - SEEN_HORIZON_MS) return false;
  const at = seen[c.id] ? Date.parse(seen[c.id]) : NaN;
  return !Number.isFinite(at) || last > at;
}

/** `map` with `id` seen at `at` (never moved back), entries past the horizon dropped and the size capped. */
export function withSeen(map: SeenMap, id: string, at: string, now: number = Date.now()): SeenMap {
  const next: SeenMap = { ...map };
  const prev = next[id] ? Date.parse(next[id]) : NaN;
  if (!Number.isFinite(prev) || Date.parse(at) > prev) next[id] = at;
  const live = Object.entries(next)
    .map(([k, v]) => [k, v, Date.parse(v)] as const)
    .filter(([, , t]) => Number.isFinite(t) && t > now - SEEN_HORIZON_MS)
    .sort((a, b) => b[2] - a[2])
    .slice(0, SEEN_MAX);
  return Object.fromEntries(live.map(([k, v]) => [k, v]));
}

const SEEN_EVENT = "sepordi:inbox-seen";

/** Tells the list beside an open thread at once; the stored mark follows through the server action. */
export function announceSeen(id: string, at: string): void {
  window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: { id, at } }));
}

export function onSeen(fn: (id: string, at: string) => void): () => void {
  const listener = (e: Event) => {
    const d = (e as CustomEvent<{ id?: unknown; at?: unknown }>).detail;
    if (typeof d?.id === "string" && typeof d.at === "string") fn(d.id, d.at);
  };
  window.addEventListener(SEEN_EVENT, listener);
  return () => window.removeEventListener(SEEN_EVENT, listener);
}
