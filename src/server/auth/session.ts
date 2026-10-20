import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { sessions, shops, type ShopRow, type UserRow } from "@/server/db/repo";

export const SESSION_COOKIE = "sp_session";
const SESSION_DAYS = 30;

/** A user as the app may hold it: never the password hash. */
export type SessionUser = Omit<UserRow, "password_hash">;

export interface SellerContext {
  user: SessionUser;
  /**
   * The seller's own shop row. `shop.external_business_id` is the ONLY value ever passed as `ext` to the Partner
   * API on a seller's behalf: never take an ext, shop id or tenant id from a URL, form, body or header.
   */
  shop: ShopRow;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function publicUser(u: UserRow): SessionUser {
  const { password_hash: _omit, ...rest } = u;
  void _omit;
  return rest;
}

/**
 * Starts a session for `userId` and sets the cookie. Only from a Server Action or Route Handler (cookies are
 * read-only while rendering). The raw token lives only in the cookie; the DB keeps its SHA-256.
 */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 255) ?? null;
  sessions.create(hashToken(token), userId, expires, ua);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) sessions.delete(hashToken(token));
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached per request. */
export const getSession = cache(async (): Promise<{ user: SessionUser } | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  const user = sessions.userFor(hashToken(token));
  return user ? { user: publicUser(user) } : null;
});

/** For Route Handlers that answer 401 instead of redirecting. */
export async function getSeller(): Promise<SellerContext | null> {
  const s = await getSession();
  if (!s || s.user.role !== "seller") return null;
  const shop = shops.byUserId(s.user.id);
  return shop ? { user: s.user, shop } : null;
}

/** Pages, layouts and Server Actions of the seller panel. Redirects when there is no seller with a shop. */
export async function requireSeller(): Promise<SellerContext> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.user.role !== "seller") redirect("/admin");
  const shop = shops.byUserId(s.user.id);
  // A seller whose shop was never provisioned finishes signup first.
  if (!shop) redirect("/register?step=shop");
  return { user: s.user, shop };
}

/** sepordi staff screens. Anyone else gets the login page. */
export async function requireAdmin(): Promise<{ user: SessionUser }> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.user.role !== "admin") redirect("/panel");
  return s;
}
