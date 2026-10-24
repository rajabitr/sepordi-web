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
  {
    id: 2,
    name: "credit_orders_lifecycle",
    // Rebuilt rather than altered: SQLite cannot change a CHECK, and no credit order exists yet.
    // pending → paid (money verified: Zarinpal, or staff for card-to-card) → granted (a Bizin operator posted the
    // credit); rejected by staff with a note; failed or cancelled at the gateway.
    sql: `
      DROP TABLE IF EXISTS credit_order_meta;
      DROP TABLE credit_orders;

      CREATE TABLE credit_orders (
        id           TEXT PRIMARY KEY,
        shop_id      TEXT NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
        plan_code    TEXT NOT NULL,
        amount_toman INTEGER NOT NULL CHECK (amount_toman > 0),
        amount_rial  INTEGER NOT NULL CHECK (amount_rial = amount_toman * 10),
        status       TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'paid', 'granted', 'rejected', 'failed', 'cancelled')),
        method       TEXT NOT NULL CHECK (method IN ('zarinpal', 'card_to_card')),
        ref          TEXT,
        authority    TEXT UNIQUE,
        created_at   TEXT NOT NULL,
        verified_at  TEXT,
        granted_at   TEXT,
        reviewed_by  TEXT,
        review_note  TEXT,
        reviewed_at  TEXT,
        CHECK (status NOT IN ('paid', 'granted') OR verified_at IS NOT NULL),
        CHECK (status <> 'granted' OR granted_at IS NOT NULL),
        CHECK (status <> 'rejected' OR (review_note IS NOT NULL AND review_note <> ''))
      );
      CREATE INDEX credit_orders_shop ON credit_orders (shop_id, created_at);
      CREATE INDEX credit_orders_status ON credit_orders (status, created_at);
    `,
  },
  {
    id: 3,
    name: "shop_team",
    // shops.user_id stays the creator. The trigger makes every new shop's creator its first owner, whichever path
    // inserted the row (signup, the dev seed, tests).
    sql: `
      CREATE TABLE shop_members (
        shop_id    TEXT NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        role       TEXT NOT NULL CHECK (role IN ('owner', 'agent')),
        created_at TEXT NOT NULL,
        UNIQUE (shop_id, user_id)
      );
      CREATE INDEX shop_members_user ON shop_members (user_id, created_at);

      INSERT OR IGNORE INTO shop_members (shop_id, user_id, role, created_at)
        SELECT id, user_id, 'owner', created_at FROM shops;

      CREATE TRIGGER shops_creator_is_owner AFTER INSERT ON shops
      BEGIN
        INSERT OR IGNORE INTO shop_members (shop_id, user_id, role, created_at) VALUES (NEW.id, NEW.user_id, 'owner', NEW.created_at);
      END;

      CREATE TABLE shop_invites (
        id          TEXT PRIMARY KEY,
        shop_id     TEXT NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
        phone       TEXT NOT NULL,
        role        TEXT NOT NULL CHECK (role IN ('owner', 'agent')),
        invited_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
        created_at  TEXT NOT NULL,
        accepted_at TEXT
      );
      CREATE UNIQUE INDEX shop_invites_pending ON shop_invites (shop_id, phone) WHERE accepted_at IS NULL;
      CREATE INDEX shop_invites_phone ON shop_invites (phone, created_at) WHERE accepted_at IS NULL;
    `,
  },
  {
    id: 4,
    name: "member_role_presets",
    // SQLite cannot change a CHECK: both tables are rebuilt. The shops trigger names shop_members, so it is dropped
    // first and recreated after the rename.
    sql: `
      DROP TRIGGER shops_creator_is_owner;

      ALTER TABLE shop_members RENAME TO shop_members_v3;
      CREATE TABLE shop_members (
        shop_id    TEXT NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        role       TEXT NOT NULL CHECK (role IN ('owner', 'agent', 'responder', 'finance', 'fulfillment')),
        created_at TEXT NOT NULL,
        UNIQUE (shop_id, user_id)
      );
      INSERT INTO shop_members (shop_id, user_id, role, created_at) SELECT shop_id, user_id, role, created_at FROM shop_members_v3;
      DROP TABLE shop_members_v3;
      CREATE INDEX shop_members_user ON shop_members (user_id, created_at);

      CREATE TRIGGER shops_creator_is_owner AFTER INSERT ON shops
      BEGIN
        INSERT OR IGNORE INTO shop_members (shop_id, user_id, role, created_at) VALUES (NEW.id, NEW.user_id, 'owner', NEW.created_at);
      END;

      ALTER TABLE shop_invites RENAME TO shop_invites_v3;
      CREATE TABLE shop_invites (
        id          TEXT PRIMARY KEY,
        shop_id     TEXT NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
        phone       TEXT NOT NULL,
        role        TEXT NOT NULL CHECK (role IN ('owner', 'agent', 'responder', 'finance', 'fulfillment')),
        invited_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
        created_at  TEXT NOT NULL,
        accepted_at TEXT
      );
      INSERT INTO shop_invites SELECT id, shop_id, phone, role, invited_by, created_at, accepted_at FROM shop_invites_v3;
      DROP TABLE shop_invites_v3;
      CREATE UNIQUE INDEX shop_invites_pending ON shop_invites (shop_id, phone) WHERE accepted_at IS NULL;
      CREATE INDEX shop_invites_phone ON shop_invites (phone, created_at) WHERE accepted_at IS NULL;
    `,
  },
  {
    id: 5,
    name: "session_current_shop",
    // NULL = the user's oldest membership. Never trusted alone: every request re-checks it against shop_members.
    sql: `ALTER TABLE sessions ADD COLUMN shop_id TEXT REFERENCES shops (id) ON DELETE SET NULL;`,
  },
  {
    id: 6,
    name: "two_step_login",
    // secret_enc is AES-256-GCM under a key derived from SESSION_SECRET. last_step is the newest accepted time step:
    // a code is good once. A row with enabled_at NULL is an enrolment not yet confirmed.
    sql: `
      CREATE TABLE user_totp (
        user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        secret_enc TEXT NOT NULL,
        enabled_at TEXT,
        last_step  INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE user_recovery_codes (
        user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        code_hash  TEXT NOT NULL,
        used_at    TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, code_hash)
      );

      CREATE TABLE login_challenges (
        token_hash TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        attempts   INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX login_challenges_user ON login_challenges (user_id);
    `,
  },
  {
    id: 7,
    name: "activity_log",
    sql: `
      CREATE TABLE activity_log (
        id          TEXT PRIMARY KEY,
        shop_id     TEXT NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
        user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
        action      TEXT NOT NULL,
        target_type TEXT,
        target_id   TEXT,
        meta        TEXT CHECK (meta IS NULL OR json_valid(meta)),
        created_at  TEXT NOT NULL
      );
      CREATE INDEX activity_log_shop ON activity_log (shop_id, created_at);
    `,
  },
];
