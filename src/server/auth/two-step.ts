import "server-only";

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

import { getDb, tx } from "@/server/db";

import { verifyPassword } from "./password";
import { hit } from "./rate-limit";
import { base32Encode, newTotpSecret, otpauthUri, verifyTotp } from "./totp";

export const RECOVERY_CODE_COUNT = 8;
const CHALLENGE_MINUTES = 5;
const CHALLENGE_ATTEMPTS = 5;
/** Per user, across challenges: a stolen password must not buy unlimited guesses at a 6-digit code. */
const USER_LIMIT = { max: 10, windowMs: 15 * 60_000 };

export const WRONG_CODE_FA = "کد درست نیست یا قبلاً استفاده شده است.";
export const TOO_MANY_FA = "تلاش‌ها زیاد شد. چند دقیقه‌ی دیگر دوباره امتحان کنید.";

const now = () => new Date().toISOString();

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required for two-step login");
  return Buffer.from(hkdfSync("sha256", secret || "sepordi-dev-session-secret", "sepordi", "totp-secret:v1", 32));
}

/** `v1.<iv>.<tag>.<ciphertext>`, base64url, AES-256-GCM. */
export function encryptSecret(plain: Uint8Array): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): Buffer {
  const [v, iv, tag, ct] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]);
}

interface TotpRow {
  user_id: string;
  secret_enc: string;
  enabled_at: string | null;
  last_step: number;
}

function row(userId: string): TotpRow | undefined {
  return getDb().prepare("SELECT * FROM user_totp WHERE user_id = ?").get(userId) as TotpRow | undefined;
}

export function twoStepEnabled(userId: string): boolean {
  return Boolean(row(userId)?.enabled_at);
}

export function recoveryCodesLeft(userId: string): number {
  const r = getDb().prepare("SELECT COUNT(*) AS n FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL").get(userId) as { n: number };
  return Number(r.n);
}

const hashCode = (code: string) => createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");

function newRecoveryCodes(userId: string): string[] {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const c = base32Encode(randomBytes(7)).slice(0, 10);
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
  const db = getDb();
  db.prepare("DELETE FROM user_recovery_codes WHERE user_id = ?").run(userId);
  const ins = db.prepare("INSERT INTO user_recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)");
  for (const c of codes) ins.run(userId, hashCode(c), now());
  return codes;
}

/** A fresh secret for an unconfirmed enrolment; refused while two-step login is already on. */
export function beginEnrollment(userId: string, account: string): { secret: string; uri: string } | null {
  if (twoStepEnabled(userId)) return null;
  const secret = newTotpSecret();
  getDb()
    .prepare(
      "INSERT INTO user_totp (user_id, secret_enc, enabled_at, last_step, created_at) VALUES (?, ?, NULL, 0, ?) ON CONFLICT (user_id) DO UPDATE SET secret_enc = excluded.secret_enc, enabled_at = NULL, last_step = 0, created_at = excluded.created_at",
    )
    .run(userId, encryptSecret(secret), now());
  return { secret: base32Encode(secret), uri: otpauthUri(secret, account) };
}

type Result<T = null> = { ok: true; data: T } | { ok: false; message: string };

function limited(userId: string): boolean {
  return !hit(`2fa:${userId}`, USER_LIMIT).ok;
}

/** Turns two-step login on once the app proves it holds the secret; returns the recovery codes, shown once. */
export function confirmEnrollment(userId: string, code: string, unixSeconds = Date.now() / 1000): Result<string[]> {
  if (limited(userId)) return { ok: false, message: TOO_MANY_FA };
  return tx(getDb(), (): Result<string[]> => {
    const r = row(userId);
    if (!r || r.enabled_at) return { ok: false, message: "اول فعال‌سازی را از نو شروع کنید." };
    const step = verifyTotp(decryptSecret(r.secret_enc), code.trim(), unixSeconds, r.last_step);
    if (step === null) return { ok: false, message: WRONG_CODE_FA };
    getDb().prepare("UPDATE user_totp SET enabled_at = ?, last_step = ? WHERE user_id = ?").run(now(), step, userId);
    return { ok: true, data: newRecoveryCodes(userId) };
  });
}

/**
 * A code from the app (each good once) or an unused recovery code (spent here). Rate-limited per user. No-op false
 * when two-step login is off.
 */
export function verifySecondFactor(userId: string, rawCode: string, unixSeconds = Date.now() / 1000): Result<"totp" | "recovery"> {
  if (limited(userId)) return { ok: false, message: TOO_MANY_FA };
  const code = rawCode.trim().slice(0, 32);
  return tx(getDb(), (): Result<"totp" | "recovery"> => {
    const r = row(userId);
    if (!r?.enabled_at) return { ok: false, message: WRONG_CODE_FA };
    if (/^\d{6}$/.test(code)) {
      const step = verifyTotp(decryptSecret(r.secret_enc), code, unixSeconds, r.last_step);
      if (step === null) return { ok: false, message: WRONG_CODE_FA };
      getDb().prepare("UPDATE user_totp SET last_step = ? WHERE user_id = ?").run(step, userId);
      return { ok: true, data: "totp" };
    }
    const used = getDb()
      .prepare("UPDATE user_recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL")
      .run(now(), userId, hashCode(code));
    return Number(used.changes) === 1 ? { ok: true, data: "recovery" } : { ok: false, message: WRONG_CODE_FA };
  });
}

export async function disableTwoStep(userId: string, passwordHash: string | null, password: string, code: string): Promise<Result> {
  if (!passwordHash) return { ok: false, message: "برای خاموش کردن ورود دومرحله‌ای، اول برای حسابتان رمز عبور بگذارید." };
  if (!(await verifyPassword(password.slice(0, 256), passwordHash))) return { ok: false, message: "رمز عبور درست نیست." };
  const v = verifySecondFactor(userId, code);
  if (!v.ok) return v;
  tx(getDb(), () => {
    getDb().prepare("DELETE FROM user_totp WHERE user_id = ?").run(userId);
    getDb().prepare("DELETE FROM user_recovery_codes WHERE user_id = ?").run(userId);
  });
  return { ok: true, data: null };
}

// ---- the login step between the password/SMS code and the session ---------------------------------------

export const CHALLENGE_COOKIE = "sp_two_step";
export const CHALLENGE_MAX_AGE = CHALLENGE_MINUTES * 60;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** The raw token for the challenge cookie; the DB keeps its SHA-256. */
export function createChallenge(userId: string): string {
  const token = randomBytes(32).toString("base64url");
  const db = getDb();
  db.prepare("DELETE FROM login_challenges WHERE user_id = ? OR expires_at <= ?").run(userId, now());
  db.prepare("INSERT INTO login_challenges (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
    hashToken(token),
    userId,
    new Date(Date.now() + CHALLENGE_MINUTES * 60_000).toISOString(),
    now(),
  );
  return token;
}

export function challengeUser(token: string | undefined): string | null {
  if (!token || token.length > 128) return null;
  const r = getDb()
    .prepare("SELECT user_id FROM login_challenges WHERE token_hash = ? AND expires_at > ? AND attempts < ?")
    .get(hashToken(token), now(), CHALLENGE_ATTEMPTS) as { user_id: string } | undefined;
  return r?.user_id ?? null;
}

export function failChallenge(token: string): void {
  getDb().prepare("UPDATE login_challenges SET attempts = attempts + 1 WHERE token_hash = ?").run(hashToken(token));
}

export function endChallenge(token: string): void {
  getDb().prepare("DELETE FROM login_challenges WHERE token_hash = ?").run(hashToken(token));
}
