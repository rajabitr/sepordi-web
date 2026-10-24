import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PANEL_NAV_ITEMS, navFor } from "@/components/panel/shell/nav";
import * as bizin from "@/server/bizin/client";
import { mockTransport, resetWorld } from "@/server/bizin/mock";
import type { TransportRequest } from "@/server/bizin/transport";
import { resetRateLimits } from "@/server/auth/rate-limit";
import { getSeller, requireCapability } from "@/server/auth/session";
import { openDb, setDbForTests } from "@/server/db";

import { MEMBER_ROLES, can, type Capability, type MemberRole } from "./roles";

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
const { moveOrderAction, approveEvidenceAction, markPaidAction } = await import("@/app/panel/orders/actions");
const { claimAction, replyAction } = await import("@/app/panel/inbox/actions");
const { archiveProductAction } = await import("@/app/panel/products/actions");
const { actOnCaseAction } = await import("@/app/panel/returns/actions");
const { saveShippingAction } = await import("@/app/panel/shipping/actions");
const { savePaymentDetailsAction } = await import("@/app/panel/payments/actions");
const { disconnectChannelAction } = await import("@/app/panel/channels/actions");
const { cardToCardAction } = await import("@/app/panel/credit/actions");
const { saveAssistantAction } = await import("@/app/panel/assistant/actions");
const { inviteMemberAction } = await import("@/app/panel/settings/team/actions");
const { bookingAction, rescheduleAction } = await import("@/app/panel/booking/actions");

/*
 * The expected matrix, written out by hand: the test fails if server/team/roles.ts drifts from the product's role
 * definitions, not only if a guard forgets to ask it.
 */
const ALL: Capability[] = [
  "dashboard.view", "inbox.view", "inbox.reply", "orders.view", "orders.status", "orders.payment", "products.view",
  "products.edit", "returns.view", "returns.manage", "booking.view", "booking.manage", "shipping.view", "shipping.edit", "credit.view", "credit.buy",
  "payments.manage", "channels.manage", "assistant.manage", "team.manage", "activity.view",
];
const EXPECTED: Record<MemberRole, Capability[]> = {
  owner: ALL,
  agent: ["dashboard.view", "inbox.view", "inbox.reply", "orders.view", "orders.status", "orders.payment", "products.view", "products.edit", "returns.view", "returns.manage", "booking.view", "booking.manage"],
  responder: ["dashboard.view", "inbox.view", "inbox.reply"],
  finance: ["dashboard.view", "orders.view", "orders.payment", "booking.view", "credit.view", "activity.view"],
  fulfillment: ["dashboard.view", "orders.view", "orders.status", "booking.view", "products.view", "products.edit", "shipping.view"],
};

const ID = "9b3f6e12-0000-4000-8000-000000000001";
const ID2 = "9b3f6e12-0000-4000-8000-000000000002";

/** Every guarded mutating Server Action and the capability it must demand. */
const ACTIONS: [string, Capability, () => Promise<unknown>][] = [
  ["order status", "orders.status", () => moveOrderAction(ID, "shipped", "k1")],
  ["receipt approve", "orders.payment", () => approveEvidenceAction(ID, ID2, "k2")],
  ["mark paid", "orders.payment", () => markPaidAction(ID, "", "k3")],
  ["inbox claim", "inbox.reply", () => claimAction(ID, "k4")],
  ["inbox reply", "inbox.reply", () => replyAction(ID, { text: "سلام" }, "k5")],
  ["product archive", "products.edit", () => archiveProductAction("p-1")],
  ["return action", "returns.manage", () => actOnCaseAction(ID, { action: "accept", expectedState: "open" as never, notifyCustomer: false }, "k6")],
  ["shipping save", "shipping.edit", () => saveShippingAction({ enabled: true, default_fee: 50000, free_over: null, rates: [] })],
  ["payment details", "payments.manage", () => savePaymentDetailsAction({ card_number: "6037997599999999", iban: "", holder_name: "سارا", bank_name: "" })],
  ["channel disconnect", "channels.manage", () => disconnectChannelAction(ID)],
  ["credit purchase", "credit.buy", () => cardToCardAction("starter", "123456")],
  [
    "assistant save",
    "assistant.manage",
    () => saveAssistantAction({ enabled: true, auto_reply: true, reply_language: "fa", persona_name: "", knowledge: { sections: [] } as never }),
  ],
  ["booking approve", "booking.manage", () => bookingAction(ID, "approve", "", "k7")],
  ["booking reschedule", "booking.manage", () => rescheduleAction(ID, "2026-11-01T08:00:00Z", ID2, "k8")],
  ["booking deposit confirm", "orders.payment", () => bookingAction(ID, "confirm-payment", "", "k9")],
  ["team invite", "team.manage", () => inviteMemberAction({ phone: "09351112233", role: "agent" })],
];

const env = { ...process.env };
let seen: TransportRequest[];

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

describe("role matrix", () => {
  it.each(MEMBER_ROLES.flatMap((r) => ALL.map((c) => [r, c] as const)))("%s · %s", (role, cap) => {
    expect(can(role, cap)).toBe(EXPECTED[role].includes(cap));
  });

  it("an unknown role grants nothing", () => {
    expect(ALL.some((c) => can("manager", c))).toBe(false);
  });
});

describe("every guarded action asks its capability", () => {
  const cases = ACTIONS.flatMap(([name, cap, call]) => MEMBER_ROLES.map((role) => [name, role, cap, call] as const));

  it.each(cases)("%s as %s", async (_name, role, cap, call) => {
    const shop = shopOf(user(), "sp_a");
    signIn(member(shop, role));
    if (EXPECTED[role].includes(cap)) {
      await call().catch((e: Error) => expect(e.message).not.toMatch(/^REDIRECT/));
    } else {
      await expect(call()).rejects.toThrow("REDIRECT /panel");
      expect(seen).toHaveLength(0);
    }
  });
});

describe("pages and route handlers", () => {
  it.each(MEMBER_ROLES.flatMap((r) => ALL.map((c) => [r, c] as const)))("%s · %s", async (role, cap) => {
    const shop = shopOf(user(), "sp_a");
    signIn(member(shop, role));
    if (EXPECTED[role].includes(cap)) {
      await expect(requireCapability(cap)).resolves.toMatchObject({ role, shop: { id: shop.id } });
      expect(await getSeller(cap)).toMatchObject({ role });
    } else {
      await expect(requireCapability(cap)).rejects.toThrow("REDIRECT /panel");
      expect(await getSeller(cap)).toBeNull();
    }
  });
});

describe("the menu", () => {
  it.each(MEMBER_ROLES)("%s sees exactly the sections it can open", (role) => {
    const hrefs = navFor(role).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toEqual(PANEL_NAV_ITEMS.filter((i) => EXPECTED[role].includes(i.cap)).map((i) => i.href));
  });

  it("a responder's menu is the dashboard, the inbox and settings", () => {
    expect(navFor("responder").flatMap((g) => g.items.map((i) => i.href))).toEqual(["/panel", "/panel/inbox", "/panel/settings"]);
  });

  it("hides sections the plan leaves out", () => {
    const hrefs = navFor("owner", ["inbox", "returns"]).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/panel/inbox");
    expect(hrefs).not.toContain("/panel/returns");
    expect(hrefs).toContain("/panel/shipping");
  });
});
