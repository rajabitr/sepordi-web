import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { safeNextPath } from "@/components/auth/rules";
import * as bizin from "@/server/bizin/client";
import { mockTransport, resetWorld } from "@/server/bizin/mock";
import type { TransportRequest } from "@/server/bizin/transport";
import { resetRateLimits } from "@/server/auth/rate-limit";
import { openDb, setDbForTests } from "@/server/db";
import { shops, users } from "@/server/db/repo";
import { DEMO_ACCOUNTS, seedDemoAccounts } from "@/server/db/seed";

import { EMAIL_IN_USE_FA, provisionShop, readPending } from "./provision";
import { BAD_CREDENTIALS_FA, registerWithPassword, sendCode, signInWithCode, signInWithPassword } from "./sign-in";

const env = { ...process.env };
const fields = { shopName: "گالری نقره‌ی ماه", ownerName: "سارا محمدی", email: "sara@example.com", instagram: "@Mah.Silver", category: "jewelry" };

let seen: TransportRequest[];
/** The mock Bizin, with `fault(n)` deciding what happens on the n-th call. */
function useBizin(fault: (n: number, req: TransportRequest) => "pass" | "timeout_after" | "network" | Response = () => "pass") {
  seen = [];
  bizin.setTransportForTests(async (req) => {
    seen.push(req);
    const f = fault(seen.length, req);
    if (f === "network") throw new TypeError("fetch failed");
    if (f instanceof Response) return f;
    const res = await mockTransport(req);
    if (f === "timeout_after") throw Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
    return res;
  });
}

const tenantsFor = async (ext: string) => (await bizin.listTenants({ limit: 100 })).tenants.filter((t) => t.external_business_id === ext);
const bodyOf = (r: TransportRequest) => JSON.parse(String(r.body)) as { external_business_id: string; owner: { email: string; phone: string }; metadata: Record<string, string> };

beforeEach(() => {
  process.env.BIZIN_MODE = "mock";
  resetWorld();
  resetRateLimits();
  setDbForTests(openDb(":memory:"));
});
afterEach(() => {
  process.env = { ...env };
  bizin.setTransportForTests(undefined);
  setDbForTests(undefined);
  vi.restoreAllMocks();
});

const newSeller = () => users.create({ phone: "09121234567", displayName: "" });

describe("provisionShop", () => {
  it("a retry after a timeout reuses the business id and key and creates one business", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = newSeller();
    useBizin((n) => (n === 1 ? "timeout_after" : "pass"));

    const first = await provisionShop(user.id, fields);
    expect(first).toMatchObject({ ok: false, error: { retryable: true } });
    expect(shops.byUserId(user.id)).toBeUndefined();
    const pending = readPending(user.id);
    expect(pending?.ext).toMatch(/^sp_[0-9a-f-]{36}$/);

    const second = await provisionShop(user.id, fields);
    expect(second.ok).toBe(true);
    expect(seen).toHaveLength(2);
    expect(bodyOf(seen[1]).external_business_id).toBe(pending!.ext);
    expect(seen[1].headers["Idempotency-Key"]).toBe(seen[0].headers["Idempotency-Key"]);
    expect(await tenantsFor(pending!.ext)).toHaveLength(1);
    const shop = shops.byUserId(user.id)!;
    expect(shop.external_business_id).toBe(pending!.ext);
    expect(shop.bizin_tenant_id).toBeTruthy();
    expect(readPending(user.id)).toBeUndefined();
    expect(users.byId(user.id)).toMatchObject({ email: "sara@example.com", display_name: "سارا محمدی" });

    const third = await provisionShop(user.id, fields);
    expect(third).toMatchObject({ ok: true, created: false });
    expect(seen.filter((r) => r.method === "POST")).toHaveLength(2);
  });

  it("persists the business id and key before Bizin is called", async () => {
    const user = newSeller();
    let atCall: ReturnType<typeof readPending>;
    useBizin((_, req) => {
      atCall = readPending(user.id);
      expect(atCall?.idempotencyKey).toBe(req.headers["Idempotency-Key"]);
      return "pass";
    });
    expect((await provisionShop(user.id, fields)).ok).toBe(true);
    expect(atCall!.ext).toBe(bodyOf(seen[0]).external_business_id);
    expect(bodyOf(seen[0]).owner.phone).toBe("+989121234567");
    expect(bodyOf(seen[0]).metadata).toMatchObject({ instagram: "mah.silver", category: "jewelry" });
  });

  it("puts owner_email_in_use under the email field and accepts another email on the same business id", async () => {
    await bizin.createTenant({
      external_business_id: "other-shop",
      name: "فروشگاه دیگر",
      market_profile: "ir",
      reply_language: "fa",
      owner: { external_user_id: "someone-else", email: "sara@example.com", display_name: "دیگری" },
    });
    const user = newSeller();
    useBizin();
    const r = await provisionShop(user.id, fields);
    expect(r).toMatchObject({ ok: false, error: { field: "email", message: EMAIL_IN_USE_FA, retryable: false }, fieldErrors: { email: EMAIL_IN_USE_FA } });
    const ext = readPending(user.id)!.ext;

    const ok = await provisionShop(user.id, { ...fields, email: "sara.shop@example.com" });
    expect(ok.ok).toBe(true);
    expect(shops.byUserId(user.id)!.external_business_id).toBe(ext);
    expect(seen[1].headers["Idempotency-Key"]).not.toBe(seen[0].headers["Idempotency-Key"]);
  });

  it("names the earlier email when a timed-out attempt created the business with it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = newSeller();
    useBizin((n) => (n === 1 ? "timeout_after" : "pass"));
    await provisionShop(user.id, fields);
    const r = await provisionShop(user.id, { ...fields, email: "new@example.com" });
    expect(r).toMatchObject({ ok: false, error: { field: "email" } });
    expect(!r.ok && r.error.message).toContain("sara@example.com");
    expect((await provisionShop(user.id, fields)).ok).toBe(true);
    expect(await tenantsFor(shops.byUserId(user.id)!.external_business_id)).toHaveLength(1);
  });

  it("shows Bizin's wait and request id on rate_limited", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = newSeller();
    useBizin(() =>
      new Response(JSON.stringify({ code: "rate_limited", message: "slow down", request_id: "req-42" }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "60" },
      }),
    );
    const r = await provisionShop(user.id, fields);
    expect(r).toMatchObject({ ok: false, error: { retryable: true, retryAfterSeconds: 60, requestId: "req-42" } });
    expect(!r.ok && r.error.message).toContain("۶۰ ثانیه");
  });

  it("recovers from a request that never reached Bizin", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = newSeller();
    useBizin((n) => (n === 1 ? "network" : "pass"));
    expect(await provisionShop(user.id, fields)).toMatchObject({ ok: false, error: { retryable: true } });
    expect((await provisionShop(user.id, fields)).ok).toBe(true);
    expect(await tenantsFor(shops.byUserId(user.id)!.external_business_id)).toHaveLength(1);
  });

  it("checks the fields before calling Bizin", async () => {
    const user = newSeller();
    useBizin();
    const r = await provisionShop(user.id, { ...fields, shopName: "  ", email: "sara@" });
    expect(r).toMatchObject({ ok: false, fieldErrors: { shopName: expect.any(String), email: expect.any(String) } });
    expect(seen).toHaveLength(0);
  });
});

