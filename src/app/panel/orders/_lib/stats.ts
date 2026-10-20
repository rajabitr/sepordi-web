import "server-only";

import { tehranTodayAndWeek, type Order } from "@/components/panel/orders/model";
import { listOrders } from "@/server/bizin/client";

/*
 * The four counters above the orders list. There is no count route, so each is one small list call; the Partner API
 * budget (120 requests a minute for every seller together) is why the result is kept per shop for a short while and
 * dropped after the seller's own changes.
 */

const LIMIT = 50;
const TTL_MS = 30_000;

/** `more` is true when the counter reached the page size and the real number is larger. */
export interface Counter {
  count: number;
  more: boolean;
}

export interface OrderStats {
  today: Counter;
  pendingReceipts: Counter;
  readyToShip: Counter;
  deliveredThisWeek: Counter;
}

const cache = new Map<string, { at: number; stats: Promise<OrderStats> }>();

const counter = (orders: Order[], nextCursor: string | null): Counter => ({ count: orders.length, more: nextCursor !== null });

async function load(ext: string): Promise<OrderStats> {
  const { today, week } = tehranTodayAndWeek();
  const [todays, pending, paid, packing, delivered] = await Promise.all([
    listOrders(ext, { since: today.toISOString(), limit: LIMIT }),
    listOrders(ext, { payment_status: "pending_verification", limit: LIMIT }),
    listOrders(ext, { status: "paid", limit: LIMIT }),
    listOrders(ext, { status: "packing", limit: LIMIT }),
    listOrders(ext, { status: "delivered", limit: LIMIT }),
  ]);
  // No delivered_at exists: a delivered order is final, so its last update is the delivery.
  const deliveredThisWeek = delivered.orders.filter((o) => Date.parse(o.updated_at) >= week.getTime());
  const deliveredMore = delivered.next_cursor !== null && deliveredThisWeek.length === delivered.orders.length;
  return {
    today: counter(todays.orders, todays.next_cursor),
    pendingReceipts: counter(pending.orders, pending.next_cursor),
    readyToShip: {
      count: paid.orders.length + packing.orders.length,
      more: paid.next_cursor !== null || packing.next_cursor !== null,
    },
    deliveredThisWeek: { count: deliveredThisWeek.length, more: deliveredMore },
  };
}

export function getOrderStats(ext: string): Promise<OrderStats> {
  const hit = cache.get(ext);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.stats;
  const stats = load(ext);
  cache.set(ext, { at: Date.now(), stats });
  stats.catch(() => {
    if (cache.get(ext)?.stats === stats) cache.delete(ext);
  });
  return stats;
}

export function forgetOrderStats(ext: string): void {
  cache.delete(ext);
}
