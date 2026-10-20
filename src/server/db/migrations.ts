import "server-only";

/**
 * Ordered, append-only. Never edit a shipped entry: add the next id. Times are ISO 8601 UTC text, which sorts
 * and compares correctly as a string.
 */
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "initial",
    sql: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        phone         TEXT NOT NULL UNIQUE,
        email         TEXT,
        display_name  TEXT NOT NULL,
        password_hash TEXT,
        role          TEXT NOT NULL DEFAULT 'seller' CHECK (role IN ('seller', 'admin')),
        created_at    TEXT NOT NULL
      );
      CREATE UNIQUE INDEX users_email ON users (email) WHERE email IS NOT NULL;

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        ua         TEXT
      );
      CREATE INDEX sessions_user ON sessions (user_id);

      CREATE TABLE otp_codes (
        phone      TEXT PRIMARY KEY,
        code_hash  TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts   INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE shops (
        id                   TEXT PRIMARY KEY,
        user_id              TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        external_business_id TEXT NOT NULL UNIQUE,
        name                 TEXT NOT NULL,
        bizin_tenant_id      TEXT,
        created_at           TEXT NOT NULL
      );
      CREATE INDEX shops_user ON shops (user_id);

      CREATE TABLE webhook_events (
        event_id    TEXT PRIMARY KEY,
        type        TEXT NOT NULL,
        ext         TEXT,
        payload     TEXT NOT NULL,
        received_at TEXT NOT NULL,
        read_at     TEXT
      );
      CREATE INDEX webhook_events_ext ON webhook_events (ext, received_at);

      CREATE TABLE credit_orders (
        id           TEXT PRIMARY KEY,
        shop_id      TEXT NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
        plan_code    TEXT NOT NULL,
        amount_toman INTEGER NOT NULL CHECK (amount_toman > 0),
        status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
        method       TEXT NOT NULL,
        ref          TEXT,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX credit_orders_shop ON credit_orders (shop_id, created_at);

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];
