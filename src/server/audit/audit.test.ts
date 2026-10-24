import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as bizin from "@/server/bizin/client";
import { mockTransport, resetWorld } from "@/server/bizin/mock";
import { resetRateLimits } from "@/server/auth/rate-limit";
import { openDb, setDbForTests } from "@/server/db";

import { jalaliDayStart, parseActivityQuery } from "./filters";
import { listActivity, recordActivity } from "./index";

vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/test/cookie-jar");
  return { cookies: async () => cookieStore(), headers: async () => new Headers() };
});
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const { jar, member, shopOf, signIn, user } = await import("@/test/seller-fixtures");
const { moveOrderAction, approveEvidenceAction } = await import("@/app/panel/orders/actions");
const { inviteMemberAction, removeMemberAction } = await import("@/app/panel/settings/team/actions");

const ID = "9b3f6e12-0000-4000-8000-000000000001";
const ID2 = "9b3f6e12-0000-4000-8000-000000000002";
const env = { ...process.env };

/** Bizin answers every write 200, or every request with a 409. */
function bizinAnswers(status: 200 | 409) {
  bizin.setTransportForTests(async () =>
    status === 200
      ? Response.json({ id: ID, status: "shipped" })
      : Response.json({ error: { code: "order_status_conflict", message: "moved" } }, { status: 409 }),
  );
}

beforeEach(() => {
  process.env.BIZIN_MODE = "mock";
  resetWorld();
  resetRateLimits();
  setDbForTests(openDb(":memory:"));
  jar.clear();
  bizin.setTransportForTests(mockTransport);
});
afterEach(() => {
  process.env = { ...env };
  bizin.setTransportForTests(undefined);
  setDbForTests(undefined);
});

describe("recordActivity from actions", () => {
  it("a succeeded order move records who did what to which order", async () => {
    const shop = shopOf(user(), "sp_a");
    const agent = member(shop, "fulfillment");
    signIn(agent);
    bizinAnswers(200);
    expect(await moveOrderAction(ID, "shipped", "k1")).toEqual({ ok: true });
    expect(listActivity(shop.id)).toMatchObject([{ user_id: agent.id, action: "order.status", target_type: "order", target_id: ID, meta: JSON.stringify({ status: "shipped" }) }]);
  });

  it("a failed action records nothing", async () => {
    const shop = shopOf(user(), "sp_a");
    signIn(member(shop, "agent"));
    bizinAnswers(409);
    expect(await moveOrderAction(ID, "shipped", "k1")).toMatchObject({ ok: false });
    expect(await approveEvidenceAction(ID, ID2, "k2")).toMatchObject({ ok: false });
    expect(listActivity(shop.id)).toEqual([]);
  });

  it("a refused action (role without the capability) records nothing", async () => {
    const shop = shopOf(user(), "sp_a");
    signIn(member(shop, "finance"));
    bizinAnswers(200);
    await expect(moveOrderAction(ID, "shipped", "k1")).rejects.toThrow("REDIRECT /panel");
    expect(listActivity(shop.id)).toEqual([]);
  });

  it("a team change that the rules refuse records nothing; one that succeeds records once", async () => {
    const owner = user();
    const shop = shopOf(owner, "sp_a");
    signIn(owner);
    expect(await removeMemberAction(owner.id)).toMatchObject({ ok: false });
    expect(listActivity(shop.id)).toEqual([]);
    expect(await inviteMemberAction({ phone: "09351112233", role: "responder" })).toMatchObject({ ok: true });
    expect(listActivity(shop.id)).toMatchObject([{ action: "team.invite", user_id: owner.id, meta: JSON.stringify({ role: "responder" }) }]);
  });
});

describe("listActivity", () => {
  it("never shows another shop's rows", () => {
    const a = shopOf(user(), "sp_a");
    const b = shopOf(user(), "sp_b");
    recordActivity({ shop: a, user: { id: a.user_id } }, "order.status", { type: "order", id: "1" });
    recordActivity({ shop: b, user: { id: b.user_id } }, "product.save", { type: "product", id: "p" });
    expect(listActivity(a.id).map((r) => r.action)).toEqual(["order.status"]);
    expect(listActivity(b.id).map((r) => r.action)).toEqual(["product.save"]);
    expect(listActivity(a.id, { userId: b.user_id })).toEqual([]);
  });

  it("filters by member, action group and date", () => {
    const a = shopOf(user(), "sp_a");
    const other = member(a, "agent");
    recordActivity({ shop: a, user: { id: a.user_id } }, "order.status", { type: "order", id: "1" });
    recordActivity({ shop: a, user: { id: other.id } }, "order.receipt_approve", { type: "order", id: "1" });
    recordActivity({ shop: a, user: { id: other.id } }, "product.save", { type: "product", id: "p" });
    expect(listActivity(a.id, { userId: other.id }).map((r) => r.action).sort()).toEqual(["order.receipt_approve", "product.save"]);
    expect(listActivity(a.id, { group: "order" })).toHaveLength(2);
    expect(listActivity(a.id, { to: "2000-01-01T00:00:00.000Z" })).toEqual([]);
  });
});

describe("Jalali date filter", () => {
  it("a Jalali day starts at Tehran midnight", () => {
    // 1 Farvardin 1403 = 20 March 2024; Tehran midnight is 20:30 UTC the day before.
    expect(jalaliDayStart("1403-1-1")).toBe("2024-03-19T20:30:00.000Z");
    expect(jalaliDayStart("1403-1-1", 1)).toBe("2024-03-20T20:30:00.000Z");
    expect(jalaliDayStart("1403-13-1")).toBeNull();
    expect(jalaliDayStart("2024-03-20")).toBeNull();
  });

  it("drops malformed params", () => {
    expect(parseActivityQuery({ type: "nope", from: "x", member: "u1" })).toEqual({ query: { member: "u1", group: undefined, from: undefined, to: undefined }, from: undefined, to: undefined });
  });
});
