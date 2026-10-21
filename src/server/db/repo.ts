import "server-only";

import { randomUUID } from "node:crypto";

import { getDb } from "./index";

export type Role = "seller" | "admin";

export interface UserRow {
  id: string;
  phone: string;
  email: string | null;
  display_name: string;
  password_hash: string | null;
  role: Role;
  created_at: string;
}

export interface ShopRow {
  id: string;
  user_id: string;
  external_business_id: string;
  name: string;
  bizin_tenant_id: string | null;
  created_at: string;
}

export type MemberRole = "owner" | "agent";

export interface ShopMemberRow {
  shop_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

/** A member as the team screen shows them. */
export interface TeamMember extends ShopMemberRow {
  phone: string;
  display_name: string;
}

export interface ShopInviteRow {
  id: string;
  shop_id: string;
  /** Normalised 09xxxxxxxxx. */
  phone: string;
  role: MemberRole;
  invited_by: string | null;
  created_at: string;
  accepted_at: string | null;
}

export interface WebhookEventRow {
  event_id: string;
  type: string;
  ext: string | null;
  payload: string;
  received_at: string;
  read_at: string | null;
}

export type CreditOrderStatus = "pending" | "paid" | "granted" | "rejected" | "failed" | "cancelled";
export type CreditMethod = "zarinpal" | "card_to_card";

export interface CreditOrderRow {
  id: string;
  shop_id: string;
  plan_code: string;
  amount_toman: number;
  amount_rial: number;
  status: CreditOrderStatus;
  method: CreditMethod;
  /** The seller's transfer reference (card-to-card) or Zarinpal's ref_id once verified. */
  ref: string | null;
  /** Zarinpal's payment authority. */
  authority: string | null;
  created_at: string;
  verified_at: string | null;
  granted_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: string | null;
}

const now = () => new Date().toISOString();

// ---- users -----------------------------------------------------------------------------------------------

export const users = {
  byId(id: string): UserRow | undefined {
    return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  },
  /** `phone` must already be normalised to 09xxxxxxxxx (lib/phone). */
  byPhone(phone: string): UserRow | undefined {
    return getDb().prepare("SELECT * FROM users WHERE phone = ?").get(phone) as UserRow | undefined;
  },
  create(input: { phone: string; displayName: string; email?: string | null; passwordHash?: string | null; role?: Role }): UserRow {
    const row: UserRow = {
      id: randomUUID(),
      phone: input.phone,
      email: input.email ?? null,
      display_name: input.displayName,
      password_hash: input.passwordHash ?? null,
      role: input.role ?? "seller",
      created_at: now(),
    };
    getDb()
      .prepare("INSERT INTO users (id, phone, email, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, row.phone, row.email, row.display_name, row.password_hash, row.role, row.created_at);
    return row;
  },
  setPassword(id: string, passwordHash: string): void {
    getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
  },
  list(limit = 50, offset = 0): UserRow[] {
    return getDb().prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset) as unknown as UserRow[];
  },
};

// ---- sessions --------------------------------------------------------------------------------------------

export const sessions = {
  create(tokenHash: string, userId: string, expiresAt: Date, ua: string | null): void {
    getDb()
      .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, ua) VALUES (?, ?, ?, ?, ?)")
      .run(tokenHash, userId, expiresAt.toISOString(), now(), ua);
  },
  /** The live session's user, or undefined when unknown or expired. */
  userFor(tokenHash: string): UserRow | undefined {
    return getDb()
      .prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
      .get(tokenHash, now()) as UserRow | undefined;
  },
  delete(tokenHash: string): void {
    getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  },
  deleteForUser(userId: string): void {
    getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  },
  purgeExpired(): void {
    getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now());
  },
};

// ---- shops -----------------------------------------------------------------------------------------------

