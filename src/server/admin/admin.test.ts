import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWebhookAction } from "@/app/admin/webhooks/actions";
import { saveEntitlementsAction } from "@/app/admin/sellers/[ext]/actions";
import { hashToken, isEnvAdmin, requireAdmin, requireSeller, SESSION_COOKIE } from "@/server/auth/session";
import { setTransportForTests } from "@/server/bizin/client";
import type { TransportRequest } from "@/server/bizin/transport";
import { openDb, setDbForTests } from "@/server/db";
import { creditOrders, sessions, settings, shops, users } from "@/server/db/repo";

import { decideCreditOrder, listCreditQueue, pendingCreditCount } from "./credit";
import { searchLocalSellers } from "./sellers";
import { loadAdminSettings, saveAdminSettings } from "./settings";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

function signIn(phone: string, role: "seller" | "admin" = "seller") {
  const u = users.create({ phone, displayName: "کارمند", role });
  const token = `t-${phone}`;
  sessions.create(hashToken(token), u.id, new Date(Date.now() + 60_000), null);
  jar.set(SESSION_COOKIE, token);
  return u;
}

function shopWithOrder(phone: string, name: string) {
  const u = users.create({ phone, displayName: `مالک ${name}` });
  const shop = shops.create({ userId: u.id, externalBusinessId: `ext-${phone}`, name });
  const order = creditOrders.create({ shopId: shop.id, planCode: "silver", amountToman: 1_500_000, method: "card_to_card" });
  return { shop, order };
}

const calls: TransportRequest[] = [];
function captureTransport(answer: (req: TransportRequest) => Response) {
  calls.length = 0;
  setTransportForTests(async (req) => {
    calls.push(req);
    return answer(req);
  });
}

beforeEach(() => {
  setDbForTests(openDb(":memory:"));
  jar.clear();
  vi.unstubAllEnvs();
});
afterEach(() => {
  setDbForTests(undefined);
  setTransportForTests(undefined);
  vi.unstubAllEnvs();
});

describe("staff access", () => {
  it("reads SEPORDI_ADMIN_PHONES in any digit script and phone shape", () => {
    const list = " ۰۹۱۲۱۱۱۲۲۳۳ ,+989350000000";
    expect(isEnvAdmin("09121112233", list)).toBe(true);
    expect(isEnvAdmin("09350000000", list)).toBe(true);
    expect(isEnvAdmin("09120000000", list)).toBe(false);
    expect(isEnvAdmin("09121112233", "")).toBe(false);
    expect(isEnvAdmin("09121112233", undefined)).toBe(false);
  });

  it("lets an env-listed seller in, keeps other sellers out, and admits the admin role", async () => {
    vi.stubEnv("SEPORDI_ADMIN_PHONES", "09121112233");
    signIn("09121112233");
    await expect(requireAdmin()).resolves.toMatchObject({ user: { phone: "09121112233" } });

    signIn("09124445566");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT /panel");

    signIn("09127778899", "admin");
    await expect(requireAdmin()).resolves.toMatchObject({ user: { role: "admin" } });

    jar.clear();
    await expect(requireAdmin()).rejects.toThrow("REDIRECT /login");
  });

  it("sends an env-listed phone with a seller row to the staff side, not the panel", async () => {
    vi.stubEnv("SEPORDI_ADMIN_PHONES", "+98 912 111 2233");
    const u = signIn("09121112233");
    shops.create({ userId: u.id, externalBusinessId: "ext-staff", name: "فروشگاه کارمند" });
    await expect(requireAdmin()).resolves.toMatchObject({ user: { phone: "09121112233", role: "seller" } });
    await expect(requireSeller()).rejects.toThrow("REDIRECT /admin");
  });
});

describe("credit queue", () => {
  it("confirms the transfer, then grants, needs a note to reject, and keeps the reviewer", () => {
    const { order } = shopWithOrder("09121000001", "گالری");
    expect(decideCreditOrder({ id: order.id, decision: "rejected", note: "  ", by: "علی" })).toEqual({ ok: false, error: "note_required" });
    expect(decideCreditOrder({ id: order.id, decision: "granted", note: "", by: "علی" })).toEqual({ ok: false, error: "wrong_state" });
    expect(pendingCreditCount()).toBe(1);

    expect(decideCreditOrder({ id: order.id, decision: "paid", note: "", by: "علی" })).toEqual({ ok: true });
    expect(listCreditQueue("paid")[0]).toMatchObject({ status: "paid", reviewed_by: "علی" });
    expect(pendingCreditCount()).toBe(1);

    expect(decideCreditOrder({ id: order.id, decision: "granted", note: "", by: "مریم" })).toEqual({ ok: true });
    expect(listCreditQueue("granted")[0]).toMatchObject({ status: "granted", reviewed_by: "مریم" });
    expect(pendingCreditCount()).toBe(0);

    expect(decideCreditOrder({ id: order.id, decision: "rejected", note: "دیر", by: "رضا" })).toEqual({ ok: false, error: "wrong_state" });
    expect(listCreditQueue("granted")[0].reviewed_by).toBe("مریم");
    expect(decideCreditOrder({ id: "nope", decision: "granted", note: "", by: "علی" })).toEqual({ ok: false, error: "not_found" });
  });

  it("lists work first and keeps the rejection note on the row", () => {
    const a = shopWithOrder("09121000002", "الف");
    const b = shopWithOrder("09121000003", "ب");
    decideCreditOrder({ id: a.order.id, decision: "rejected", note: "رسید ناخوانا", by: "علی" });
    const rows = listCreditQueue("all");
    expect(rows.map((r) => r.id)).toEqual([b.order.id, a.order.id]);
    expect(rows[0]).toMatchObject({ shop_name: "ب", phone: "09121000003" });
    expect(rows[1]).toMatchObject({ status: "rejected", review_note: "رسید ناخوانا" });
    expect(settings.get("credit_order_reviews")).toBeUndefined();
  });
});

