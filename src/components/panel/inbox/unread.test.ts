import { describe, expect, it } from "vitest";

import type { Message } from "./model";
import { isUnread, SEEN_HORIZON_MS, SEEN_MAX, withSeen } from "./unread";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const conv = (lastAt: string, direction: Message["direction"] | null = "in") => ({
  id: "c1",
  last_message_at: lastAt,
  last_message: direction ? ({ direction } as Message) : null,
});

describe("unread rule", () => {
  it("is unread when the last message is inbound and newer than the seen mark", () => {
    expect(isUnread(conv(at(5)), { c1: at(10) }, NOW)).toBe(true);
    expect(isUnread(conv(at(5)), {}, NOW)).toBe(true);
  });

  it("is read once seen at or after the last message", () => {
    expect(isUnread(conv(at(5)), { c1: at(5) }, NOW)).toBe(false);
    expect(isUnread(conv(at(5)), { c1: at(1) }, NOW)).toBe(false);
  });

  it("is never unread when the seller, the assistant or nobody spoke last", () => {
    expect(isUnread(conv(at(5), "out"), {}, NOW)).toBe(false);
    expect(isUnread(conv(at(5), null), {}, NOW)).toBe(false);
  });

  it("ignores activity past the horizon, so pruned marks never bring a dot back", () => {
    expect(isUnread(conv(new Date(NOW - SEEN_HORIZON_MS - 1).toISOString()), {}, NOW)).toBe(false);
  });

  it("an unparseable mark counts as never seen", () => {
    expect(isUnread(conv(at(5)), { c1: "garbage" }, NOW)).toBe(true);
  });
});

describe("withSeen", () => {
  it("never moves a mark back", () => {
    expect(withSeen({ c1: at(1) }, "c1", at(9), NOW)).toEqual({ c1: at(1) });
    expect(withSeen({ c1: at(9) }, "c1", at(1), NOW)).toEqual({ c1: at(1) });
  });

  it("drops marks past the horizon and keeps the newest when full", () => {
    expect(withSeen({ old: new Date(NOW - SEEN_HORIZON_MS).toISOString() }, "c1", at(1), NOW)).toEqual({ c1: at(1) });
    const full = Object.fromEntries(Array.from({ length: SEEN_MAX }, (_, i) => [`k${i}`, at(10 + i)]));
    const next = withSeen(full, "fresh", at(1), NOW);
    expect(Object.keys(next)).toHaveLength(SEEN_MAX);
    expect(next.fresh).toBe(at(1));
    expect(next[`k${SEEN_MAX - 1}`]).toBeUndefined();
  });
});
