import "server-only";

/*
 * In-memory fixed windows, per server process. Enough for one Node instance behind Caddy; a second instance
 * would need a shared store.
 */

const KEY = Symbol.for("sepordi.rate-limit");
type Buckets = Map<string, { count: number; resetAt: number }>;
type WithBuckets = typeof globalThis & { [KEY]?: Buckets };

function buckets(): Buckets {
  const g = globalThis as WithBuckets;
  g[KEY] ??= new Map();
  return g[KEY];
}

export interface Limit {
  max: number;
  windowMs: number;
}

/** Counts one hit; false (with the seconds to wait) once `max` hits fall in the current window. */
export function hit(key: string, limit: Limit, now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const map = buckets();
  if (map.size > 50_000) for (const [k, b] of map) if (b.resetAt <= now) map.delete(k);
  const b = map.get(key);
  if (!b || b.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { ok: true };
  }
  if (b.count >= limit.max) return { ok: false, retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000) };
  b.count++;
  return { ok: true };
}

export function resetRateLimits(): void {
  buckets().clear();
}