describe("site settings", () => {
  it("seeds the defaults the first time and saves nothing while any part is invalid", () => {
    const s = loadAdminSettings();
    expect(s.plans.map((p) => [p.code, p.name, p.replies_estimate, p.discount_percent, p.highlight, p.price_toman])).toEqual([
      ["free", "رایگان", 200, 0, false, null],
      ["bronze", "برنزی", 7400, 2, false, null],
      ["silver", "نقره‌ای", 15700, 7, true, null],
      ["gold", "طلایی", 24400, 10, false, null],
    ]);
    expect(settings.get("plans")).toEqual(s.plans);

    const bad = saveAdminSettings({
      plans: s.plans.map((p) => ({ ...p, price_toman: 990_000 })),
      support: s.support,
      card_to_card: { card_number: "6037991234567890", holder_name: "سپردی", bank_name: "ملی" },
    });
    expect(bad).toMatchObject({ ok: false, errors: { "card_to_card.card_number": expect.any(String) } });
    expect(settings.get<{ price_toman: number | null }[]>("plans")?.[0].price_toman).toBeNull();

    const good = saveAdminSettings({
      plans: s.plans.map((p) => ({ ...p, price_toman: p.code === "free" ? null : "۹۹۰٬۰۰۰" })),
      support: { phone: "۰۲۱۱۲۳۴۵۶۷۸", telegram: "@sepordi_support", email: "", hours: "" },
      card_to_card: { card_number: "۶۰۳۷ ۹۹۷۵ ۹۹۰۰ ۰۰۰۸", holder_name: "سپردی", bank_name: "ملی" },
    });
    expect(good.ok).toBe(true);
    expect(settings.get<{ price_toman: number | null }[]>("plans")?.[1].price_toman).toBe(990_000);
    expect(settings.get("support")).toMatchObject({ phone: "02112345678", telegram: "sepordi_support" });
    expect(settings.get("card_to_card")).toMatchObject({ card_number: "6037997599000008" });
  });
});

describe("seller search", () => {
  it("finds by a phone typed in Persian digits and treats % as a literal", () => {
    shopWithOrder("09123334455", "گالری نیلا");
    shopWithOrder("09125556677", "کتاب ۱۰۰%");
    expect(searchLocalSellers("۰۹۱۲ ۳۳۳ ۴۴۵۵").map((s) => s.shop_name)).toEqual(["گالری نیلا"]);
    expect(searchLocalSellers("%").map((s) => s.shop_name)).toEqual(["کتاب ۱۰۰%"]);
  });
});

describe("partner actions", () => {
  it("subscribes a new webhook to * when * is among the picks, and refuses non-staff", async () => {
    captureTransport(
      () =>
        new Response(JSON.stringify({ webhook: { id: "x" }, secret: "whsec_test" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    signIn("09124445566");
    await expect(createWebhookAction({ url: "https://sepordi.ir/api/bizin/webhook", eventTypes: ["*"], description: "" })).rejects.toThrow("REDIRECT /panel");
    expect(calls).toHaveLength(0);

    signIn("09127778899", "admin");
    const r = await createWebhookAction({ url: "https://sepordi.ir/api/bizin/webhook", eventTypes: ["order.created", "*", "bogus"], description: "سایت" });
    expect(r).toEqual({ ok: true, data: { secret: "whsec_test" } });
    expect(JSON.parse(String(calls[0].body))).toEqual({ url: "https://sepordi.ir/api/bizin/webhook", event_types: ["*"], description: "سایت" });
  });

  it("sends only narrowing entitlement changes", async () => {
    captureTransport(() => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }));
    signIn("09127778899", "admin");
    const r = await saveEntitlementsAction("demo-nila", {
      features: { "channel.telegram": false, "channel.whatsapp": true, "flows.advanced": null },
      limits: { "products.max": 50, "tenants.max": 1, "channels.max": null },
    });
    expect(r.ok).toBe(true);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].path).toBe("/tenants/demo-nila/entitlements");
    expect(JSON.parse(String(calls[0].body))).toEqual({
      features: { "channel.telegram": false, "flows.advanced": null },
      limits: { "products.max": 50, "channels.max": null },
    });
  });
});
