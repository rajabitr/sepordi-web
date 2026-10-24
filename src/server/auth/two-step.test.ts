import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimits } from "@/server/auth/rate-limit";
import { openDb, setDbForTests } from "@/server/db";
import { sessions, users } from "@/server/db/repo";

import { base32Decode, base32Encode, hotp, timeStep, totp, verifyTotp, type TotpAlgorithm } from "./totp";
import {
  CHALLENGE_COOKIE,
  beginEnrollment,
  confirmEnrollment,
  decryptSecret,
  disableTwoStep,
  encryptSecret,
  recoveryCodesLeft,
  twoStepEnabled,
  verifySecondFactor,
} from "./two-step";

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

const { jar } = await import("@/test/cookie-jar");
const { loginWithPasswordAction, verifyTwoStepAction } = await import("@/server/signup/actions");
const { hashPassword } = await import("./password");
const { getSession } = await import("./session");

beforeEach(() => {
  resetRateLimits();
  setDbForTests(openDb(":memory:"));
  jar.clear();
});
afterEach(() => setDbForTests(undefined));

// RFC 6238 Appendix B. The seeds are the ASCII digits repeated to the hash's block-friendly length.
const SEEDS: Record<TotpAlgorithm, Buffer> = {
  sha1: Buffer.from("12345678901234567890"),
  sha256: Buffer.from("12345678901234567890123456789012"),
  sha512: Buffer.from("1234567890123456789012345678901234567890123456789012345678901234"),
};
const VECTORS: [number, string, TotpAlgorithm][] = [
  [59, "94287082", "sha1"],
  [59, "46119246", "sha256"],
  [59, "90693936", "sha512"],
  [1111111109, "07081804", "sha1"],
  [1111111109, "68084774", "sha256"],
  [1111111109, "25091201", "sha512"],
  [1111111111, "14050471", "sha1"],
  [1111111111, "67062674", "sha256"],
  [1111111111, "99943326", "sha512"],
  [1234567890, "89005924", "sha1"],
  [1234567890, "91819424", "sha256"],
  [1234567890, "93441116", "sha512"],
  [2000000000, "69279037", "sha1"],
  [2000000000, "90698825", "sha256"],
  [2000000000, "38618901", "sha512"],
  [20000000000, "65353130", "sha1"],
  [20000000000, "77737706", "sha256"],
  [20000000000, "47863826", "sha512"],
];

describe("RFC 6238", () => {
  it.each(VECTORS)("T=%i → %s (%s)", (t, code, algo) => {
    expect(totp(SEEDS[algo], t, 8, algo)).toBe(code);
  });

  it("RFC 4226 HOTP vectors", () => {
    const want = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expect(want.map((_, i) => hotp(SEEDS.sha1, i))).toEqual(want);
  });

  it("base32 round-trips and reads the RFC 4648 vector", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("mzxw 6ytb-oi======")?.toString()).toBe("foobar");
    expect(base32Decode("not base32!")).toBeNull();
  });
});

describe("verifyTotp", () => {
  const secret = SEEDS.sha1;
  const t = 1_700_000_000;
  const at = (offsetSteps: number) => totp(secret, t + offsetSteps * 30);

  it("accepts one step of drift either way and nothing further", () => {
    expect(verifyTotp(secret, at(0), t)).toBe(timeStep(t));
    expect(verifyTotp(secret, at(-1), t)).toBe(timeStep(t) - 1);
    expect(verifyTotp(secret, at(1), t)).toBe(timeStep(t) + 1);
    expect(verifyTotp(secret, at(-2), t)).toBeNull();
    expect(verifyTotp(secret, at(2), t)).toBeNull();
  });

  it("refuses a replay: a code at or below the last accepted step", () => {
    const step = verifyTotp(secret, at(0), t)!;
    expect(verifyTotp(secret, at(0), t, step)).toBeNull();
    expect(verifyTotp(secret, at(-1), t, step)).toBeNull();
    expect(verifyTotp(secret, at(1), t, step)).toBe(step + 1);
  });

  it("refuses anything but six digits", () => {
    expect(verifyTotp(secret, "12345", t)).toBeNull();
    expect(verifyTotp(secret, `${at(0)}0`, t)).toBeNull();
  });
});

describe("secret at rest", () => {
  it("is AES-256-GCM: round-trips, differs per write, and a flipped byte fails", () => {
    const secret = Buffer.from("0123456789abcdefghij");
    const a = encryptSecret(secret);
    expect(a).not.toContain(base32Encode(secret));
    expect(encryptSecret(secret)).not.toBe(a);
    expect(decryptSecret(a).equals(secret)).toBe(true);
    const parts = a.split(".");
    const ct = Buffer.from(parts[3], "base64url");
    ct[0] ^= 1;
    expect(() => decryptSecret([...parts.slice(0, 3), ct.toString("base64url")].join("."))).toThrow();
  });

  it("depends on SESSION_SECRET", () => {
    const prev = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "one";
    const a = encryptSecret(Buffer.from("x"));
    process.env.SESSION_SECRET = "two";
    expect(() => decryptSecret(a)).toThrow();
    process.env.SESSION_SECRET = prev;
  });
});

function enrol(userId: string, now: number) {
  const e = beginEnrollment(userId, "09120000000")!;
  const secret = base32Decode(e.secret)!;
  const r = confirmEnrollment(userId, totp(secret, now), now);
  if (!r.ok) throw new Error(r.message);
  return { secret, codes: r.data };
}

