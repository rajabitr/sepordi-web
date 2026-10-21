import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as bizin from "@/server/bizin/client";
import { mockTransport, resetWorld } from "@/server/bizin/mock";
import type { TransportRequest } from "@/server/bizin/transport";
import { resetRateLimits } from "@/server/auth/rate-limit";
import { hashToken, requireSeller, requireShopOwner, SESSION_COOKIE } from "@/server/auth/session";
import { openDb, setDbForTests } from "@/server/db";
import { invites, members, sessions, shops, users, type MemberRole, type ShopRow, type UserRow } from "@/server/db/repo";

import { LAST_OWNER_FA, OTHER_SHOP_FA, changeMemberRole, inviteMember, removeMember } from "./team";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const { savePaymentDetailsAction } = await import("@/app/panel/payments/actions");
const { saveShippingAction } = await import("@/app/panel/shipping/actions");
const { disconnectChannelAction } = await import("@/app/panel/channels/actions");
const { cardToCardAction } = await import("@/app/panel/credit/actions");
const { cancelInviteAction, changeMemberRoleAction, inviteMemberAction, removeMemberAction } = await import("@/app/panel/settings/team/actions");
const { moveOrderAction } = await import("@/app/panel/orders/actions");
const { loginWithPasswordAction, setSignupPasswordAction } = await import("@/server/signup/actions");
const { hashPassword } = await import("@/server/auth/password");

const env = { ...process.env };
let seen: TransportRequest[];
let n = 0;

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

const phone = () => `0912${String(1000000 + ++n).slice(-7)}`;
const user = (p = phone()) => users.create({ phone: p, displayName: `کاربر ${n}` });
/** A shop; its creator becomes its owner through the migration's trigger. */
function shopOf(owner: UserRow, ext: string): ShopRow {
  return shops.create({ userId: owner.id, externalBusinessId: ext, name: ext, bizinTenantId: `t-${ext}` });
}
function member(shop: ShopRow, role: MemberRole): UserRow {
  const u = user();
  members.add(shop.id, u.id, role);
  return u;
}
function signIn(u: UserRow) {
  const token = randomBytes(16).toString("base64url");
  sessions.create(hashToken(token), u.id, new Date(Date.now() + 3600_000), null);
  jar.set(SESSION_COOKIE, token);
}
const extsCalled = () => seen.map((r) => decodeURIComponent(r.path.split("/")[2] ?? ""));
const ORDER = "9b3f6e12-0000-4000-8000-000000000001";

describe("shop membership", () => {
  it("makes every shop's creator its owner", async () => {
    const owner = user();
    const shop = shopOf(owner, "sp_a");
    signIn(owner);
    expect(await requireSeller()).toMatchObject({ shop: { id: shop.id }, role: "owner" });
    expect(await requireShopOwner()).toMatchObject({ shop: { external_business_id: "sp_a" } });
  });
});

describe("owner-only actions refuse an agent on the server", () => {
  const ownerOnly: [string, () => Promise<unknown>][] = [
    ["payment details", () => savePaymentDetailsAction({ card_number: "6037997599999999", iban: "", holder_name: "سارا", bank_name: "" })],
    ["shipping", () => saveShippingAction({ enabled: true, default_fee: 50000, free_over: null, rates: [] })],
    ["channel disconnect", () => disconnectChannelAction(ORDER)],
    ["credit purchase", () => cardToCardAction("starter", "123456")],
    ["team invite", () => inviteMemberAction({ phone: "09351112233", role: "owner" })],
    ["team role change", () => changeMemberRoleAction("x", "owner")],
    ["team removal", () => removeMemberAction("x")],
    ["invite cancel", () => cancelInviteAction("x")],
  ];

  it.each(ownerOnly)("%s", async (_name, call) => {
    const shop = shopOf(user(), "sp_a");
    signIn(member(shop, "agent"));
    await expect(call()).rejects.toThrow("REDIRECT /panel");
    expect(seen).toHaveLength(0);
    expect(invites.pendingForShop(shop.id)).toHaveLength(0);
    expect(members.ownerCount(shop.id)).toBe(1);
  });

  it("lets the agent do agent work for their shop", async () => {
    const shop = shopOf(user(), "sp_a");
    signIn(member(shop, "agent"));
    await moveOrderAction(ORDER, "shipped", "k1");
    expect(extsCalled()).toEqual(["sp_a"]);
  });
});

