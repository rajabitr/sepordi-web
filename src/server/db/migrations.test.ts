import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { migrate } from "./index";
import { MIGRATIONS } from "./migrations";

/** A database as the previous release left it: migrations 1–3 applied, a shop with an agent and an open invite. */
function atVersion3(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  for (const m of MIGRATIONS.filter((m) => m.id <= 3)) {
    db.exec(m.sql);
    db.prepare("INSERT INTO schema_migrations VALUES (?, ?, ?)").run(m.id, m.name, "2026-01-01T00:00:00.000Z");
  }
  const t = "2026-01-01T00:00:00.000Z";
  db.prepare("INSERT INTO users (id, phone, display_name, created_at) VALUES ('u1', '09120000001', 'a', ?), ('u2', '09120000002', 'b', ?)").run(t, t);
  db.prepare("INSERT INTO shops (id, user_id, external_business_id, name, created_at) VALUES ('s1', 'u1', 'sp_1', 'n', ?)").run(t);
  db.prepare("INSERT INTO shop_members (shop_id, user_id, role, created_at) VALUES ('s1', 'u2', 'agent', ?)").run(t);
  db.prepare("INSERT INTO shop_invites (id, shop_id, phone, role, invited_by, created_at) VALUES ('i1', 's1', '09120000003', 'agent', 'u1', ?)").run(t);
  return db;
}

describe("migration 4: member role presets", () => {
  it("keeps every member and invite, the creator trigger, and accepts the new roles", () => {
    const db = atVersion3();
    expect(migrate(db)).toEqual(MIGRATIONS.filter((m) => m.id > 3).map((m) => m.id));
    expect(db.prepare("SELECT user_id, role FROM shop_members ORDER BY user_id").all()).toEqual([
      { user_id: "u1", role: "owner" },
      { user_id: "u2", role: "agent" },
    ]);
    expect(db.prepare("SELECT id, role FROM shop_invites").all()).toEqual([{ id: "i1", role: "agent" }]);

    db.prepare("UPDATE shop_members SET role = 'finance' WHERE user_id = 'u2'").run();
    expect(() => db.prepare("UPDATE shop_members SET role = 'manager' WHERE user_id = 'u2'").run()).toThrow(/CHECK/);

    db.prepare("INSERT INTO shops (id, user_id, external_business_id, name, created_at) VALUES ('s2', 'u2', 'sp_2', 'n', 'x')").run();
    expect(db.prepare("SELECT role FROM shop_members WHERE shop_id = 's2' AND user_id = 'u2'").get()).toEqual({ role: "owner" });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%_v3'").all()).toEqual([]);
  });

  it("a removed shop takes its members, invites and activity with it", () => {
    const db = atVersion3();
    migrate(db);
    db.prepare("INSERT INTO activity_log (id, shop_id, user_id, action, created_at) VALUES ('a1', 's1', 'u1', 'order.status', 'x')").run();
    db.prepare("DELETE FROM shops WHERE id = 's1'").run();
    for (const t of ["shop_members", "shop_invites", "activity_log"]) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).toEqual({ n: 0 });
    }
  });
});
