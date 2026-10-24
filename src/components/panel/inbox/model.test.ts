import { describe, expect, it } from "vitest";

import {
  composerBlock,
  filtersFromSearch,
  filtersToApiQuery,
  filtersToSearch,
  imageProblem,
  mergeMessages,
  replyWindowClosed,
  sheetFilterCount,
  type Conversation,
  type Message,
} from "./model";

const msg = (id: string, at: string): Message => ({
  id,
  conversation_id: "c",
  direction: "in",
  sender: "customer",
  kind: "text",
  text: id,
  status: "received",
  created_at: at,
  media: null,
});

describe("mergeMessages", () => {
  it("de-duplicates by id and keeps the thread oldest-first, a late message landing in its place", () => {
    const a = msg("a", "2026-10-20T10:00:00Z");
    const b = msg("b", "2026-10-20T10:05:00Z");
    const late = msg("late", "2026-10-20T10:02:00Z");
    const updatedB = { ...b, status: "read" as const };
    const out = mergeMessages([a, b], [updatedB, late, a]);
    expect(out.map((m) => m.id)).toEqual(["a", "late", "b"]);
    expect(out[2].status).toBe("read");
  });
});

describe("list filters", () => {
  it("drops unknown values and a too-short search instead of sending them to the API", () => {
    const f = filtersFromSearch(new URLSearchParams("state=bogus&channel=sms&queue=sales&q=a"));
    expect(f).toEqual({ state: "all", channel: undefined, queue: "sales", q: undefined });
  });

  it("round-trips through our URL and maps to the API query", () => {
    const f = filtersFromSearch(new URLSearchParams("state=handoff&channel=instagram&q=%20سارا%20"));
    expect(filtersToSearch(f).toString()).toBe(new URLSearchParams({ state: "handoff", channel: "instagram", q: "سارا" }).toString());
    expect(filtersToApiQuery(f, "cur")).toEqual({ limit: 30, state: ["handoff"], channel: "instagram", queue: undefined, q: "سارا", cursor: "cur" });
    expect(filtersToApiQuery({ state: "all" }).state).toBeUndefined();
  });
});

describe("sheet filters", () => {
  it("round-trip through the URL and count only what the sheet holds", () => {
    const qs = "queue=support&priority=high&reason_class=SYSTEM_FAILURE&status=closed&has_order=true&until=2026-03-20";
    const f = filtersFromSearch(new URLSearchParams(qs));
    expect(f).toMatchObject({ queue: "support", priority: "high", reasonClass: "SYSTEM_FAILURE", status: "closed", hasOrder: true, until: "2026-03-20" });
    expect(filtersToSearch(f).toString()).toBe(qs);
    expect(sheetFilterCount(f)).toBe(6);
    expect(sheetFilterCount(filtersFromSearch(new URLSearchParams("state=ai&channel=telegram&q=سارا")))).toBe(0);
  });

  it("keeps has_order=false, which is a filter and not an empty value", () => {
    const f = filtersFromSearch(new URLSearchParams("has_order=false"));
    expect(f.hasOrder).toBe(false);
    expect(filtersToApiQuery(f).has_order).toBe(false);
    expect(filtersToSearch(f).toString()).toBe("has_order=false");
  });

  it("ends the picked Tehran day at the next Tehran midnight, in UTC", () => {
    expect(filtersToApiQuery({ state: "all", until: "2026-03-20" }).until).toBe("2026-03-20T20:30:00.000Z");
    expect(filtersFromSearch(new URLSearchParams("until=2026-13-01")).until).toBeUndefined();
  });
});

describe("reply window and composer", () => {
  const base = {
    channel_kind: "instagram",
    last_customer_message_at: "2026-10-19T09:00:00Z",
    reply_window_closes_at: "2026-10-20T09:00:00Z",
  } as Conversation;
  const before = Date.parse("2026-10-20T08:59:00Z");
  const after = Date.parse("2026-10-20T09:00:00Z");

  it("closes the composer once the deadline has passed, and only then", () => {
    expect(replyWindowClosed(base, before)).toBe(false);
    expect(replyWindowClosed(base, after)).toBe(true);
    expect(composerBlock(base, before)).toBeNull();
    expect(composerBlock(base, after)?.title).toBe("مهلت پاسخ تمام شده است");
    expect(replyWindowClosed({ reply_window_closes_at: null }, after)).toBe(false);
  });

  it("refuses a first message when the customer never wrote", () => {
    expect(composerBlock({ ...base, last_customer_message_at: null }, before)?.title).toBe("مشتری هنوز پیامی نداده است");
  });

  it("accepts only JPEG or PNG within 8 MB", () => {
    expect(imageProblem({ type: "image/png", size: 8 * 1024 * 1024 })).toBeNull();
    expect(imageProblem({ type: "image/png", size: 8 * 1024 * 1024 + 1 })).toMatch("۸ مگابایت");
    expect(imageProblem({ type: "image/webp", size: 10 })).toMatch("JPEG یا PNG");
  });
});
