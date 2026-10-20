import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb, setDbForTests } from "@/server/db";
import { sessions, shops, users } from "@/server/db/repo";

import { requestOtp, verifyOtp } from "./otp";
import { hashPassword, verifyPassword } from "./password";
import { resetRateLimits } from "./rate-limit";
import { hashToken, requireSeller, SESSION_COOKIE } from "./session";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

beforeEach(() => {
  setDbForTests(openDb(":memory:"));
  resetRateLimits();
  jar.clear();
});
afterEach(() => setDbForTests(undefined));

describe("password", () => {
  it("verifies the right password only", async () => {
    const h = await hashPassword("گذرواژه-۱۲۳۴");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("گذرواژه-۱۲۳۴", h)).toBe(true);
    expect(await verifyPassword("گذرواژه-۱۲۳", h)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "md5$abc")).toBe(false);
  });
});

describe("otp", () => {
  const phone = "09123456789";
  const lastCode = (spy: ReturnType<typeof vi.spyOn>) => String(spy.mock.calls.at(-1)?.[0]).match(/→ (\d{6})/)?.[1] ?? "";

  it("accepts the sent code once, and refuses after 5 misses", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect((await requestOtp(phone, "1.1.1.1")).ok).toBe(true);
    const code = lastCode(log);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyOtp(phone, code)).toEqual({ ok: true });
    expect(verifyOtp(phone, code)).toEqual({ ok: false, reason: "expired" });

    resetRateLimits();
    await requestOtp(phone, "1.1.1.1");
    const fresh = lastCode(log);
    const wrong = fresh === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) expect(verifyOtp(phone, wrong)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyOtp(phone, wrong)).toEqual({ ok: false, reason: "too_many_attempts" });
    expect(verifyOtp(phone, fresh)).toEqual({ ok: false, reason: "too_many_attempts" });
    log.mockRestore();
  });

  it("limits requests per phone", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect((await requestOtp(phone, "1.1.1.1")).ok).toBe(true);
    expect(await requestOtp(phone, "2.2.2.2")).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("expires after two minutes", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    await requestOtp(phone, "1.1.1.1");
    const code = lastCode(log);
    vi.setSystemTime(Date.now() + 2 * 60_000 + 1);
    expect(verifyOtp(phone, code)).toEqual({ ok: false, reason: "expired" });
    vi.useRealTimers();
  });
});

describe("requireSeller", () => {
  it("returns the shop of the session's user and nothing else", async () => {
    const a = users.create({ phone: "09120000011", displayName: "الف" });
    const b = users.create({ phone: "09120000022", displayName: "ب" });
    shops.create({ userId: a.id, externalBusinessId: "ext-a", name: "فروشگاه الف" });
    shops.create({ userId: b.id, externalBusinessId: "ext-b", name: "فروشگاه ب" });
    jar.set(SESSION_COOKIE, "token-of-b");
    sessions.create(hashToken("token-of-b"), b.id, new Date(Date.now() + 60_000), null);

    const ctx = await requireSeller();
    expect(ctx.shop.external_business_id).toBe("ext-b");
    expect(ctx.user.id).toBe(b.id);
    expect("password_hash" in ctx.user).toBe(false);
  });

  it("redirects without a live session", async () => {
    await expect(requireSeller()).rejects.toThrow("REDIRECT /login");
    const u = users.create({ phone: "09120000033", displayName: "ج" });
    jar.set(SESSION_COOKIE, "expired");
    sessions.create(hashToken("expired"), u.id, new Date(Date.now() - 1000), null);
    await expect(requireSeller()).rejects.toThrow("REDIRECT /login");
  });

  it("sends a seller without a shop to finish signup, and an admin to /admin", async () => {
    const s = users.create({ phone: "09120000044", displayName: "د" });
    jar.set(SESSION_COOKIE, "t1");
    sessions.create(hashToken("t1"), s.id, new Date(Date.now() + 60_000), null);
    await expect(requireSeller()).rejects.toThrow("REDIRECT /register?step=shop");

    const admin = users.create({ phone: "09120000055", displayName: "ه", role: "admin" });
    jar.set(SESSION_COOKIE, "t2");
    sessions.create(hashToken("t2"), admin.id, new Date(Date.now() + 60_000), null);
    await expect(requireSeller()).rejects.toThrow("REDIRECT /admin");
  });
});
