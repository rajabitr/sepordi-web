import "server-only";

import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { DEMO_SHOPS, demoOwnerId, mockTenantId } from "@/server/bizin/mock/demo";

const DEMO_SHOP = DEMO_SHOPS[0];

export const DEMO_ACCOUNTS = {
  seller: { phone: "09120000001", password: "sepordi-demo", name: "نیلوفر کاظمی", shop: "گالری نیلا" },
  admin: { phone: "09120000000", password: "sepordi-demo", name: "پشتیبانی سپردی" },
} as const;

function hash(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return ["scrypt", 16384, 8, 1, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/**
 * Local development with BIZIN_MODE=mock only: a seller who owns the mock's first demo shop and an admin, both with a
 * known password. The seller is the mock's owner of that business (same user id and email) and the shop row carries
 * its tenant id, so sign-in lands in the panel instead of re-provisioning a business the mock already holds. Never
 * runs in production builds.
 */
export function seedDemoAccounts(db: DatabaseSync): void {
  if (process.env.NODE_ENV === "production" || process.env.BIZIN_MODE !== "mock") return;
  const has = db.prepare("SELECT 1 FROM users WHERE phone = ?");
  const now = new Date().toISOString();
  const addUser = db.prepare("INSERT INTO users (id, phone, email, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const tenantId = mockTenantId(DEMO_SHOP.ext);
  if (!has.get(DEMO_ACCOUNTS.seller.phone)) {
    const id = demoOwnerId(DEMO_SHOP.ext);
    addUser.run(id, DEMO_ACCOUNTS.seller.phone, DEMO_SHOP.ownerEmail, DEMO_ACCOUNTS.seller.name, hash(DEMO_ACCOUNTS.seller.password), "seller", now);
    db.prepare("INSERT OR IGNORE INTO shops (id, user_id, external_business_id, name, bizin_tenant_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      randomUUID(),
      id,
      DEMO_SHOP.ext,
      DEMO_ACCOUNTS.seller.shop,
      tenantId,
      now,
    );
  }
  // Databases seeded before the tenant id was recorded.
  db.prepare("UPDATE shops SET bizin_tenant_id = ? WHERE external_business_id = ? AND bizin_tenant_id IS NULL").run(tenantId, DEMO_SHOP.ext);
  if (!has.get(DEMO_ACCOUNTS.admin.phone)) {
    addUser.run(randomUUID(), DEMO_ACCOUNTS.admin.phone, null, DEMO_ACCOUNTS.admin.name, hash(DEMO_ACCOUNTS.admin.password), "admin", now);
  }
}
