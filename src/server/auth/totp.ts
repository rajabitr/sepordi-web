import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/* RFC 4226 (HOTP) and RFC 6238 (TOTP) on node:crypto. Authenticator apps expect SHA-1, 6 digits, 30 s steps. */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Spaces, dashes, padding and case are ignored; null for any other character. */
export function base32Decode(text: string): Buffer | null {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) return null;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export type TotpAlgorithm = "sha1" | "sha256" | "sha512";

export function hotp(secret: Uint8Array, counter: number, digits = 6, algorithm: TotpAlgorithm = "sha1"): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const TOTP_STEP_SECONDS = 30;

export function timeStep(unixSeconds: number, step = TOTP_STEP_SECONDS): number {
  return Math.floor(unixSeconds / step);
}

export function totp(secret: Uint8Array, unixSeconds: number, digits = 6, algorithm: TotpAlgorithm = "sha1"): string {
  return hotp(secret, timeStep(unixSeconds), digits, algorithm);
}

/**
 * The time step `code` belongs to, within one step of clock drift either way, or null. A step at or below
 * `lastStep` is refused: each code (and every older one) is good once.
 */
export function verifyTotp(secret: Uint8Array, code: string, unixSeconds: number, lastStep = 0): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = timeStep(unixSeconds);
  const given = Buffer.from(code);
  for (const step of [now - 1, now, now + 1]) {
    if (step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), given)) return step;
  }
  return null;
}

export function newTotpSecret(): Buffer {
  return randomBytes(20);
}

/** The `otpauth://` URI authenticator apps read from a QR code. */
export function otpauthUri(secret: Uint8Array, account: string, issuer = "سپردی"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const q = new URLSearchParams({ secret: base32Encode(secret), issuer, algorithm: "SHA1", digits: "6", period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${q.toString()}`;
}
