import { describe, expect, it } from "vitest";

import {
  activeTab,
  filteredOrdersHref,
  allowedOrderMoves,
  nextPageHref,
  orderTimeline,
  ordersHref,
  parseOrderFilters,
  prevPageHref,
  tehranDay,
  tehranDayStart,
  tehranTodayAndWeek,
  type Order,
} from "./model";

describe("allowedOrderMoves", () => {
  it("follows the Partner API's fulfilment moves", () => {
    expect(allowedOrderMoves("draft")).toEqual(["cancelled"]);
    expect(allowedOrderMoves("confirmed")).toEqual(["cancelled"]);
    expect(allowedOrderMoves("paid")).toEqual(["packing", "shipped", "cancelled"]);
    expect(allowedOrderMoves("packing")).toEqual(["shipped", "cancelled"]);
    expect(allowedOrderMoves("shipped")).toEqual(["delivered"]);
  });

  it("offers nothing from a final or unknown status, and never paid", () => {
    expect(allowedOrderMoves("delivered")).toEqual([]);
    expect(allowedOrderMoves("cancelled")).toEqual([]);
    expect(allowedOrderMoves("refunding")).toEqual([]);
    for (const s of ["draft", "confirmed", "paid", "packing", "shipped"]) {
      expect(allowedOrderMoves(s)).not.toContain("paid");
    }
  });
});

describe("order list URL", () => {
  it("drops values the API would refuse", () => {
    const f = parseOrderFilters({ status: "lost", payment: "pending_verification", from: "2026-13-45x", back: ["a"] });
    expect(f).toEqual({ status: undefined, payment: "pending_verification", from: undefined, cursor: undefined, back: [] });
  });

  it("walks forward and back through cursor pages keeping the filters", () => {
    const first = parseOrderFilters({ status: "paid" });
    const second = nextPageHref(first, "c2");
    expect(second).toBe("/panel/orders?status=paid&cursor=c2&back=");
    const f2 = parseOrderFilters(Object.fromEntries(new URLSearchParams(second.split("?")[1])));
    expect(f2.back).toEqual([""]);
    const sp3 = new URLSearchParams(nextPageHref(f2, "c3").split("?")[1]);
    const f3 = parseOrderFilters({ status: sp3.get("status") ?? undefined, cursor: sp3.get("cursor") ?? undefined, back: sp3.getAll("back") });
    expect(f3.back).toEqual(["", "c2"]);
    expect(prevPageHref(f3)).toBe("/panel/orders?status=paid&cursor=c2&back=");
    expect(prevPageHref(f2)).toBe("/panel/orders?status=paid");
    expect(prevPageHref(first)).toBeUndefined();
  });

  it("starts a filter change from the first page", () => {
    const onPage3 = parseOrderFilters({ status: "paid", from: "2026-10-01", cursor: "c3", back: ["", "c2"] });
    expect(filteredOrdersHref(onPage3, { payment: "paid" })).toBe("/panel/orders?status=paid&payment=paid&from=2026-10-01");
  });

  it("matches a tab only to its exact filters", () => {
    expect(activeTab({})).toBe("all");
    expect(activeTab({ payment: "pending_verification" })).toBe("pending");
    expect(activeTab({ status: "shipped" })).toBe("shipping");
    expect(activeTab({ status: "paid", payment: "paid" })).toBe("");
    expect(ordersHref({ status: "cancelled" })).toBe("/panel/orders?status=cancelled");
  });
});

describe("Tehran days", () => {
  it("starts a Tehran day at 20:30 UTC the evening before", () => {
    expect(tehranDayStart("2026-10-20").toISOString()).toBe("2026-10-19T20:30:00.000Z");
    expect(tehranDay(new Date("2026-10-19T20:29:59Z"))).toBe("2026-10-19");
    expect(tehranDay(new Date("2026-10-19T20:30:00Z"))).toBe("2026-10-20");
  });

  it("starts the week on Saturday", () => {
    // 2026-10-20 is a Tuesday in Tehran; that week's Saturday is 2026-10-17.
    const { today, week } = tehranTodayAndWeek(new Date("2026-10-20T09:00:00Z"));
    expect(today.toISOString()).toBe("2026-10-19T20:30:00.000Z");
    expect(week.toISOString()).toBe("2026-10-16T20:30:00.000Z");
    // On a Saturday the week starts that same day.
    expect(tehranTodayAndWeek(new Date("2026-10-17T05:00:00Z")).week.toISOString()).toBe("2026-10-16T20:30:00.000Z");
  });
});

describe("orderTimeline", () => {
  const base = {
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-05T08:00:00Z",
    confirmed_at: "2026-10-01T09:00:00Z",
    paid_at: "2026-10-02T09:00:00Z",
    packing_at: null,
    shipped_at: "2026-10-03T09:00:00Z",
    cancelled_at: null,
    payment: { paid_at: "2026-10-02T09:00:00Z" },
  };

  it("reads a delivered order's last update as its delivery", () => {
    const keys = orderTimeline({ ...base, status: "delivered" } as unknown as Order).map((t) => t.key);
    expect(keys).toEqual(["created", "confirmed", "paid", "shipped", "delivered"]);
  });

  it("has no delivery step before the order is delivered", () => {
    const keys = orderTimeline({ ...base, status: "shipped" } as unknown as Order).map((t) => t.key);
    expect(keys).toEqual(["created", "confirmed", "paid", "shipped"]);
  });
});
