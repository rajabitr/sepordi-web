# Bizin Partner API — map for the sepordi.ir builder

Written 2026-10-20 by a read-only mapping pass. Everything below is checked against the backend code, not only the spec.

**Source tree used.** The local `main` checkout of bizin-v3 (`f2524f5`, migration 0126) is **stale**: it does not contain
the partner packages at all. Everything here is read from `origin/main` (`0b06cec`) + aj-22 (`84b19f7`), checked out
clean at `.claude/worktrees/deploy-aj22/`. Production runs `01dd430` (goose 0176) (`docs/v3/PLAN.md:346`), and no
partner file changed after it. All paths below are relative to that tree, unless they start with `/`.

**The contract documents (read them; this map is a guided index plus what they leave out):**

| File | What |
|---|---|
| `docs/backend/partner-api.md` (2230 lines) | the prose contract: auth, errors, idempotency, limits, every route with JSON, webhooks, verification code in Go + Node |
| `docs/partner/openapi-v1.yaml` (OpenAPI 3.1, 73 operations + `receiveEvent` webhook) | machine-readable; `servers: https://api.bizin.app/partner/v1` (`:38-39`). Generate the client from this |
| `docs/backend/partner.md` | the operator side (how Bizin creates the partner and its keys) and the code map |
| `docs/v3/design/10.1-10.3-partner-api.md` | design and the owner's decisions (D25) |
| `backend/internal/partnerapi/routes.go:110-184` | the one route table (73 routes, scope + contract feature per route) |
| `backend/internal/partnerapi/contract_doc_test.go` | fails the build if the OpenAPI file and the code drift |

---

## 1. Partner model

### 1.1 Tables / migrations (`backend/internal/db/migrations/`)