describe("enrolment and recovery codes", () => {
  it("turns on only after a good code, and hands out eight codes once", () => {
    const u = users.create({ phone: "09120000002", displayName: "" });
    const e = beginEnrollment(u.id, u.phone)!;
    expect(e.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(twoStepEnabled(u.id)).toBe(false);
    const now = 1_700_000_000;
    expect(confirmEnrollment(u.id, "000000", now)).toMatchObject({ ok: false });
    const r = confirmEnrollment(u.id, totp(base32Decode(e.secret)!, now), now);
    expect(r.ok && r.data).toHaveLength(8);
    expect(twoStepEnabled(u.id)).toBe(true);
    expect(beginEnrollment(u.id, u.phone)).toBeNull();
  });

  it("a recovery code works once", () => {
    const u = users.create({ phone: "09120000003", displayName: "" });
    const { codes } = enrol(u.id, 1_700_000_000);
    expect(verifySecondFactor(u.id, codes[0].toLowerCase())).toEqual({ ok: true, data: "recovery" });
    expect(verifySecondFactor(u.id, codes[0])).toMatchObject({ ok: false });
    expect(recoveryCodesLeft(u.id)).toBe(7);
  });

  it("an app code works once (the enrolment code included)", () => {
    const u = users.create({ phone: "09120000004", displayName: "" });
    const now = 1_700_000_000;
    const { secret } = enrol(u.id, now);
    expect(verifySecondFactor(u.id, totp(secret, now), now)).toMatchObject({ ok: false });
    expect(verifySecondFactor(u.id, totp(secret, now + 30), now + 30)).toEqual({ ok: true, data: "totp" });
    expect(verifySecondFactor(u.id, totp(secret, now + 30), now + 30)).toMatchObject({ ok: false });
  });

  it("rate-limits guesses per user", () => {
    const u = users.create({ phone: "09120000005", displayName: "" });
    const now = 1_700_000_000;
    const { secret } = enrol(u.id, now);
    for (let i = 0; i < 9; i++) verifySecondFactor(u.id, "000000", now);
    expect(verifySecondFactor(u.id, totp(secret, now + 30), now + 30)).toMatchObject({ ok: false, message: expect.stringContaining("زیاد") });
  });

  it("disabling needs the password and a code", async () => {
    const hash = await hashPassword("a-long-password-1");
    const u = users.create({ phone: "09120000006", displayName: "", passwordHash: hash });
    const { codes } = enrol(u.id, Date.now() / 1000);
    expect(await disableTwoStep(u.id, hash, "wrong-password", codes[0])).toMatchObject({ ok: false });
    expect(await disableTwoStep(u.id, hash, "a-long-password-1", "ZZZZZ-ZZZZZ")).toMatchObject({ ok: false });
    expect(twoStepEnabled(u.id)).toBe(true);
    expect(await disableTwoStep(u.id, hash, "a-long-password-1", codes[1])).toEqual({ ok: true, data: null });
    expect(twoStepEnabled(u.id)).toBe(false);
  });
});

describe("login with two-step on", () => {
  it("a right password opens no session until the second factor passes", async () => {
    const u = users.create({ phone: "09120000007", displayName: "", passwordHash: await hashPassword("a-long-password-1") });
    const { codes } = enrol(u.id, Date.now() / 1000);

    await expect(loginWithPasswordAction(u.phone, "a-long-password-1", "/panel/orders")).rejects.toThrow("REDIRECT /login/two-step?next=%2Fpanel%2Forders");
    expect(sessions.listForUser(u.id)).toHaveLength(0);
    expect(jar.has(CHALLENGE_COOKIE)).toBe(true);
    expect(await getSession()).toBeNull();

    expect(await verifyTwoStepAction("ZZZZZ-ZZZZZ", "/panel/orders")).toMatchObject({ ok: false, error: { field: "code" } });
    expect(sessions.listForUser(u.id)).toHaveLength(0);

    await expect(verifyTwoStepAction(codes[0], "/panel/orders")).rejects.toThrow("REDIRECT");
    expect(sessions.listForUser(u.id)).toHaveLength(1);
    expect(jar.has(CHALLENGE_COOKIE)).toBe(false);
    expect((await getSession())?.user.id).toBe(u.id);
  });

  it("a challenge dies after five wrong codes", async () => {
    const u = users.create({ phone: "09120000008", displayName: "", passwordHash: await hashPassword("a-long-password-1") });
    const { codes } = enrol(u.id, Date.now() / 1000);
    await expect(loginWithPasswordAction(u.phone, "a-long-password-1", "/panel")).rejects.toThrow("REDIRECT /login/two-step");
    for (let i = 0; i < 5; i++) await verifyTwoStepAction("00000-00000", "/panel");
    expect(await verifyTwoStepAction(codes[0], "/panel")).toMatchObject({ ok: false });
    expect(sessions.listForUser(u.id)).toHaveLength(0);
  });

  it("without two-step the password alone signs in", async () => {
    const u = users.create({ phone: "09120000009", displayName: "", passwordHash: await hashPassword("a-long-password-1") });
    await expect(loginWithPasswordAction(u.phone, "a-long-password-1", "/panel")).rejects.toThrow("REDIRECT /register?step=shop");
    expect(sessions.listForUser(u.id)).toHaveLength(1);
  });
});
