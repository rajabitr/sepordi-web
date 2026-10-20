import "server-only";

import { checkPassword, FIELD_MESSAGES, faWait, normalizeCode } from "@/components/auth/rules";
import { normalizeMobile } from "@/lib/phone";
import { requestOtp, verifyOtp, OTP_MESSAGES_FA } from "@/server/auth/otp";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { hit } from "@/server/auth/rate-limit";
import { users } from "@/server/db/repo";

export interface AuthError {
  message: string;
  field?: "phone" | "code" | "password";
  retryAfterSeconds?: number;
}

export type AuthResult<T = object> = ({ ok: true } & T) | { ok: false; error: AuthError };

/** One line for every wrong number / wrong password pair: the form never tells which part was wrong. */
export const BAD_CREDENTIALS_FA = "شماره موبایل یا رمز عبور درست نیست.";
export const PHONE_TAKEN_FA = "با این شماره قبلاً ثبت‌نام شده است. از صفحه‌ی ورود وارد شوید.";
export const RESEND_SECONDS = 60;

const MIN = 60_000;

function tooMany(retryAfterSeconds: number, what = "تلاش‌ها"): AuthError {
  return { message: `${what} زیاد شد. ${faWait(retryAfterSeconds)} دیگر دوباره امتحان کنید.`, retryAfterSeconds };
}

function limit(keys: [string, number, number][]): AuthError | undefined {
  for (const [key, max, windowMs] of keys) {
    const r = hit(key, { max, windowMs });
    if (!r.ok) return tooMany(r.retryAfterSeconds);
  }
}

let dummyHash: Promise<string> | undefined;
/** Spends the same scrypt time on an unknown number as on a known one. */
const dummy = () => (dummyHash ??= hashPassword("sepordi-timing-equaliser"));

export async function signInWithPassword(rawPhone: string, password: string, ip: string): Promise<AuthResult<{ userId: string }>> {
  const phone = normalizeMobile(rawPhone);
  if (!phone) return { ok: false, error: { message: FIELD_MESSAGES.phone, field: "phone" } };
  if (!password) return { ok: false, error: { message: "رمز عبور را وارد کنید.", field: "password" } };
  const limited = limit([
    [`login:pw:phone:${phone}`, 5, 15 * MIN],
    [`login:pw:ip:${ip}`, 30, 15 * MIN],
  ]);
  if (limited) return { ok: false, error: limited };
  const user = users.byPhone(phone);
  const good = await verifyPassword(password.slice(0, 256), user?.password_hash ?? (await dummy()));
  if (!user || !user.password_hash || !good) return { ok: false, error: { message: BAD_CREDENTIALS_FA, field: "password" } };
  return { ok: true, userId: user.id };
}

/**
 * Sends a code to any valid number, registered or not, so the answer never reveals an account; the per-number
 * and per-IP limits inside requestOtp bound the SMS spend.
 */
export async function sendCode(rawPhone: string, ip: string): Promise<AuthResult<{ resendAfterSeconds: number }>> {
  const phone = normalizeMobile(rawPhone);
  if (!phone) return { ok: false, error: { message: FIELD_MESSAGES.phone, field: "phone" } };
  const r = await requestOtp(phone, ip);
  if (r.ok) return { ok: true, resendAfterSeconds: RESEND_SECONDS };
  if (r.reason === "rate_limited" && r.retryAfterSeconds) return { ok: false, error: tooMany(r.retryAfterSeconds, "درخواست کد") };
  return { ok: false, error: { message: OTP_MESSAGES_FA[r.reason] } };
}

/**
 * A matching code proves the number, so a new number becomes a user here (its signup goes on to the shop step).
 */
export function signInWithCode(rawPhone: string, rawCode: string, ip: string): AuthResult<{ userId: string; isNew: boolean }> {
  const phone = normalizeMobile(rawPhone);
  if (!phone) return { ok: false, error: { message: FIELD_MESSAGES.phone, field: "phone" } };
  const code = normalizeCode(rawCode);
  if (!/^\d{6}$/.test(code)) return { ok: false, error: { message: FIELD_MESSAGES.code, field: "code" } };
  const limited = limit([[`login:otp:ip:${ip}`, 30, 15 * MIN]]);
  if (limited) return { ok: false, error: { ...limited, field: "code" } };
  const r = verifyOtp(phone, code);
  if (!r.ok) return { ok: false, error: { message: OTP_MESSAGES_FA[r.reason], field: "code" } };
  const user = users.byPhone(phone);
  if (user) return { ok: true, userId: user.id, isNew: false };
  return { ok: true, userId: users.create({ phone, displayName: "" }).id, isNew: true };
}

/** Password signup, for deployments without an SMS provider. */
export async function registerWithPassword(rawPhone: string, password: string, ip: string): Promise<AuthResult<{ userId: string }>> {
  const phone = normalizeMobile(rawPhone);
  if (!phone) return { ok: false, error: { message: FIELD_MESSAGES.phone, field: "phone" } };
  const weak = checkPassword(password);
  if (weak || password.length > 256) return { ok: false, error: { message: weak ?? "رمز عبور حداکثر ۲۵۶ کاراکتر است.", field: "password" } };
  const limited = limit([[`register:ip:${ip}`, 10, 60 * MIN]]);
  if (limited) return { ok: false, error: limited };
  if (users.byPhone(phone)) return { ok: false, error: { message: PHONE_TAKEN_FA, field: "phone" } };
  const passwordHash = await hashPassword(password);
  try {
    return { ok: true, userId: users.create({ phone, displayName: "", passwordHash }).id };
  } catch {
    // Lost a race on the unique phone during the hash.
    return { ok: false, error: { message: PHONE_TAKEN_FA, field: "phone" } };
  }
}