| Migration | Tables / columns |
|---|---|
| `0133_partners.sql:10,24,37` | `partners` (slug, name, status `active`/`suspended`, metadata); `tenants.partner_id`, `tenants.external_business_id`, `tenants.partner_metadata`; `partner_user_refs` (partner's user id → Bizin user) |
| `0140_partner_api_keys.sql:6,20` | `partner_api_keys` (key_id, `secret_hash` = SHA-256, scopes, label, expires_at, revoked_at, last_used_at); `partners.api_rate_per_minute` (120), `api_burst` (60), `provision_per_day` (200) |
| `0141_partner_webhooks.sql:12,38,58` | `partner_webhook_endpoints`, `partner_events` (outbox, filled by DB triggers), `partner_webhook_deliveries` |
| `0148_pending_users.sql` | `users.status` gains `pending` (no password), `user_activation_tokens` |
| `0151_partner_stats_indexes.sql` | indexes for `/stats` |
| `0152_partner_connect_links.sql:8,26` | `partner_connect_links`; `partners.return_origins` (max 10) |
| `0155_product_external_ids.sql` | `products.external_id`, `product_variants.external_id` + `active` |
| `0159`, `0160`, `0172`, `0174` | more outbox event triggers (inbox, orders, entitlements, import.completed) |
| `0165_partner_key_scope_cap.sql` | max 32 scopes per key |
| `0167_import_jobs_partner.sql` | bulk onboarding / catalogue jobs |
| `0168_partner_contracts.sql:5,19,28,68,80` | `partner_contracts`, `contract_features`, `contract_limits`, `tenant_entitlement_overrides`, `tenant_limit_overrides` |
| `0170_partner_brands.sql:11,26,41` | `brand_assets`, `partner_brands`, `brand_disclosures` |
| `0176_partner_contract_announcements.sql` | future contract versions announced once |

A new partner gets contract v1 with **every feature and no limits** in the same transaction
(`backend/internal/entitlement/contracts.go:80-88`), so entitlement checks pass until Bizin narrows the contract.

### 1.2 Authentication

```
Authorization: Bearer bzp_<key_id>_<secret>
```

- Prefix `bzp_` (`backend/internal/partner/keys.go:25`); `key_id` = 16 chars lowercase base32 (public);
  `secret` = 43 chars base64url, no padding (32 random bytes) (`keys.go:28-29`, `:122`).
- Header only: no query parameter, no cookie (`backend/internal/partnerapi/auth.go:110`). **No HMAC request signing**:
  a plain bearer over HTTPS. HMAC is only on the webhooks Bizin sends to you (§2.11).
- Bizin stores only SHA-256(secret). The plaintext is shown once to the Bizin operator who issues it
  (`docs/backend/partner.md:44`).
- Every failure (missing, malformed, unknown, wrong secret, revoked, expired) = 401 `invalid_partner_key`; a valid key of a
  suspended partner = 403 `partner_suspended` (`docs/backend/partner-api.md:52-53`). No key cache: a revoke applies to the
  next request (`:54`).
- A `bzp_` key on any `/api/...` route (the seller panel's API) is refused 401 (`backend/internal/auth/middleware.go:54-58`);
  a panel JWT on `/partner/v1` is 401 `invalid_partner_key`. The two surfaces never mix.
- **Keys are issued, rotated and revoked only by a Bizin operator** (`/api/admin/partners/{id}/keys…`,
  `docs/backend/partner.md:43-47`). At most 2 live keys (`keys.go:38`); a rotation keeps the old key alive for a grace
  period, 7 days by default and 0–720 h at the operator's choice (`partner-api.md:55-58`). There is no self-service
  partner portal (PLAN 10.7 not built, `docs/v3/PLAN.md:242`).
- Rate limits, quotas and idempotency keys belong to the **partner**, not the key (`partner-api.md:59-60`).

**Scopes** (27, `keys.go:49-76`; per-route table `partner-api.md:67-96`). Every route needs exactly one; `GET /me` none.
`tenants:provision`, `tenants:read`, `channels:read`, `channels:connect`, `stats:read`, `webhooks:manage`,
`users:activate`, `orders:read`, `orders:fulfil`, `assistant:read`, `assistant:write`, `payments:read`,
`payments:write`, `payments:verify`, `catalog:read`, `catalog:write`, `cases:read`, `cases:write`, `inbox:read`,
`inbox:media`, `inbox:write`, `shipping:read`, `shipping:write`, `entitlements:read`, `entitlements:write`,
`branding:read`, `branding:write`. A key may hold all of them (max 32). For a full-featured site, ask for **all 27**.

Missing scope → 403 `insufficient_scope`, `params.required`. Some `/tenants/{ext}` routes also need a **contract
feature** (`x-feature` in OpenAPI): `payments.verification`, `shipping.rules`, `returns.cases`, `inbox.api` → 403
`feature_not_entitled` (`partner-api.md:105-116`, `routes.go:125-170`).

**Order of checks** (`partner-api.md:118-140`; middleware order `routes.go:246,255`): flag → failed-auth IP limiter →
key → partner bucket → route match (unknown path or method = 404, never 405) → scope → contract feature →
`Idempotency-Key` on POST/PATCH/DELETE → handler.

### 1.3 How sepordi's server must hold the key

- **Server-to-server only.** Production emits **no CORS headers** at all (`backend/internal/httpserver/middleware.go:164-190`,
  CORS only for `env == "dev"` and localhost origins; wired at `httpserver/server.go:39`). A browser cannot call
  `api.bizin.app` cross-origin, and the contract says the key must never reach a browser (`partner-api.md:1288-1289`).
- Keep the `bzp_…` key in a server secret store / env var, never in the Next.js client bundle, never in logs. Plan for two
  keys during a rotation (deploy the new one, then the old expires after the grace).
- Keep the webhook secret(s) (`whsec_…`) server-side too; during a 24 h rotation window both secrets sign.
- Media (customer photos, voice notes, **bank receipts**) must be proxied through your backend to your seller's browser
  with the seller's own auth in front; never cache receipts (`partner-api.md:1287-1289`, `:1431-1433`).

### 1.4 Creating a business (tenant) and its users

- `POST /tenants` (scope `tenants:provision`) creates in one transaction: tenant, signup **trial credit**, AI reply
  language, market profile, the owner as a **pending** user (no password, cannot log in), owner membership, the partner's
  external refs. Sends no message, runs no AI. `tenant.provisioned` webhook follows (`partner-api.md:343-347`).
- Tenants are addressed **only by your `external_business_id`** (1–128 UTF-8 chars, percent-escape in paths,
  `partner-api.md:316-322`). Bizin's `tenant.id` is for support tickets only.
- Idempotent forever per `external_business_id`: same owner (`external_user_id` + `email`) → 200 `created:false`;
  different owner → 409 `owner_mismatch` (`partner-api.md:401-404`).
- **Only the owner** can be created. There is no route for extra team members (PA-11 "team members by external id"
  is deferred to v3.2+, `docs/backend/partner.md:155`, `docs/v3/PLAN.md:238`).
- `owner.email` that already has a Bizin account → 409 `owner_email_in_use`; linking existing accounts is "a later
  release" (`partner-api.md:405`). A seller already registered on bizin.app cannot be provisioned with the same email.

### 1.5 How a sepordi seller signs in

**sepordi owns the session.** Bizin issues no per-business token, has no SSO / OAuth for partners, no magic-link login,
no impersonation and no embeddable panel (searched: no SSO/magic/impersonate code in `backend/internal`; auth routes
are only register/login/activate/MFA, `backend/internal/auth/routes.go:14-34`). The model is:

1. sepordi authenticates its own seller in its own site.
2. sepordi's backend calls `/partner/v1/tenants/{that seller's external_business_id}/…` with the **partner key**. The key's
   scope is the authority; the panel's owner/role/step-up rules do not apply (`partner-api.md:885-887`, `:1312-1313`).
   **sepordi must enforce its own per-seller authorization** — the key can touch every business of the partner.
3. Optional: `POST /tenants/{ext}/owner/activation-link` (scope `users:activate`) returns a single-use 72 h URL
   `https://www.bizin.app/activate/<token>` where the owner sets a password and becomes `active`
   (`partner-api.md:565-586`; page `frontend/app/activate/[token]`). After that the owner can also log into Bizin's own
   panel (`www.bizin.app/login`) — the only way to reach the panel-only features of §3. The panel shows the partner brand
   when the brand `mode` is `partner` or `co_brand` (`partner-api.md:1832-1840`). A fully headless partner never calls this
   and the owner stays `pending` (`:568-570`).

---

## 2. Every partner-callable endpoint (73)

Base `https://api.bizin.app/partner/v1`. `{ext}` = your `external_business_id`; `…` = `/tenants/{ext}`.
"IK" = `Idempotency-Key` required. Exact JSON and every error are in `docs/backend/partner-api.md` at the given lines;
the key shapes are repeated here.

### 2.0 Cross-cutting rules

**Error envelope** (every error; `backend/internal/httperr/httperr.go:43-50`, `partner-api.md:142-160`):

```json
{ "error": "insufficient_scope", "code": "insufficient_scope", "message": "English sentence for logs",
  "field": "owner.email", "params": { "required": "tenants:provision" }, "request_id": "6d3c…" }
```

Branch on `code` (stable); `message` wording changes; `field` and `params` optional. The full code table is
`partner-api.md:165-241`. Request bodies are strict: an unknown field = 400 `bad_request_body` (`:243`).
Body caps: 4 KiB channel connect, 64 KiB assistant, 256 KiB product, 16 KiB elsewhere (`:182`).

**Idempotency** (`partner-api.md:245-273`, `routes.go:294-315`): every POST, PATCH, DELETE needs
`Idempotency-Key` (1–255 printable ASCII, use a UUID) or 400 `idempotency_key_required`. PUT and GET take none (PUT =
full replace). Scoped to (partner, method, exact path, key); replay within 24 h returns the stored 2xx with
`Idempotent-Replayed: true`; different body → 422 `idempotency_key_reused`; still running → 409 + `Retry-After: 1`;
only 2xx stored. **Replays redact credentials**: `secret`, `activation_url`, and the connect link `url` come back
`null` with `<field>_redacted_on_replay: true` — re-issue with a new key if you lost the first answer.

**Pagination**: `?limit=` 1–100 (default 50), `?cursor=` = previous `next_cursor` (opaque); `next_cursor: null` on the
last page. Keep the same filters with a cursor. Messages use `before`/`after` cursors (`next_before`, `next_after`).
Job rows: `limit` 1–500 (100).

**Headers**: every answer has `X-Request-Id` (you may send your own, 1–64 of `[A-Za-z0-9._-]`); every authenticated
answer has `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (`partnerapi/ratelimit.go:194-196`).

**Money**: integers in the market's storage unit. Market `ir` → `"currency": "IRR"`, exponent/minor_unit `0` = **whole
Rial**. Divide by 10 for Toman on screen (`partner-api.md:817-819`). Shipping fees must be multiples of 10 Rial
(`:1527`). **Dates**: RFC 3339 UTC; stats days `YYYY-MM-DD` UTC (`:28-29`). No Jalali anywhere in the API: sepordi
renders Jalali and Toman itself.

**Extensibility**: ignore unknown response fields and unknown webhook types; every enum is extensible (`:300-310`).

### 2.1 Identity — 1

| Method / path | Scope | Notes |
|---|---|---|
| `GET /me` | any key | `{partner_id, key_id, scopes[], limits:{api_rate_per_minute, api_burst, provision_per_day}}` (`partner-api.md:324-341`) |

### 2.2 Onboarding / business / plan — 18

| Method / path | Scope | Request → response (`partner-api.md` lines) |
|---|---|---|
| `POST /tenants` IK | tenants:provision | `{external_business_id, name, market_profile ("ir"\|"ae"\|"intl", required), reply_language? ("en"\|"ar"\|"fa", default en), metadata? (obj ≤8 KiB), owner:{external_user_id, email, display_name, locale? (fa\|en\|ar), phone?}}` → 201 `{tenant:{id, external_business_id, name, status, reply_language, market_profile, created_at}, owner:{user_id, external_user_id, status}, channels:[], credit:{state}, created:true}` (`:343-407`). `owner.phone` (E.164, or an `ir` mobile `09…`) is accepted by the code (`partnerapi/provision.go:151-156`, OpenAPI `:3546`) but missing from the prose table |
| `GET /tenants` | tenants:read | `{tenants:[tenant…], next_cursor}` newest first (`:409-424`) |
| `GET /tenants/{ext}` | tenants:read | `{tenant, owner:{user_id, external_user_id, status: pending\|active\|disabled}\|null, channels:[{channel_id, kind, status, connected_at}], credit:{state: "ok"\|"exhausted"}}` (`:426-458`). The code also returns `tenant.metadata` (`partnerapi/tenants.go:95,247-262`) although the doc says it is not returned; treat as optional |
| `POST …/owner/activation-link` IK | users:activate | no body → 201 `{activation_url, expires_at}` (72 h, single use; 409 `owner_already_active` / `owner_not_pending`) (`:565-586`) |
| `GET …/stats?from&to` | stats:read | `{days:[{date, conversations_started, automated_replies, handoffs, orders_created}]}`; ≤92 days, default the last 7 (`:494-519`) |
| `POST /onboarding-jobs` IK | tenants:provision | bulk: multipart CSV/XLSX (`file`, `on_errors`, `defaults`, `auto_commit`) or JSON `{on_errors, auto_commit, defaults, rows:[POST /tenants bodies]}` ≤2000 rows → 201 job (`:1538-1614`) |
| `GET /onboarding-jobs`, `GET /onboarding-jobs/{job_id}` | tenants:read | job `{id, kind, status: ready\|committing\|done\|error\|expired\|cancelled, counts, result, error, warnings, …}` (`:1616-1633`) |
| `GET /onboarding-jobs/{job_id}/rows` | tenants:read | `{rows, next_cursor}`; `Accept: text/csv` = results export (`:1635-1680`) |
| `POST /onboarding-jobs/{job_id}/commit` / `…/cancel` IK | tenants:provision | 202 committing / 200 cancelled (`:1682-1689`) |
| `GET /entitlements` | entitlements:read | your contract `{contract:{version, effective_from, commercial_ref}, features[], limits{}, next}` (`:1709-1719`) |
| `GET /tenants/{ext}/entitlements` | entitlements:read | per-business features/limits with `source` (`:1721-1733`) |
| `PUT /tenants/{ext}/entitlements` | entitlements:write | narrow only: `{features:{"inbox.api": false}, limits:{"channels.max": 2}}` (`:1735-1753`) |
| `GET /branding` | branding:read | `{mode, names{en,ar,fa}, support_label{}, support_url, logo_url, disclosures{en,ar,fa:{text, source}}, updated_at}` (`:1841-1858`) |
| `PUT /branding` | branding:write | `{names?, support_label?, support_url?}`; `mode` is operator-only (400 `brand_mode_read_only`) (`:1860-1875`) |
| `PUT /branding/disclosures/{locale}` | branding:write | `{text}` 20–220 chars, must say it's automated and offer a human, in the locale's script (`:1877-1900`) |
| `POST /branding/logo` IK | branding:write | multipart `file`, PNG/WebP ≤256 KiB, ≤512×512 (`:1902-1915`) |

"Plan": there is **no plan, credit-pack or billing route** for a partner. The only credit signals are
`credit.state` on the tenant (`ok`/`exhausted`, never a balance) and the `credit.exhausted` webhook. A contract
"never carries a price, a fee or credit" (`partner-api.md:1693-1695`).

### 2.3 Channels — 6

| Method / path | Scope | Notes |
|---|---|---|
| `GET …/channels` | channels:read | `{channels:[{channel_id, kind: instagram\|whatsapp\|telegram, status: disconnected\|pairing\|connected\|banned\|error, connected_at, health?:{state: ok\|quiet\|degraded\|broken\|unknown, reason, since}\|null}]}` (`:460-492`) |
| `POST …/channels/whatsapp` IK | channels:connect | `{display_name?}` → 201 `{channel_id, status:"pending"}`; one pairing at a time per business (409 `whatsapp_pairing_in_progress`) (`:681-706`) |
| `GET …/channels/whatsapp/{channel_id}/pairing` | channels:connect | `{status: pending\|qr\|connected\|failed\|expired, qr?, expires_at}` — **poll** (e.g. every 2 s); render `qr` as a QR image; it rotates (`:708-729`) |
| `POST …/channels/telegram` IK | channels:connect | `{bot_token, display_name?}` → 201 `{channel_id, status:"connected"}`; token write-only (`:731-759`) |
| `POST …/connect-links` IK | channels:connect | Instagram only: `{channel:"instagram", return_url (https, on an operator-approved origin), replace?}` → 201 `{id, url, expires_at}` (15 min, single use). Send the seller's browser to `url` (`https://www.bizin.app/connect/…`); Meta OAuth runs on Bizin; back to `return_url?status=connected\|failed&channel=instagram&link=<id>[&reason=…]` (`:521-563`) |
| `DELETE …/channels/{channel_id}` IK | channels:connect | disconnect + delete any kind → 204 (`:761-773`) |

**WhatsApp status: polling only.** No SSE / WebSocket for partners (the panel streams QR over SSE at
`GET /api/v1/channels/{id}/pair`, `backend/internal/channel/routes.go:27`; not reachable with a partner key).
**No phone-number pairing code exists** anywhere in the backend (searched `PairPhone`/`pairing_code`: none) — QR only.
The panel's "disconnect but keep" (`channel/routes.go:28`) has no partner route; `DELETE` removes the account.

### 2.4 Catalog / products / media upload — 10

| Method / path | Scope | Notes |
|---|---|---|
| `PUT …/products/{product_ext}` | catalog:write | full replace: `{title, description?, category?, sku?, active (required), variants:[{external_id, title? \| options?[], price (int, Rial for ir), stock? (int\|null)}] (1–200)}` → 201/200 `{id, external_id, title, description, category, sku, active, currency, price_exponent, variants:[{id, external_id, title, price, stock, active}], created_at, updated_at, created}` (`:781-860`). Dropped variants are deactivated, not deleted; `stock` sets the level exactly |
| `GET …/products/{product_ext}` / `GET …/products` | catalog:read | same object; list includes panel-made products with `external_id: null` (`:862-875`) |
| `DELETE …/products/{product_ext}` IK | catalog:write | archive → 204 (`:877-881`) |
| `POST …/catalog-import-jobs` IK + `GET` list / `GET {job_id}` / `GET {job_id}/rows` / `POST {job_id}/commit` IK / `POST {job_id}/cancel` IK | catalog:write / catalog:read | bulk products from CSV/XLSX (with `image_urls`, spec-sheet columns) or JSON rows (≤5000) (`:1755-1830`) |

**Product images**: `PUT` has no image field and leaves images untouched (`:833`). The only partner path that sets
product pictures is a **file** catalogue-import job with an `image_urls` column (Bizin fetches the URLs, max 8 per
product, `:1788-1793`); JSON job rows are PUT bodies with no images (`partnerapi/catalog_import_jobs.go:68-72`).
Search aliases, compare-at price, discounts and stocktake are panel-only.
The only *upload* route is `POST …/media` (inbox images for a human reply, §2.7).

### 2.5 Knowledge — 0

**Does not exist.** No partner route reads or writes the knowledge base (`routes.go:110-184` has none; panel module
`/api/v1/knowledge`, `backend/internal/apiroutes/tenant.go:118`). Closest substitutes: `business_profile` in
`PUT …/assistant` (≤4000 chars), the return policy (§2.6), and spec sheets written to knowledge by a file catalogue
import job (`partner-api.md:1760-1762`).

### 2.6 AI settings — 4

| Method / path | Scope | Notes |
|---|---|---|
| `GET …/assistant` | assistant:read | `{enabled, auto_reply, reply_language, persona_name, business_profile, updated_at}` (`:925-939`) |
| `PUT …/assistant` | assistant:write | `{enabled (req), auto_reply (req), reply_language (req: en\|ar\|fa), persona_name? ≤80, business_profile? ≤4000}`. The assistant replies only when **both** switches are true (both default false for a new business) (`:941-958`) |
| `GET` / `PUT …/return-policy` | assistant:read / write | `{enabled, window_days (0–365\|null), conditions ≤1500}`; GET before any PUT = 404 `return_policy_not_set` (`:1129-1147`) |

Panel-only AI settings (`backend/internal/ai/settings.go:51-95` vs `partnerapi/assistant.go:48-74`): `tone`
(friendly/formal/concise), `handoff_on_low_confidence`, `human_takeover_minutes`, max replies per conversation, the
test console (`POST /api/v1/ai/preview`), usage, product search names.

### 2.7 Conversations / inbox / handoff / human reply — 10 (contract feature `inbox.api`)

| Method / path | Scope | Notes |
|---|---|---|
| `GET …/conversations` | inbox:read | filters `state` (ai\|handoff\|human, repeatable), `channel`, `since`, + `until, status, queue, priority, reason, reason_class, intent, q, order_id, has_order` (`:1221-1257`) |
| `GET …/conversations/{id}` | inbox:read | `{id, channel_kind, status: open\|snoozed\|closed, state: ai\|handoff\|human, handoff:{reason, raised_at, reason_class?, priority?}, held_since, customer:{id, display_name, phone}, last_message, last_message_at, last_customer_message_at, reply_window_closes_at, queue?, intent?, related_order?}` (`:1163-1219`; tags `partnerapi/inbox.go:95-108`) |
| `GET …/conversations/{id}/messages` | inbox:read | `{messages:[{id, conversation_id, direction: in\|out, sender: customer\|human\|ai, kind, text, status, created_at, media:{id, mime, size, path}\|null}], next_before, next_after}` (`:1259-1291`) |
| `GET …/conversations/{id}/messages/{message_id}` | inbox:read | one message (`:1293-1296`) |
| `POST …/conversations/{id}/reply` IK | inbox:write | `{text, agent_ref?}` or `{media_id, caption?, agent_ref?}` → 201 message / 202 `{status:"sent_not_saved"}` (do not resend). Human-typed text only (contract clause); no cold outreach; client timeout ≥30 s (`:1298-1340`) |
| `POST …/media` IK | inbox:write | multipart `file` JPEG/PNG ≤8 MiB → 201 `{id, mime, size}` for a reply's `media_id`; images not sendable on Instagram (`:1342-1353`) |
| `POST …/conversations/{id}/claim` IK | inbox:write | take over (state `human`), returns conversation (`:1355-1360`) |
| `POST …/conversations/{id}/release` IK | inbox:write | back to the assistant, `+assistant_active`; never lifts a customer's "stop" (409 `customer_opted_out`) (`:1362-1369`) |
| `POST …/conversations/{id}/queue` IK | inbox:write | `{queue: sales\|support\|accounting\|appointment\|fulfillment}` (`:1371-1383`) |
| `GET …/media/{media_id}` | inbox:media | the bytes of a message attachment (photos, voice, documents, receipts), sandbox headers, range requests (`:1385-1397`) |

### 2.8 Orders / payments (IR card-to-card + receipt review) / fulfilment / shipping — 14

| Method / path | Scope | Notes |
|---|---|---|
| `GET …/orders` | orders:read | filters `status`, `payment_status`, `since`, `cursor` (`:1014-1035`) |
| `GET …/orders/{order_id}` | orders:read | `{id, code, status: draft\|confirmed\|paid\|packing\|shipped\|delivered\|cancelled, source: dashboard\|ai\|api, created_at, updated_at, items:[{title, variant_name?, quantity, unit_price, line_total}], totals:{subtotal, discount?, shipping?, shipping_basis?, shipping_zone?, total, currency, minor_unit}, customer:{name?, phone?, channel, conversation_id}, payment:{method:"card_to_card", status: unpaid\|pending_verification\|rejected\|paid, receipt_received, pending_evidence, paid_at}, confirmed_at, paid_at, packing_at, shipped_at, cancelled_at}` (`:964-1012`; tags `partnerapi/orders.go:46-103`). No shipping address, no note |
| `POST …/orders/{order_id}/status` IK | orders:fulfil | `{status: packing\|shipped\|delivered\|cancelled}` (`:1470-1483`) |
| `GET …/orders/{order_id}/payment-evidence` | payments:read | `{data:[{id, order_id, kind: image\|text, status, created_at, expected_amount, currency, minor_unit, decided_at, decided_by, reject_reason, note, closed_reason, has_content}]}` (`:1410-1427`) |
| `GET …/payment-evidence/{evidence_id}/content` | payments:verify | the receipt image bytes, or `{kind:"text", text}` (`:1429-1440`) |
| `POST …/payment-evidence/{evidence_id}/approve` IK | payments:verify | `{}` → `{order, evidence}`; order → `paid` (`:1442-1452`) |
| `POST …/payment-evidence/{evidence_id}/reject` IK | payments:verify | `{reason: amount_mismatch\|unreadable\|not_received\|wrong_destination\|other, note?}` (`:1454-1461`) |
| `POST …/orders/{order_id}/mark-paid` IK | payments:verify | `{reference?}` (`:1463-1468`) |
| `GET` / `PUT …/payment-details` | payments:read / write | PUT `{card_number? (16 digits, Luhn), iban? (IR+24), holder_name (req), bank_name?}` → `{configured, card_number_last4, iban_last4, holder_name, bank_name}` — always masked (`:883-919`). This is the seller's card the assistant gives customers |
| `GET` / `PUT …/shipping` | shipping:read / write | `{enabled, default_fee, free_over, rates:[{province, city?, fee}], currency, minor_unit, updated_at}` (`:1490-1536`) |

Verification queue: `GET …/orders?payment_status=pending_verification` (`:1485-1486`). There is **no route to create or
edit an order** (orders are written by the assistant or in the panel), and no invoice / shipping-label route.

### 2.9 Returns / complaints cases — 4 (contract feature `returns.cases`)

`GET …/cases`, `GET …/cases/{case_id}`, `GET …/cases/{case_id}/photos/{photo_id}` (cases:read),
`POST …/cases/{case_id}/actions` IK (cases:write: `{action, expected_state, reject_reason?, refund?, note?, notify_customer?}`)
(`partner-api.md:1037-1147`).

### 2.10 Credit / wallet / top-up / billing / pricing — 0

**Does not exist** in the partner API. Seller billing is panel-only: `/api/v1/billing/summary`, `/plans`, `/statement`,
`/payments` (create, submit) (`backend/internal/billing/routes.go:16-24`); operators confirm payments and post ledger
entries under `/api/admin` (`billing/routes.go:87-91`). A provisioned business gets the signup trial credit
(550,000 µ$ ≈ 200 replies, `docs/backend/billing.md:4`; marketing "around 200 replies"); when it runs out the
assistant stops answering and you get `credit.exhausted` once.

### 2.11 Reports / insights — 1 (`GET …/stats`, §2.2)

Panel `dashboard`, `insights` (Instagram page insights) and AI `usage` have no partner route
(`apiroutes/tenant.go:139,145`).

### 2.12 Webhooks you receive — 8 management routes + 17 event types

Management (scope `webhooks:manage`, max 5 endpoints, `partner-api.md:588-673`):
`GET /webhooks`, `POST /webhooks` IK (`{url, event_types[] or ["*"], description?}` → 201 `{webhook, secret:"whsec_…"}`),
`GET /webhooks/{id}`, `PATCH /webhooks/{id}` IK (`url`, `event_types`, `status: active|disabled`, `description`),
`DELETE /webhooks/{id}` IK → 204, `POST /webhooks/{id}/rotate-secret` IK → `{webhook, secret, previous_secret_valid_until}`,
`POST /webhooks/{id}/ping` IK → 202 `{event_id}`, `GET /webhooks/{id}/deliveries` (paged).
URL must be https on 443 to a public host (`:622-623`).

Delivery (`partner-api.md:1917-2003`):

```http
POST <your url>
Content-Type: application/json
User-Agent: Bizin-Webhooks/1
Bizin-Event-Id: evt_<uuid>
Bizin-Event-Type: order.created
Bizin-Delivery-Attempt: 1
Bizin-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>]

{"id":"evt_…","type":"order.created","api_version":"v1","occurred_at":"…","tenant":{"id":"…","external_business_id":"…"},"data":{…}}
```

- Signature: `v1 = hex(HMAC-SHA256(key = whole "whsec_…" secret, msg = "<t>." + raw body bytes))`; accept if any `v1`
  matches and `|now − t| ≤ 300 s`; then de-dup by `Bizin-Event-Id` (keep ≥24 h) (`:1991-2003`;
  `backend/internal/partnerhooks/sign.go:14,24-28`). Test vector `:2007-2014`; Go and Node verifiers `:2016-2146`.
- Answer 2xx fast. 5xx/408/429/timeout → 8 attempts over ~4 h 43 min; 410 → endpoint disabled; other 4xx → dead at once;
  20 dead in a row → disabled. No ordering guarantee; events kept 14 days (`:1974-1989`).
- Payloads carry **ids and states only** — never names, phones, text, amounts. Re-read via the routes.

| Type | `data` (`partner-api.md:1948-1966`) |
|---|---|
| `tenant.provisioned` | `{}` |
| `channel.connected` / `channel.disconnected` | `{channel_id, channel_kind, status}` |
| `channel.health_changed` | `{channel_id, channel_kind, state, previous_state, reason}` |
| `handoff.raised` | `{conversation_id, channel_kind, reason, reason_class, queue, priority}` |
| `handoff.released` | `{conversation_id, channel_kind, from}` |
| `message.received` | `{conversation_id, message_id, channel_kind, kind}` |
| `message.sent` | `{conversation_id, message_id, channel_kind, kind, sender}` |
| `order.created` | `{order_id, code, status, source}` |
| `order.status_changed` | `{order_id, code, from, to, payment_status}` |
| `payment.evidence_received` | `{evidence_id, order_id, code, kind}` |
| `credit.exhausted` | `{state:"exhausted"}` (no `credit.low` in v1) |
| `case.opened` / `case.updated` | ids, code, kind, state / action, actor, previous_state, state, photo_count |
| `entitlements.changed` | `{scope, external_business_id, contract_version}` |
| `import.completed` | `{job_id, kind, status, created, updated, unchanged, failed, not_attempted}` |
| `ping` | `{}` |

---

## 3. User journeys (call sequences)

Assume one key with all scopes, held by sepordi's backend. `ext` = sepordi's shop id.

**Day 0 (once).** Bizin operator creates the sepordi partner, its return origins (e.g. `https://sepordi.ir`) and a key
(`docs/backend/partner.md:38-47`; scripted in `deploy/rehearsal/issue-key.sh`). Then: `GET /me` →
`POST /webhooks {"url":"https://api.sepordi.ir/hooks/bizin","event_types":["*"]}` (store `secret`) →
`POST /webhooks/{id}/ping` → verify the delivery. Optionally `PUT /branding` + `PUT /branding/disclosures/fa`
+ `POST /branding/logo`.

**A. Sign up.** Seller registers on sepordi → `POST /tenants` with `market_profile:"ir"`, `reply_language:"fa"`,
`owner.locale:"fa"` (IK = a UUID you persist with the signup) → store `tenant.id` → wait for `tenant.provisioned`
(optional). Headless: stop here. Panel access wanted: `POST …/owner/activation-link` and send `activation_url` to the
seller by email/SMS yourself.

**B. Connect WhatsApp.** `POST …/channels/whatsapp {"display_name":"…"}` → `channel_id` → poll
`GET …/channels/whatsapp/{channel_id}/pairing` every 2 s; on `qr` render a QR (the payload rotates — re-render each
time) → `connected` (also `channel.connected` webhook) → stop. On `failed`/`expired`: `DELETE …/channels/{channel_id}`
and restart. Telegram: one `POST …/channels/telegram {"bot_token":"…"}`. Instagram: `POST …/connect-links` → redirect
the browser to `url` → handle `return_url?status=…`.

**C. Add products.** Per product `PUT …/products/{product_ext}` (prices in Rial = Toman × 10; send `stock` as the
current level) or a bulk `POST …/catalog-import-jobs` (file with `image_urls` for pictures) → poll the job or wait for
`import.completed`. Then `PUT …/payment-details` (seller's card/IBAN), `PUT …/shipping` (optional),
`PUT …/return-policy` (optional), and `PUT …/assistant {"enabled":true,"auto_reply":true,"reply_language":"fa",
"persona_name":"…","business_profile":"…"}` — the assistant does nothing until this.

**D. See conversations.** On `message.received` / `message.sent` → `GET …/conversations/{cid}/messages/{mid}`; on
`handoff.raised` → `GET …/conversations/{cid}` and alert the seller. Inbox screen: `GET …/conversations?state=handoff&state=human`
(not faster than once per 10 s per business, `partner-api.md:1257`) and `GET …/conversations/{cid}/messages`. Media:
your backend proxies `GET …/media/{media_id}`. Seller answers: `POST …/claim` → `POST …/reply` (text or
`POST …/media` + `media_id`) → `POST …/release` when done.

**E. Orders.** On `order.created` → `GET …/orders/{order_id}`; on `payment.evidence_received` →
`GET …/orders/{id}/payment-evidence` → `GET …/payment-evidence/{eid}/content` (show only to the deciding person) →
`POST …/approve` or `POST …/reject {"reason":…}` (or `POST …/mark-paid`). Fulfil: `POST …/orders/{id}/status`
`packing` → `shipped` → `delivered`. After an outage: `GET …/orders?since=<newest created_at held>`.

**F. Top up credit.** **Not possible through the API.** Show `credit.state` from `GET /tenants/{ext}` and react to
`credit.exhausted`. Today the seller must activate and pay in Bizin's panel (`/billing`: USDT or card-to-card to
Bizin, confirmed by a Bizin operator), or Bizin posts credit by hand (`/api/admin/ledger`). A commercial/API decision
is needed (see Blockers).

---

## 4. In Bizin's own panel but NOT reachable through the partner API

Panel modules are `backend/internal/apiroutes/tenant.go:111-149`; pages `frontend/app/(dashboard)/*`.

| Panel feature | Panel page / API | Partner API |
|---|---|---|
| Credit balance, plans (Bronze/Silver/Gold), top-up payments, statement | `(dashboard)/billing`, `/api/v1/billing/*` (`billing/routes.go:16-24`) | none — only `credit.state` + `credit.exhausted` |
| Knowledge base (policies, FAQ, documents) | `(dashboard)/knowledge`, `/api/v1/knowledge` | none (only `business_profile`, return policy, import spec sheets) |
| Team: invite members, roles (owner/admin/agent/viewer), transfer ownership | `(dashboard)/team`, `team.Mount` | none (owner only; PA-11 deferred) |
| Flows / automation editor, forms, recipes, run history | `(dashboard)/flows`, `flowengine/flowforms/flowrecipes` | none |
| API connectors (REST/GraphQL/SOAP/gRPC) | `(dashboard)/connectors` | none |
| Customers CRM (records, tags, notes) | `(dashboard)/customers`, `/api/v1/customers` | none (customer name/phone only inside orders/conversations) |
| Calendar, services, bookings, appointments | `(dashboard)/calendar*`, `calendar`, `booking` | none (no `booking.*` webhook, OD10) |
| Tasks and in-panel notifications | `(dashboard)/tasks`, `settings/notifications`, `notify` | none |
| Dashboard KPIs, Instagram insights | `(dashboard)/dashboard`, `(dashboard)/insights` | only `GET …/stats` (4 daily counts) |
| Instagram comments | `(dashboard)/inbox/comments`, `comments` (flag `v3.instagram.comments` OFF) | none |
| Create / edit orders, address, notes, invoices, shipping labels, print | `(dashboard)/orders`, `/api/v1/orders/{id}/invoice`, `/label`, `(print)/orders/[id]/…` | read, status moves, payment decisions only |
| Product images upload, discounts / coupons, stocktake, stock ledger moves, search aliases, content links | `(dashboard)/products`, `/api/v1/products/{id}/images`, `/discounts`, `/{id}/stock` | `PUT` product (no images); images only via file import `image_urls` |
| AI tone, low-confidence handoff, takeover window, reply budget, test console, usage | `(dashboard)/settings`, `/api/v1/ai/settings`, `/preview`, `/usage` (`ai/settings.go:51-95`) | `enabled`, `auto_reply`, `reply_language`, `persona_name`, `business_profile` only |
| Per-conversation AI switch (follow shop / always on / off), read/unread, snooze/close, search by message text, assign to a teammate | `(dashboard)/inbox`, `/api/v1/conversations/*` | claim / release / queue only; `q` matches name/phone, never message text |
| Lift a customer's "stop" opt-out | panel only (`partner-api.md:1366-1367`) | refused 409 `customer_opted_out` |
| WhatsApp QR stream (SSE) and "disconnect but keep" | `/api/v1/channels/{id}/pair`, `/{id}/disconnect` (`channel/routes.go:27-28`) | poll + `DELETE` only |
| Activity / audit log | `(dashboard)/settings/activity`, `audit.Mount` | none (your actions are written there, you cannot read them) |
| Security (MFA, sessions, sign a device out), data deletion / privacy | `settings/security`, `privacy.Mount` | none |
| Internal business APIs | `/api/v1/internal-apis` (`businessapi/handlers.go`) | none |

---

## 5. Base URL, CORS, limits, versioning, units

| Item | Value | Reference |
|---|---|---|
| Base URL (production) | `https://api.bizin.app/partner/v1` — **live since 2026-10-13 15:37 UTC** (proxied A record → host nginx; only `/partner/v1` and `/healthz` routed, everything else 404) | `docs/deploy.md:54-55,218`; `docs/v3/PLAN.md:63,364`. Note `partner-api.md:26-27` still says "not reachable yet" — outdated |
| Hosted seller pages | `https://www.bizin.app/connect/<token>` (Instagram), `https://www.bizin.app/activate/<token>` | `partner-api.md:538,581`; `frontend/app/connect/[token]`, `frontend/app/activate/[token]` |
| CORS | **none in production** → server-to-server only | `backend/internal/httpserver/middleware.go:164-190` |
| Request bucket | per partner: 120 req/min refill, burst 60 (operator-adjustable); 429 `rate_limited` + `Retry-After` | `partner-api.md:277-288`; `ratelimit.go:152-161` |
| Failed-auth limiter | 30 bad keys / 15 min per client IP → that IP blocked (even valid keys) | `ratelimit.go:21-22`; `partner-api.md:290-292` |
| Provisioning quota | 200 new tenants / rolling 24 h | `partner-api.md:294-296` |
| Limiter storage | in the API process memory | `partner-api.md:298` |
| Versioning | path prefix `/partner/v1`, additive only; breaking = `/partner/v2`; ≥6 months `Deprecation`/`Sunset` | `routes.go:18`; `partner-api.md:300-310` |
| Money | integer, market storage unit; `ir` = IRR Rial, exponent 0 (Toman = ÷10 on screen) | `partner-api.md:817-819`, `:994` |
| Dates | RFC 3339 UTC; stats `YYYY-MM-DD` UTC; no Jalali | `partner-api.md:28-29` |
| Server timeout | 30 s (reply route may hold up to 20 s) | `partner-api.md:1336-1337` |

---

## 6. Feature flags gating partner endpoints (production)

From `PROJECT_OVERVIEW.md` flags table (`:755-787`) and `docs/v3/PLAN.md:366-371`. "ON, pinned" = on for everyone.

| Flag | Gates | Code | Production |
|---|---|---|---|
| `v3.partner.api` | the whole `/partner/v1` + webhook pipeline (off = 404) | `partnerapi/flag.go:8` | ON, pinned 2026-10-12 (`PROJECT_OVERVIEW.md:765`) |
| `v3.partner.inbox` | the 10 inbox routes | `partnerapi/flag.go:16` | ON, pinned 2026-10-17 (`:777`) |
| `v3.partner.bulk_jobs` | onboarding + catalogue job routes | `partnerapi/flag.go:23` | ON, pinned (`:785`) |
| `v3.channels.health_partner` | `health` on channels + `channel.health_changed` | `partnerapi/flag.go:30` | ON, pinned (`:786`) |
| `v3.handoff.queues` | the queue move + queue fields | `messaging/queue.go:16` | ON, pinned (`:781`) |
| `v3.inbox.filters` | list filters beyond state/channel/since | `messaging/flag.go:9` | ON, pinned (`:782`) |
| `v3.orders.payment_verification` | approve / reject / mark-paid (off = 409) | `flags/payment_verification.go:8` | ON, pinned (`:775`) |
| `v3.returns.cases` | the cases + return-policy routes | `flags/returns.go:7` | ON, pinned (`:776`) |
| `v3.channels.telegram` | Telegram connect (off = 503) | `telegram/connect.go:28` | ON, pinned (`:762`) |
| `v3.entitlements.enforce` | contract features / limits | `entitlement/flag.go:8` | ON, pinned; "production has no partner yet" (`:779`) |
| `v3.branding` | partner brand on seller screens / logos | `branding/flag.go:8` | ON, pinned (`:780`) |
| `v3.import.xlsx` | XLSX in job uploads (off = 415) | `importer/flag.go:7` | ON, pinned (`:783`) |
| `v3.instagram.comments` | comments (not in partner API anyway) | — | **OFF** (`PLAN.md:370`) |

Route-level flag map: `routes.go:189-210`. Every partner route is live in production today.

---

## 7. Product offering to mirror on the marketing site

The live homepage `/en` renders `ScrollFilmHome` (`frontend/app/[locale]/(marketing)/page.tsx:12,50-57`); its copy is the
`h9` object in `frontend/app/[locale]/(marketing)/home9/scroll-film.tsx:54-449`. bizin.app publishes **English only**
(Arabic staged; no Farsi on bizin.app, `frontend/components/marketing/copy.ts:28-30`, `:402-408`). The Farsi homepage
copy that existed before lives in git history and `frontend/lib/i18n/dictionaries/fa.ts` (`home` `:22`, `faq` `:76`) — a
good starting point for sepordi's Farsi copy (`page.tsx:24-27`).

| Section (`scroll-film.tsx`) | Summary |
|---|---|
| `hero` (`:55-94`) | "AI assistant for Instagram and WhatsApp businesses": one inbox, AI answers prices from the catalogue, takes the order in chat with invoice, hands receipts and hard cases to the seller |
| `channels` (`:95-122`) | Instagram DMs (official login; "opening gradually while Meta reviews the app"), WhatsApp (own number, QR from Linked devices), Telegram shown as "Soon" (although the API connects Telegram and its flag is ON) |
| `inbox` (`:123-136`) | live multi-channel inbox, reply by hand, per-conversation AI switch, handoff banner with reason, quiet period after a human reply, search, voice/video/docs playback |
| `ai` (`:137-190`) | grounded in catalogue, typo-tolerant Farsi, knowledge base, persona + tone + reply budget, sees photos (receipts never auto-paid), takes orders, books appointments, knows when to stop; AI disclosure and "stop" opt-out |
| `automation` (`:191-212`) | flow editor (25 blocks), in-chat forms, API connectors, 7 goal-based default flows, run history |
| `catalogue` (`:213-224`) | products/variants, stock ledger, stocktake, discounts, product photos, Excel/CSV import with preview |
| `orders` (`:225-236`) | pipeline Draft→Confirmed→Paid→Shipped→Delivered, approval lane, numbered invoices, printable invoice + label, carrier, customer records |
| `calendar` (`:237-248`) | services, staff/rooms, hours, holidays, deposits, no-shows, ICS feed, in-chat booking |
| `team` (`:249-260`) | 4 roles, invite by link, assignment, task queues, remote sign-out, ownership transfer |
| `insights` (`:261-267`) | Instagram page metrics + recommendations, beta |
| `careful` (`:268-294`) | encrypted secrets, receipts behind login, audit, data deletion, PWA, RTL |
| `start` (`:295-315`) | 3 steps: connect, import + paste rules, let it answer |
| `pricing` (`:316-364`) | Free $0 (~200 replies, no card); **Bronze $20** (2% permanent discount, ~7,400 replies); **Silver $40** (7%, ~15,700, "Best value"); **Gold $60** (10%, ~24,400). One-off entry fee, all of it becomes credit, then pay-as-you-go top-ups; credit never expires, not refundable; at zero only AI replies stop; pay with USDT (TRC20/ERC20/BEP20) or bank transfer; counts are estimates |
| `faq` (`:365-422`) | 13 Q&As: no new number/page, not the official WhatsApp API (linked device), no Instagram comments, hands over when unsure, no voice understanding, you can answer yourself, not a subscription, how to pay, auto-confirmed orders (or approval), no online payment through bizin, languages, team, own software |
| `closing` (`:444-448`, rendered `:1781`) | final CTA |

Older section copy with the same plan facts: `frontend/components/marketing/copy.ts:247-296` (pricing model, "no Rial
figure because the rate is operator-set"), FAQ `:306-374`. Billing facts behind the prices: `docs/backend/billing.md:8-11`
(entry plans $20/$40/$60, Tether + card-to-card, signup credit), discounts gold 10% / silver 7% / bronze 2% (`:54`). Plans
are seeded in the DB and editable by an operator (`/api/admin/plans/{code}`, `billing/routes.go:82-83`), so sepordi
must not hard-code Rial prices (the Rial face follows the operator's USDT/IRR rate, `billing.md:182-208`). The partner
contract carries no price (`partner-api.md:1693-1695`): **what sepordi charges its sellers, and how Bizin bills sepordi,
is not modelled in code** — a commercial decision.

Legal pages to mirror or link: `frontend/app/(legal)/privacy`, `terms`, `data-deletion`.

---

## 8. Existing partner docs, OpenAPI, example client, sandbox

| What | Where |
|---|---|
| Prose contract | `docs/backend/partner-api.md` (§10 "first day" `:2177-2186`, §11 headless walkthrough `:2188-2211`, §12 route status `:2213-2230`) |
| OpenAPI 3.1 | `docs/partner/openapi-v1.yaml` (73 ops + `receiveEvent` webhook `:3209-3212`) |
| Design / decisions | `docs/v3/design/10.1-10.3-partner-api.md`, `10.4-5.1-bulk-onboarding-xlsx-import.md`, `10.5-10.6-entitlements-branding-disclosure.md` |
| Example client (bash + curl + jq) | `deploy/rehearsal/partner-v30.sh` (provision → channels → catalog → card → order), `partner-v31.sh` (inbox, payments, cases, …), helpers `lib.sh`; guides `docs/partner/rehearsal-v3.0.md`, `rehearsal-v3.1.md` |
| Test partner | `deploy/rehearsal/issue-key.sh` creates partner slug `bizin-rehearsal` in production (`:17-20`) — an operator step; the rehearsals are still "waiting on the owner" (`PLAN.md:377-378`). **There is no sandbox environment**: the rehearsal runs against production |
| Webhook verifier samples | Go and Node in `partner-api.md:2016-2146`; pinned by `backend/internal/partnerhooks/sign_test.go` |
| Import templates | `docs/partner/templates/tenants.csv/.xlsx`, `products.csv/.xlsx` |
| sepordi-specific | nothing in the bizin repo names sepordi; no sepordi partner record is known (prod "has no partner yet", `PROJECT_OVERVIEW.md:779`) |

---

## 9. Blockers & risks

| # | Item | Severity | Reference | What to do |
|---|---|---|---|---|
| 1 | No sepordi partner, key or return origin exists; keys are operator-issued only | **Blocker** | `PROJECT_OVERVIEW.md:779`; `docs/backend/partner.md:38-47` | Bizin operator: create partner, set `https://sepordi.ir` (and staging) as return origins, issue a key with all 27 scopes |
| 2 | No credit / top-up / balance / plan API — a seller's AI stops after ~200 trial replies | **Blocker** for "everything bizin offers" | §2.10; `billing/routes.go:16-24` | Decide: partner-paid wholesale credit (new API or operator ledger), or send sellers to the Bizin panel via the activation link |
| 3 | Instagram connect for non-tester accounts needs Meta App Review on Bizin's app | **Blocker** for Instagram | `partner-api.md:562-563`; marketing note `scroll-film.tsx:105` | WhatsApp + Telegram work now; Instagram waits for App Review |
| 4 | Knowledge base, team, flows, connectors, customers, calendar/bookings, tasks, discounts, product image upload, invoices/labels, order creation, AI tone and limits — panel-only | High | §4 | Ship sepordi v1 without them, or deep-link activated owners into the Bizin panel; ask Bizin for routes (PA-11 team is already planned v3.2+) |
| 5 | No CORS; the key opens every business of the partner | High | `httpserver/middleware.go:164-190` | All calls from sepordi's backend; enforce seller→`external_business_id` authorization in sepordi |
| 6 | One rate bucket (120/min, burst 60) for all sellers; a WhatsApp pairing poll costs 30/min | Medium | `partner-api.md:277-288,729` | Poll every 3–5 s, use webhooks over polling, honour `Retry-After`; ask the operator to raise limits before launch |
| 7 | Seller email already on bizin.app → 409 `owner_email_in_use`; no account linking | Medium | `partner-api.md:405` | Tell such sellers to use another email, or wait for linking |
| 8 | Webhook receiver must be public https:443; 4xx (e.g. a 401 on bad signature) = dead at once | Medium | `partner-api.md:622-623,1980-1984,2101` | Return 2xx fast; queue work; reconcile with list routes + `since` |
| 9 | No sandbox; the only test kit runs against production | Medium | `deploy/rehearsal/*`; `docs/partner/rehearsal-v3.0.md:1-6` | Use a dedicated test partner/key and test shops; clean up with `DELETE` / archive |
| 10 | Doc drift: `partner-api.md:26-27` says the host is not live (it is); `tenant.metadata` is returned by the code although documented as not; `owner.phone` accepted but not in the prose table | Low | `docs/deploy.md:54`; `partnerapi/tenants.go:95`; `provision.go:151-156` | Code from the OpenAPI file; treat extra fields as optional |
| 11 | WhatsApp is a linked device (not the official API), QR only — no phone pairing code | Low (product) | `scroll-film.tsx:374-375`; no pairing-code code in backend | Copy must say "scan from Linked devices" |
| 12 | VAT and the shipping-cost answer (SH-5) wait on the partner's answers | Low | `docs/v3/PLAN.md:376` | sepordi to answer OD1 / OD4 |
| 13 | Marketing says Telegram "Soon" while the API connects Telegram (flag ON) | Low | `scroll-film.tsx:115-118`; `PROJECT_OVERVIEW.md:762` | Decide what sepordi advertises |
| 14 | The local `main` checkout of bizin-v3 is stale (no partner code) | Info | `git log main` = `f2524f5`, `origin/main` = `0b06cec` | Read the code from `origin/main` |
