import "server-only";

import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/** The mock world's first shop (src/server/bizin/mock/fixtures.ts DEMO_SHOPS). */
const DEMO_EXT = "demo-nila";

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
 * Local development with BIZIN_MODE=mock only: a seller linked to the mock's demo shop and an admin, both with a
 * known password. Never runs in production builds.
 */
export function seedDemoAccounts(db: DatabaseSync): void {
  if (process.env.NODE_ENV === "production" || process.env.BIZIN_MODE !== "mock") return;
  const has = db.prepare("SELECT 1 FROM users WHERE phone = ?");
  const now = new Date().toISOString();
  const addUser = db.prepare("INSERT INTO users (id, phone, email, display_name, password_hash, role, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)");
  if (!has.get(DEMO_ACCOUNTS.seller.phone)) {
    const id = randomUUID();
    addUser.run(id, DEMO_ACCOUNTS.seller.phone, DEMO_ACCOUNTS.seller.name, hash(DEMO_ACCOUNTS.seller.password), "seller", now);
    db.prepare("INSERT OR IGNORE INTO shops (id, user_id, external_business_id, name, bizin_tenant_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)").run(
      randomUUID(),
      id,
      DEMO_EXT,
      DEMO_ACCOUNTS.seller.shop,
      now,
    );
  }
  if (!has.get(DEMO_ACCOUNTS.admin.phone)) {
    addUser.run(randomUUID(), DEMO_ACCOUNTS.admin.phone, DEMO_ACCOUNTS.admin.name, hash(DEMO_ACCOUNTS.admin.password), "admin", now);
  }
}
