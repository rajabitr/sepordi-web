import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as bizin from "@/server/bizin/client";
import { mockTransport, resetWorld } from "@/server/bizin/mock";
import type { TransportRequest } from "@/server/bizin/transport";
import { resetRateLimits } from "@/server/auth/rate-limit";
import { openDb, setDbForTests } from "@/server/db";
import { members, sessions, shops } from "@/server/db/repo";

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
const { requireSeller, getSeller } = await import("./session");
const { switchShopAction } = await import("./actions");
const { moveOrderAction } = await import("@/app/panel/orders/actions");
const { createAnotherShopAction } = await import("@/server/signup/actions");

const ORDER = "9b3f6e12-0000-4000-8000-000000000001";
const env = { ...process.env };
let seen: TransportRequest[];
const extsCalled = () => seen.map((r) => decodeURIComponent(r.path.split("/")[2] ?? ""));

beforeEach(() => {
  process.env.BIZIN_MODE = "mock";
  delete process.env.SEPORDI_ADMIN_PHONES;
  resetWorld();
  resetRateLimits();
  setDbForTests(openDb(":memory:"));
  jar.clear();
  seen = [];
  bizin.setTransportForTests(async (req) => {
    seen.push(req);
    return mockTransport(req);
  });
});
afterEach(() => {
  process.env = { ...env };
  bizin.setTransportForTests(undefined);
  setDbForTests(undefined);
});

/** A user who owns shop A and is an agent in shop B. */
function twoShops() {
  const u = user();
  const a = shopOf(u, "sp_a");
  const b = shopOf(user(), "sp_b");
  members.add(b.id, u.id, "agent");
  const tokenHash = signIn(u);
  return { u, a, b, tokenHash };
}

describe("current shop", () => {
  it("starts at the oldest membership and follows a switch, role included", async () => {
    const { a, b } = twoShops();
    expect(await requireSeller()).toMatchObject({ shop: { id: a.id }, role: "owner" });
    await expect(switchShopAction(b.id)).rejects.toThrow("REDIRECT /panel");
    expect(await requireSeller()).toMatchObject({ shop: { id: b.id }, role: "agent" });
  });

  it("refuses a switch to a shop the user is not a member of", async () => {
    const { a, tokenHash } = twoShops();
    const stranger = shopOf(user(), "sp_c");
    expect(await switchShopAction(stranger.id)).toMatchObject({ ok: false });
    expect(await switchShopAction("../../etc")).toMatchObject({ ok: false });
    expect(sessions.lookup(tokenHash)?.shopId).toBeNull();
    expect(await requireSeller()).toMatchObject({ shop: { id: a.id } });
  });

  it("a stored shop the user was removed from is ignored on the next request", async () => {
    const { u, a, b, tokenHash } = twoShops();
    await expect(switchShopAction(b.id)).rejects.toThrow("REDIRECT");
    members.remove(b.id, u.id);
    expect(sessions.lookup(tokenHash)?.shopId).toBe(b.id);
    expect(await requireSeller()).toMatchObject({ shop: { id: a.id }, role: "owner" });
    expect(await getSeller()).toMatchObject({ shop: { id: a.id } });
  });

  it("a session row forged to point at a stranger's shop still lands in the user's own", async () => {
    const { a, tokenHash } = twoShops();
    const stranger = shopOf(user(), "sp_c");
    sessions.setShop(tokenHash, stranger.id);
    expect(await requireSeller()).toMatchObject({ shop: { id: a.id } });
  });
});

describe("ext isolation after switching", () => {
  it("every Partner API call goes to the current shop's ext and no other", async () => {
    const { b } = twoShops();
    await moveOrderAction(ORDER, "shipped", "k1");
    await expect(switchShopAction(b.id)).rejects.toThrow("REDIRECT");
    await moveOrderAction(ORDER, "shipped", "k2");
    expect(extsCalled()).toEqual(["sp_a", "sp_b"]);
  });

  it("a member of one shop only never reaches another by switching", async () => {
    const a = shopOf(user(), "sp_a");
    const b = shopOf(user(), "sp_b");
    signIn(member(a, "agent"));
    expect(await switchShopAction(b.id)).toMatchObject({ ok: false });
    await moveOrderAction(ORDER, "shipped", "k1");
    expect(extsCalled()).toEqual(["sp_a"]);
  });

  it("the switch belongs to one session: another device stays where it was", async () => {
    const { u, a, b } = twoShops();
    await expect(switchShopAction(b.id)).rejects.toThrow("REDIRECT");
    signIn(u);
    expect(await requireSeller()).toMatchObject({ shop: { id: a.id } });
  });
});

describe("«فروشگاه جدید»", () => {
  it("creates a second business under a fresh ext, same owner, and moves the session to it", async () => {
    const owner = user();
    const a = shopOf(owner, "sp_a");
    signIn(owner);
    await expect(
      createAnotherShopAction({ shopName: "فروشگاه دوم", ownerName: "سارا رضایی", email: "second@example.com", instagram: "", category: "" }),
    ).rejects.toThrow("REDIRECT /panel?welcome=1");
    const mine = members.shopsFor(owner.id);
    expect(mine).toHaveLength(2);
    const second = mine.find((m) => m.shop.id !== a.id)!;
    expect(second).toMatchObject({ role: "owner", shop: { user_id: owner.id, name: "فروشگاه دوم" } });
    expect(second.shop.external_business_id).toMatch(/^sp_/);
    expect(second.shop.external_business_id).not.toBe("sp_a");
    expect(shops.byExternalId(second.shop.external_business_id)?.bizin_tenant_id).toBeTruthy();
    expect(await requireSeller()).toMatchObject({ shop: { id: second.shop.id } });
  });

  it("needs a signed-in seller", async () => {
    await expect(createAnotherShopAction({})).rejects.toThrow("REDIRECT /login");
  });
});
