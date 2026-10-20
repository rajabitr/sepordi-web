import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { MIGRATIONS } from "./migrations";
import { seedDemoAccounts } from "./seed";

export type Db = DatabaseSync;

const KEY = Symbol.for("sepordi.db");
type WithDb = typeof globalThis & { [KEY]?: DatabaseSync };

/** Applies every migration not yet recorded, each in its own transaction, in id order. */
export function migrate(db: DatabaseSync): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const done = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: number }[]).map((r) => r.id),
  );
  const applied: number[] = [];
  for (const m of [...MIGRATIONS].sort((a, b) => a.id - b.id)) {
    if (done.has(m.id)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(m.id, m.name, new Date().toISOString());
      db.exec("COMMIT");
      applied.push(m.id);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return applied;
}

export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

/** One connection per server process (kept across dev hot reloads), opened and migrated on first use. */
export function getDb(): DatabaseSync {
  const g = globalThis as WithDb;
  if (!g[KEY]) {
    g[KEY] = openDb(process.env.SEPORDI_DB_PATH || "./data/sepordi.db");
    seedDemoAccounts(g[KEY]);
  }
  return g[KEY];
}

/** Runs `fn` in one transaction; node:sqlite has no helper for it. */
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Tests only: replace the process connection (e.g. with `openDb(":memory:")`). */
export function setDbForTests(db: DatabaseSync | undefined): void {
  const g = globalThis as WithDb;
  if (db) g[KEY] = db;
  else delete g[KEY];
}
