import "server-only";

import { settings } from "@/server/db/repo";
import { withSeen, type SeenMap } from "@/components/panel/inbox/unread";

/** Per seller and shop, so an agent's reading never clears the owner's markers and a shop switch starts clean. */
export const seenKey = (userId: string, shopId: string) => `inbox_seen:${userId}:${shopId}`;

export function loadSeen(userId: string, shopId: string): SeenMap {
  const v = settings.get<unknown>(seenKey(userId, shopId));
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"));
}

export function markSeen(userId: string, shopId: string, conversationId: string, at: string, now: number = Date.now()): SeenMap {
  const next = withSeen(loadSeen(userId, shopId), conversationId, at, now);
  settings.set(seenKey(userId, shopId), next);
  return next;
}

/** Only the entries of the conversations on one page, for the list. */
export function seenFor(map: SeenMap, ids: readonly string[]): SeenMap {
  return Object.fromEntries(ids.filter((id) => Object.hasOwn(map, id)).map((id) => [id, map[id]]));
}
