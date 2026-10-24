import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { normalizeMobile } from "@/lib/phone";
import { members, sessions, type MemberRole, type ShopRow, type UserRow } from "@/server/db/repo";
import { can, type Capability } from "@/server/team/roles";

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
  /** The user's role in `shop`, read on every request: a changed or removed member loses access at once. */
  role: MemberRole;
}

interface LiveSession {
  user: SessionUser;
  /** The session's current shop as stored; trusted only after `members.shopFor` re-checks the membership. */
  shopId: string | null;
  tokenHash: string;
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
  sessions.purgeExpired();
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
export const getSession = cache(async (): Promise<LiveSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  // Session expiry compares against the clock, which a runtime prefetch may not read.
  await connection();
  const tokenHash = hashToken(token);
  const live = sessions.lookup(tokenHash);
  return live ? { user: publicUser(live.user), shopId: live.shopId, tokenHash } : null;
});

/**
 * Makes `shopId` this session's current shop. The id comes from the browser, so it counts only when the user is a
 * member of that shop; false otherwise, and nothing changes.
 */
export async function switchCurrentShop(shopId: unknown): Promise<boolean> {
  const s = await getSession();
  if (!s || isAdminUser(s.user) || typeof shopId !== "string" || shopId.length > 64) return false;
  if (!members.get(shopId, s.user.id)) return false;
  sessions.setShop(s.tokenHash, shopId);
  return true;
}

/**
 * SEPORDI_ADMIN_PHONES: comma-separated mobiles of sepordi staff, in any common shape. A user whose phone is listed
 * is staff whatever their row's role, so the first admin needs no SQL.
 */
export function isEnvAdmin(phone: string, list: string | undefined = process.env.SEPORDI_ADMIN_PHONES): boolean {
  const me = normalizeMobile(phone);
  if (!me || !list) return false;
  return list.split(",").some((p) => normalizeMobile(p) === me);
}

/** The one definition of sepordi staff: the admin role, or a phone in SEPORDI_ADMIN_PHONES. */
export function isAdminUser(user: Pick<SessionUser, "role" | "phone">): boolean {
  return user.role === "admin" || isEnvAdmin(user.phone);
}

/**
 * For Route Handlers that answer 401 instead of redirecting. With `cap`, a member whose role lacks it is null too,
 * like a stranger.
 */
export async function getSeller(cap?: Capability): Promise<SellerContext | null> {
  const s = await getSession();
  if (!s || isAdminUser(s.user)) return null;
  const m = members.shopFor(s.user.id, s.shopId);
  if (!m || (cap && !can(m.role, cap))) return null;
  return { user: s.user, shop: m.shop, role: m.role };
}

/** For owner-only Route Handlers: null for an agent as for a stranger. */
export async function getShopOwner(): Promise<SellerContext | null> {
  const s = await getSeller();
  return s?.role === "owner" ? s : null;
}

/** Pages, layouts and Server Actions of the seller panel. Redirects when there is no seller with a shop. */
export async function requireSeller(): Promise<SellerContext> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (isAdminUser(s.user)) redirect("/admin");
  const m = members.shopFor(s.user.id, s.shopId);
  // A seller whose shop was never provisioned finishes signup first.
  if (!m) redirect("/register?step=shop");
  return { user: s.user, shop: m.shop, role: m.role };
}

/**
 * Pages and Server Actions that need one capability of the role matrix (`server/team/roles`). A member without it is
 * sent back to the dashboard; hiding the menu item is not the guard, this is.
 */
export async function requireCapability(cap: Capability): Promise<SellerContext> {
  const s = await requireSeller();
  if (!can(s.role, cap)) redirect("/panel");
  return s;
}

/** Owner-only pages and Server Actions that no finer capability describes. */
export async function requireShopOwner(): Promise<SellerContext> {
  const s = await requireSeller();
  if (s.role !== "owner") redirect("/panel");
  return s;
}

/** For staff Route Handlers that answer 401/403 instead of redirecting. */
export async function getAdmin(): Promise<{ user: SessionUser } | null> {
  const s = await getSession();
  return s && isAdminUser(s.user) ? s : null;
}

/** sepordi staff screens. Anyone else gets the login page. */
export async function requireAdmin(): Promise<{ user: SessionUser }> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdminUser(s.user)) redirect("/panel");
  return s;
}
