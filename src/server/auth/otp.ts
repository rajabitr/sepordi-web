import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { getDb } from "@/server/db";

import { hit } from "./rate-limit";

export const OTP_TTL_MS = 2 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
const OTP_LENGTH = 6;

/** Sends a code to a normalised mobile (09xxxxxxxxx). */
export interface OtpProvider {
  readonly name: "console" | "kavenegar";
  send(phone: string, code: string): Promise<void>;
}

const consoleProvider: OtpProvider = {
  name: "console",
  async send(phone, code) {
    console.info(`[sepordi otp] ${phone} → ${code}`);
  },
};

function kavenegarProvider(apiKey: string, template: string): OtpProvider {
  return {
    name: "kavenegar",
    async send(phone, code) {
      const qs = new URLSearchParams({ receptor: phone, token: code, template });
      // The API key is part of the path: never log this URL.
      const res = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json?${qs}`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => null)) as { return?: { status?: number } } | null;
      if (!res.ok || body?.return?.status !== 200) {
        throw new Error(`kavenegar verify/lookup failed: HTTP ${res.status}, status ${body?.return?.status ?? "?"}`);
      }
    },
  };
}

/**
 * Kavenegar when configured; the console logger only outside production. Null means "no OTP here": login then
 * uses mobile + password.
 */
export function otpProvider(): OtpProvider | null {
  const key = process.env.KAVENEGAR_API_KEY;
  const template = process.env.KAVENEGAR_TEMPLATE;
  if (key && template) return kavenegarProvider(key, template);
  if (process.env.NODE_ENV !== "production") return consoleProvider;
  return null;
}

function codeHash(phone: string, code: string): string {
  // Keyed so a leaked DB row cannot be brute-forced offline in a million tries.
  return createHmac("sha256", process.env.SESSION_SECRET || "sepordi-dev-otp").update(`${phone}:${code}`).digest("hex");
}

export type RequestOtpResult =
  | { ok: true; expiresAt: string }
  | { ok: false; reason: "unavailable" | "rate_limited" | "send_failed"; retryAfterSeconds?: number };

/** Issues a fresh 6-digit code (replacing any earlier one) after the per-phone and per-IP limits. */
export async function requestOtp(phone: string, ip: string): Promise<RequestOtpResult> {
  const provider = otpProvider();
  if (!provider) return { ok: false, reason: "unavailable" };
  for (const [key, limit] of [
    [`otp:phone:min:${phone}`, { max: 1, windowMs: 60_000 }],
    [`otp:phone:hour:${phone}`, { max: 5, windowMs: 3600_000 }],
    [`otp:ip:hour:${ip}`, { max: 20, windowMs: 3600_000 }],
  ] as const) {
    const r = hit(key, limit);
    if (!r.ok) return { ok: false, reason: "rate_limited", retryAfterSeconds: r.retryAfterSeconds };
  }
  const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  getDb()
    .prepare(
      `INSERT INTO otp_codes (phone, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)
       ON CONFLICT (phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
    )
    .run(phone, codeHash(phone, code), expiresAt, new Date().toISOString());
  try {
    await provider.send(phone, code);
  } catch (e) {
    console.error("[sepordi otp] send failed", e instanceof Error ? e.message : e);
    getDb().prepare("DELETE FROM otp_codes WHERE phone = ?").run(phone);
    return { ok: false, reason: "send_failed" };
  }
  return { ok: true, expiresAt };
}

export type VerifyOtpResult = { ok: true } | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

/** Single use: a match deletes the code; a miss spends one of the 5 attempts. */
export function verifyOtp(phone: string, code: string): VerifyOtpResult {
  const db = getDb();
  const row = db.prepare("SELECT code_hash, expires_at, attempts FROM otp_codes WHERE phone = ?").get(phone) as
    | { code_hash: string; expires_at: string; attempts: number }
    | undefined;
  if (!row) return { ok: false, reason: "expired" };
  if (row.expires_at <= new Date().toISOString()) {
    db.prepare("DELETE FROM otp_codes WHERE phone = ?").run(phone);
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
  const want = Buffer.from(row.code_hash, "hex");
  const got = Buffer.from(codeHash(phone, code), "hex");
  if (/^\d{6}$/.test(code) && want.length === got.length && timingSafeEqual(want, got)) {
    db.prepare("DELETE FROM otp_codes WHERE phone = ?").run(phone);
    return { ok: true };
  }
  db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?").run(phone);
  return { ok: false, reason: row.attempts + 1 >= OTP_MAX_ATTEMPTS ? "too_many_attempts" : "invalid" };
}

/** Farsi text for each OTP outcome, for the login form. */
export const OTP_MESSAGES_FA = {
  unavailable: "ورود با کد پیامکی فعلاً ممکن نیست. با رمز عبور وارد شوید.",
  rate_limited: "درخواست کد زیاد شد. کمی بعد دوباره امتحان کنید.",
  send_failed: "پیامک کد ارسال نشد. چند لحظه بعد دوباره امتحان کنید.",
  invalid: "کد تأیید درست نیست.",
  expired: "کد تأیید منقضی شده است. کد تازه بگیرید.",
  too_many_attempts: "تعداد تلاش‌ها زیاد شد. کد تازه بگیرید.",
} as const;
