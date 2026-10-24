import "server-only";

import { randomUUID } from "node:crypto";

import { getDb } from "@/server/db";

import type { ActivityAction, ActivityGroup } from "./labels";

export { ACTIVITY_ACTIONS, ACTIVITY_GROUPS, activityLabel, isActivityGroup, type ActivityAction, type ActivityGroup } from "./labels";

/** The acting member, straight from the guard's context: shop and user ids never come from the browser. */
export interface ActivityActor {
  shop: { id: string };
  user: { id: string };
}

export interface ActivityTarget {
  type: string;
  id?: string | number | null;
}

export interface ActivityRow {
  id: string;
  shop_id: string;
  user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: string | null;
  created_at: string;
  display_name: string | null;
  phone: string | null;
}

/**
 * Records one finished change. Call it after the change succeeded, never before: a refused or failed action leaves
 * no row. Never throws; a lost log line must not undo a seller's work.
 */
export function recordActivity(ctx: ActivityActor, action: ActivityAction, target?: ActivityTarget | null, meta?: Record<string, unknown>): void {
  try {
    getDb()
      .prepare("INSERT INTO activity_log (id, shop_id, user_id, action, target_type, target_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        randomUUID(),
        ctx.shop.id,
        ctx.user.id,
        action,
        target?.type ?? null,
        target?.id == null ? null : String(target.id).slice(0, 128),
        meta ? JSON.stringify(meta).slice(0, 4000) : null,
        new Date().toISOString(),
      );
  } catch (e) {
    console.error("[sepordi audit] recordActivity failed", action, e instanceof Error ? e.message : e);
  }
}

export interface ActivityFilter {
  userId?: string;
  group?: ActivityGroup;
  /** ISO instants, inclusive from, exclusive to. */
  from?: string;
  to?: string;
  limit?: number;
  /** created_at of the last row of the previous page. */
  before?: string;
}

/** One shop's log, newest first. `shopId` is always the caller's own shop from the session. */
export function listActivity(shopId: string, f: ActivityFilter = {}): ActivityRow[] {
  const where = ["a.shop_id = ?"];
  const args: (string | number)[] = [shopId];
  if (f.userId) {
    where.push("a.user_id = ?");
    args.push(f.userId);
  }
  if (f.group) {
    where.push("a.action LIKE ?");
    args.push(`${f.group}.%`);
  }
  if (f.from) {
    where.push("a.created_at >= ?");
    args.push(f.from);
  }
  if (f.to) {
    where.push("a.created_at < ?");
    args.push(f.to);
  }
  if (f.before) {
    where.push("a.created_at < ?");
    args.push(f.before);
  }
  args.push(Math.min(Math.max(f.limit ?? 50, 1), 200));
  return getDb()
    .prepare(
      `SELECT a.*, u.display_name, u.phone FROM activity_log a LEFT JOIN users u ON u.id = a.user_id WHERE ${where.join(" AND ")} ORDER BY a.created_at DESC LIMIT ?`,
    )
    .all(...args) as unknown as ActivityRow[];
}