describe("sign-in", () => {
  it("gives one message for an unknown number and a wrong password", async () => {
    const { hashPassword } = await import("@/server/auth/password");
    users.create({ phone: "09121112222", displayName: "x", passwordHash: await hashPassword("right-password") });
    const unknown = await signInWithPassword("09129998888", "whatever-pass", "1.1.1.1");
    const wrong = await signInWithPassword("۰۹۱۲۱۱۱۲۲۲۲", "wrong-password", "1.1.1.1");
    expect(unknown).toEqual({ ok: false, error: { message: BAD_CREDENTIALS_FA, field: "password" } });
    expect(wrong).toEqual(unknown);
    expect((await signInWithPassword("+989121112222", "right-password", "1.1.1.1")).ok).toBe(true);
  });

  it("locks a number after 5 password tries", async () => {
    for (let i = 0; i < 5; i++) await signInWithPassword("09121112222", "nope-nope", `10.0.0.${i}`);
    const r = await signInWithPassword("09121112222", "nope-nope", "10.0.0.9");
    expect(r).toMatchObject({ ok: false, error: { retryAfterSeconds: expect.any(Number) } });
  });

  it("sends a code to an unregistered number and makes it a user once verified", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await sendCode("09125550000", "1.1.1.1")).toEqual({ ok: true, resendAfterSeconds: 60 });
    const code = String(log.mock.calls.at(-1)?.[0]).match(/→ (\d{6})/)![1];
    const r = signInWithCode("09125550000", code.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]), "1.1.1.1");
    expect(r).toMatchObject({ ok: true, isNew: true });
    expect(users.byPhone("09125550000")).toBeDefined();
    expect(await sendCode("09125550000", "1.1.1.1")).toMatchObject({ ok: false, error: { retryAfterSeconds: expect.any(Number) } });
  });

  it("refuses a password signup for a number that already has an account", async () => {
    expect((await registerWithPassword("09121112222", "long-enough", "1.1.1.1")).ok).toBe(true);
    expect(await registerWithPassword("09121112222", "long-enough", "1.1.1.1")).toMatchObject({ ok: false, error: { field: "phone" } });
    expect(await registerWithPassword("09121113333", "short", "1.1.1.1")).toMatchObject({ ok: false, error: { field: "password" } });
  });
});

describe("demo seed", () => {
  it("a fresh mock-mode database signs the demo seller into the mock's demo shop, already provisioned", async () => {
    const db = openDb(":memory:");
    setDbForTests(db);
    seedDemoAccounts(db);
    useBizin();

    const r = await signInWithPassword(DEMO_ACCOUNTS.seller.phone, DEMO_ACCOUNTS.seller.password, "1.1.1.1");
    expect(r.ok).toBe(true);
    const userId = (r as { userId: string }).userId;
    const shop = shops.byUserId(userId)!;
    const [tenant] = await tenantsFor(shop.external_business_id);
    expect(tenant).toBeDefined();
    expect(shop.bizin_tenant_id).toBe(tenant.id);

    // The mock's owner of that business is this seller, as provisionShop would have sent it (no owner_mismatch).
    const user = users.byId(userId)!;
    const detail = await bizin.getTenant(shop.external_business_id);
    expect(detail.owner).toMatchObject({ external_user_id: user.id });
    const replay = await bizin.createTenant(
      { external_business_id: shop.external_business_id, name: shop.name, market_profile: "ir", reply_language: "fa", owner: { external_user_id: user.id, email: user.email!, display_name: user.display_name, locale: "fa" } },
      { idempotencyKey: "demo-seed-replay" },
    );
    expect(replay).toMatchObject({ created: false, tenant: { id: tenant.id } });
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/panel/orders?status=new", "/panel/orders?status=new"],
    ["/panel", "/panel"],
    ["https://evil.example/panel", "/panel"],
    ["//evil.example/panel", "/panel"],
    ["/panel//evil.example", "/panel"],
    ["/panel\\evil", "/panel"],
    ["/panelx", "/panel"],
    ["/admin", "/panel"],
    [undefined, "/panel"],
  ])("%s → %s", (input, want) => expect(safeNextPath(input)).toBe(want));
});
