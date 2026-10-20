import "server-only";

import { cookies } from "next/headers";

import { hashToken, SESSION_COOKIE } from "@/server/auth/session";
import { getDb } from "@/server/db";

/* Account writes the shared repo does not offer; every one is keyed by the signed-in user's id. */

export function updateProfile(userId: string, displayName: string, email: string | null): "ok" | "email_taken" {
  try {
    getDb().prepare("UPDATE users SET display_name = ?, email = ? WHERE id = ?").run(displayName, email, userId);
    return "ok";
  } catch (e) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) return "email_taken";
    throw e;
  }
}

export function passwordHashOf(userId: string): string | null {
  const r = getDb().prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string | null } | undefined;
  return r?.password_hash ?? null;
}

/** Every session of the user but the one making this request. Returns how many were ended. */
export async function endOtherSessions(userId: string): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const keep = token ? hashToken(token) : "";
  const r = getDb().prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, keep);
  return Number(r.changes);
}

export function otherSessionCount(userId: string, currentToken: string | undefined): number {
  const keep = currentToken ? hashToken(currentToken) : "";
  const r = getDb()
    .prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND token_hash != ? AND expires_at > ?")
    .get(userId, keep, new Date().toISOString()) as { n: number };
  return Number(r.n);
}