export const shops = {
  /** The shop this user created. Signup bookkeeping only: a session reaches its shop through `members.shopFor`. */
  byUserId(userId: string): ShopRow | undefined {
    return getDb().prepare("SELECT * FROM shops WHERE user_id = ? ORDER BY created_at LIMIT 1").get(userId) as ShopRow | undefined;
  },
  /** For webhook routing and admin screens only, never to authorise a seller. */
  byExternalId(ext: string): ShopRow | undefined {
    return getDb().prepare("SELECT * FROM shops WHERE external_business_id = ?").get(ext) as ShopRow | undefined;
  },
  create(input: { userId: string; externalBusinessId: string; name: string; bizinTenantId?: string | null }): ShopRow {
    const row: ShopRow = {
      id: randomUUID(),
      user_id: input.userId,
      external_business_id: input.externalBusinessId,
      name: input.name,
      bizin_tenant_id: input.bizinTenantId ?? null,
      created_at: now(),
    };
    getDb()
      .prepare("INSERT INTO shops (id, user_id, external_business_id, name, bizin_tenant_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(row.id, row.user_id, row.external_business_id, row.name, row.bizin_tenant_id, row.created_at);
    return row;
  },
  setTenantId(id: string, tenantId: string): void {
    getDb().prepare("UPDATE shops SET bizin_tenant_id = ? WHERE id = ?").run(tenantId, id);
  },
  list(limit = 50, offset = 0): ShopRow[] {
    return getDb().prepare("SELECT * FROM shops ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset) as unknown as ShopRow[];
  },
};

// ---- team -----------------------------------------------------------------------------------------------

export const members = {
  /**
   * The user's shop and role in it: the ONLY way a session reaches a shop. A user belongs to at most one shop; the
   * oldest membership wins should a second ever exist.
   */
  shopFor(userId: string): { shop: ShopRow; role: MemberRole } | undefined {
    const r = getDb()
      .prepare(
        "SELECT s.*, m.role AS member_role FROM shop_members m JOIN shops s ON s.id = m.shop_id WHERE m.user_id = ? ORDER BY m.created_at, s.created_at LIMIT 1",
      )
      .get(userId) as (ShopRow & { member_role: MemberRole }) | undefined;
    if (!r) return undefined;
    const { member_role: role, ...shop } = r;
    return { shop, role };
  },
  get(shopId: string, userId: string): ShopMemberRow | undefined {
    return getDb().prepare("SELECT * FROM shop_members WHERE shop_id = ? AND user_id = ?").get(shopId, userId) as ShopMemberRow | undefined;
  },
  list(shopId: string): TeamMember[] {
    return getDb()
      .prepare(
        "SELECT m.*, u.phone, u.display_name FROM shop_members m JOIN users u ON u.id = m.user_id WHERE m.shop_id = ? ORDER BY m.role = 'agent', m.created_at",
      )
      .all(shopId) as unknown as TeamMember[];
  },
  add(shopId: string, userId: string, role: MemberRole): void {
    getDb().prepare("INSERT INTO shop_members (shop_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(shopId, userId, role, now());
  },
  setRole(shopId: string, userId: string, role: MemberRole): boolean {
    return Number(getDb().prepare("UPDATE shop_members SET role = ? WHERE shop_id = ? AND user_id = ?").run(role, shopId, userId).changes) === 1;
  },
  remove(shopId: string, userId: string): boolean {
    return Number(getDb().prepare("DELETE FROM shop_members WHERE shop_id = ? AND user_id = ?").run(shopId, userId).changes) === 1;
  },
  ownerCount(shopId: string): number {
    const r = getDb().prepare("SELECT COUNT(*) AS n FROM shop_members WHERE shop_id = ? AND role = 'owner'").get(shopId) as { n: number };
    return Number(r.n);
  },
};

export const invites = {
  create(input: { shopId: string; phone: string; role: MemberRole; invitedBy: string }): ShopInviteRow {
    const row: ShopInviteRow = {
      id: randomUUID(),
      shop_id: input.shopId,
      phone: input.phone,
      role: input.role,
      invited_by: input.invitedBy,
      created_at: now(),
      accepted_at: null,
    };
    getDb()
      .prepare("INSERT INTO shop_invites (id, shop_id, phone, role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(row.id, row.shop_id, row.phone, row.role, row.invited_by, row.created_at);
    return row;
  },
  pendingForShop(shopId: string): ShopInviteRow[] {
    return getDb()
      .prepare("SELECT * FROM shop_invites WHERE shop_id = ? AND accepted_at IS NULL ORDER BY created_at DESC")
      .all(shopId) as unknown as ShopInviteRow[];
  },
  pendingFor(shopId: string, phone: string): ShopInviteRow | undefined {
    return getDb()
      .prepare("SELECT * FROM shop_invites WHERE shop_id = ? AND phone = ? AND accepted_at IS NULL")
      .get(shopId, phone) as ShopInviteRow | undefined;
  },
  /** The oldest open invite for a number, from any shop. */
  oldestPendingForPhone(phone: string): ShopInviteRow | undefined {
    return getDb()
      .prepare("SELECT * FROM shop_invites WHERE phone = ? AND accepted_at IS NULL ORDER BY created_at LIMIT 1")
      .get(phone) as ShopInviteRow | undefined;
  },
  markAccepted(id: string): void {
    getDb().prepare("UPDATE shop_invites SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL").run(now(), id);
  },
  /** Only an open invite of `shopId`. */
  cancel(shopId: string, id: string): boolean {
    return Number(getDb().prepare("DELETE FROM shop_invites WHERE id = ? AND shop_id = ? AND accepted_at IS NULL").run(id, shopId).changes) === 1;
  },
};

// ---- webhook events --------------------------------------------------------------------------------------

export const webhookEvents = {
  /** False when the event id was already stored: Bizin may deliver an event more than once. */
  insertIfNew(e: { eventId: string; type: string; ext: string | null; payload: string }): boolean {
    const r = getDb()
      .prepare("INSERT OR IGNORE INTO webhook_events (event_id, type, ext, payload, received_at) VALUES (?, ?, ?, ?, ?)")
      .run(e.eventId, e.type, e.ext, e.payload, now());
    return Number(r.changes) === 1;
  },
  recentForExt(ext: string, limit = 30): WebhookEventRow[] {
    return getDb()
      .prepare("SELECT * FROM webhook_events WHERE ext = ? ORDER BY received_at DESC LIMIT ?")
      .all(ext, limit) as unknown as WebhookEventRow[];
  },
  unreadCount(ext: string): number {
    const r = getDb().prepare("SELECT COUNT(*) AS n FROM webhook_events WHERE ext = ? AND read_at IS NULL").get(ext) as { n: number };
    return Number(r.n);
  },
  markAllRead(ext: string): void {
    getDb().prepare("UPDATE webhook_events SET read_at = ? WHERE ext = ? AND read_at IS NULL").run(now(), ext);
  },
  purgeOlderThan(iso: string): void {
    getDb().prepare("DELETE FROM webhook_events WHERE received_at < ?").run(iso);
  },
};

// ---- credit orders ---------------------------------------------------------------------------------------

export const creditOrders = {
  create(input: { shopId: string; planCode: string; amountToman: number; method: CreditMethod; ref?: string | null }): CreditOrderRow {
    const row: CreditOrderRow = {
      id: randomUUID(),
      shop_id: input.shopId,
      plan_code: input.planCode,
      amount_toman: input.amountToman,
      amount_rial: input.amountToman * 10,
      status: "pending",
      method: input.method,
      ref: input.ref ?? null,
      authority: null,
      created_at: now(),
      verified_at: null,
      granted_at: null,
      reviewed_by: null,
      review_note: null,
      reviewed_at: null,
    };
    getDb()
      .prepare(
        "INSERT INTO credit_orders (id, shop_id, plan_code, amount_toman, amount_rial, status, method, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(row.id, row.shop_id, row.plan_code, row.amount_toman, row.amount_rial, row.status, row.method, row.ref, row.created_at);
    return row;
  },
  byId(id: string): CreditOrderRow | undefined {
    return getDb().prepare("SELECT * FROM credit_orders WHERE id = ?").get(id) as CreditOrderRow | undefined;
  },
  forShop(shopId: string): CreditOrderRow[] {
    return getDb().prepare("SELECT * FROM credit_orders WHERE shop_id = ? ORDER BY created_at DESC").all(shopId) as unknown as CreditOrderRow[];
  },
};

// ---- settings --------------------------------------------------------------------------------------------

export const settings = {
  get<T>(key: string): T | undefined {
    const r = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return r ? (JSON.parse(r.value) as T) : undefined;
  },
  set(key: string, value: unknown): void {
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
  },
};