describe("invites", () => {
  it("an invited number that registers joins the shop and skips the shop step", async () => {
    const owner = user();
    const shop = shopOf(owner, "sp_a");
    signIn(owner);
    await inviteMemberAction({ phone: "۰۹۳۵ ۱۱۱ ۲۲۳۳", role: "agent" });
    expect(invites.pendingForShop(shop.id)).toMatchObject([{ phone: "09351112233", role: "agent" }]);

    jar.clear();
    await expect(setSignupPasswordAction("09351112233", "a-long-password-1")).rejects.toThrow("REDIRECT /panel");
    const joined = users.byPhone("09351112233")!;
    expect(members.get(shop.id, joined.id)?.role).toBe("agent");
    expect(shops.byUserId(joined.id)).toBeUndefined();
    expect(invites.pendingForShop(shop.id)).toHaveLength(0);
    expect(await requireSeller()).toMatchObject({ shop: { external_business_id: "sp_a" }, role: "agent" });
  });

  it("an invited existing user joins on sign-in", async () => {
    const shop = shopOf(user(), "sp_a");
    const p = phone();
    const u = users.create({ phone: p, displayName: "", passwordHash: await hashPassword("a-long-password-1") });
    invites.create({ shopId: shop.id, phone: p, role: "owner", invitedBy: shop.user_id });
    await expect(loginWithPasswordAction(p, "a-long-password-1", "/panel/orders")).rejects.toThrow("REDIRECT /panel/orders");
    expect(members.get(shop.id, u.id)?.role).toBe("owner");
  });

  it("refuses a number that already owns or belongs to another shop", () => {
    const a = shopOf(user(), "sp_a");
    const otherOwner = user();
    shopOf(otherOwner, "sp_b");
    expect(inviteMember(a.id, a.user_id, otherOwner.phone, "agent")).toMatchObject({ ok: false, field: "phone", message: OTHER_SHOP_FA });
    expect(invites.pendingForShop(a.id)).toHaveLength(0);
  });
});

describe("owners", () => {
  it("the last owner can't be removed or demoted", async () => {
    const owner = user();
    const shop = shopOf(owner, "sp_a");
    const agent = member(shop, "agent");
    expect(removeMember(shop.id, agent.id, owner.id)).toMatchObject({ ok: false, message: LAST_OWNER_FA });
    expect(changeMemberRole(shop.id, agent.id, owner.id, "agent")).toMatchObject({ ok: false, message: LAST_OWNER_FA });
    expect(members.get(shop.id, owner.id)?.role).toBe("owner");

    signIn(owner);
    expect(await removeMemberAction(owner.id)).toMatchObject({ ok: false });
    expect(members.ownerCount(shop.id)).toBe(1);
  });

  it("a second owner can be removed by the first", async () => {
    const owner = user();
    const shop = shopOf(owner, "sp_a");
    const second = member(shop, "owner");
    signIn(owner);
    expect(await removeMemberAction(second.id)).toEqual({ ok: true, data: null });
    expect(members.get(shop.id, second.id)).toBeUndefined();
  });
});

describe("ext isolation", () => {
  it("a member of shop A never acts on shop B", async () => {
    const ownerA = user();
    const a = shopOf(ownerA, "sp_a");
    const b = shopOf(user(), "sp_b");
    const agentB = member(b, "agent");
    const inviteB = invites.create({ shopId: b.id, phone: phone(), role: "agent", invitedBy: b.user_id });

    signIn(ownerA);
    expect(await removeMemberAction(agentB.id)).toMatchObject({ ok: false });
    expect(await changeMemberRoleAction(agentB.id, "owner")).toMatchObject({ ok: false });
    expect(await cancelInviteAction(inviteB.id)).toMatchObject({ ok: false });
    expect(members.get(b.id, agentB.id)?.role).toBe("agent");
    expect(invites.pendingForShop(b.id)).toHaveLength(1);

    const agentA = member(a, "agent");
    signIn(agentA);
    await moveOrderAction(ORDER, "shipped", "k1");
    signIn(ownerA);
    await saveShippingAction({ enabled: true, default_fee: 50000, free_over: null, rates: [] });
    signIn(agentB);
    await moveOrderAction(ORDER, "shipped", "k2");
    expect(extsCalled()).toEqual(["sp_a", "sp_a", "sp_b"]);
  });
});
