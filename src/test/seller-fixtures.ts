import { randomBytes } from "node:crypto";

import { hashToken, SESSION_COOKIE } from "@/server/auth/session";
import { members, sessions, shops, users, type MemberRole, type ShopRow, type UserRow } from "@/server/db/repo";

import { jar } from "./cookie-jar";

/*
 * Shared by the panel tests. The test file mocks next/headers with `./cookie-jar` as the cookie store, so signing in
 * is a session row plus a cookie in the jar. Import this module only after the mocks (dynamic import).
 */

export { jar };

let n = 0;
export const phone = () => `0912${String(1000000 + ++n).slice(-7)}`;
export const user = (p = phone()) => users.create({ phone: p, displayName: `کاربر ${n}` });

/** A shop; its creator becomes its owner through the migrations' trigger. */
export function shopOf(owner: UserRow, ext: string): ShopRow {
  return shops.create({ userId: owner.id, externalBusinessId: ext, name: ext, bizinTenantId: `t-${ext}` });
}

export function member(shop: ShopRow, role: MemberRole): UserRow {
  const u = user();
  members.add(shop.id, u.id, role);
  return u;
}

/** Returns the session's token hash. */
export function signIn(u: UserRow): string {
  const token = randomBytes(16).toString("base64url");
  sessions.create(hashToken(token), u.id, new Date(Date.now() + 3600_000), null);
  jar.set(SESSION_COOKIE, token);
  return hashToken(token);
}
