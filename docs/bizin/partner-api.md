# Partner API v1 — the contract

Status: 2026-10-18 (PLAN 10.1–10.3, slice PA-10; v3.0 additions P1–P5 from PLAN "Releases"; the v3.1 contract pass
CD-1). Describes the code on `batch/aj-4` after aj-18. The machine-readable form is `docs/partner/openapi-v1.yaml`,
held to the code by `backend/internal/partnerapi/contract_doc_test.go` (every route with its scope and contract feature,
the scope and event-type catalogues, each event's payload keys, the closed value lists); the design and the owner's
decisions (D25) are `docs/v3/design/10.1-10.3-partner-api.md`; the operator side (partners, keys, limits, return
origins) is `docs/backend/partner.md`.

A partner platform owns its own UI and its sellers. Bizin runs the assistant, the channels and the Meta tokens. Through
this API a partner creates businesses ("tenants") by its own ids, reads their state and daily counts, connects their
channels (a Bizin-hosted link for Instagram; WhatsApp QR pairing and a Telegram bot token straight through the API),
writes their catalog by its own product ids, sets the card-to-card payment details and the assistant's settings, reads
their orders and conversations, fetches the owner's activation link, and receives signed webhooks about what happened.
It never receives a password, a session, a channel token, a whole card or IBAN number back, or a customer's platform
id or handle; a customer's message text only through the inbox reads (§8.15, scope `inbox:read`), never in a webhook.

---

## 1. Base URL and transport

```
https://api.bizin.app/partner/v1
```

- **Not reachable yet.** The `api.bizin.app` hostname goes live with PLAN 0.12 (the direct-origin migration). Until
  then the routes run on the API process but no public hostname routes `/partner/v1` to it.
- HTTPS only. Request and response bodies are `application/json; charset=utf-8`. Times are RFC 3339 in UTC; stats
  days are `YYYY-MM-DD` UTC dates.
- The whole surface is behind the `v3.partner.api` flag (ON since 2026-10-12). Off, every `/partner/v1` path answers
  404 `not_found` before a key is looked at.
- Every response carries `X-Request-Id`. A caller may send its own `X-Request-Id` (1–64 characters of
  `[A-Za-z0-9._-]`); it is kept and echoed, anything else is replaced by a fresh id. Quote it in a support ticket.

## 2. Authentication

```
Authorization: Bearer bzp_<key_id>_<secret>
```

| Part | Shape |
|---|---|
| `bzp_` | fixed prefix; secret scanners key on it |
| `key_id` | 16 characters of lowercase RFC 4648 base32 (`a-z`, `2-7`); public, appears in `GET /me` and in Bizin's logs |
| `secret` | 43 characters of base64url without padding (32 random bytes) |

- The header is the only place a key is accepted (no query parameter, no cookie). A Bizin seller session token on
  `/partner/v1` is refused with 401 `invalid_partner_key`, and a `bzp_` key anywhere under `/api/` is refused with 401
  — a partner key opens nothing but `/partner/v1`.
- Bizin stores only `SHA-256(secret)`. The plaintext key is shown once, in the operator's create or rotate answer, and
  cannot be shown again.
- A missing header, a malformed key, an unknown `key_id`, a wrong secret, a revoked key and an expired key all get the
  same 401 `invalid_partner_key`. A valid key of a suspended partner gets 403 `partner_suspended`.
- There is no key cache: a revoke, an expiry or a suspension applies to the very next request.
- **Keys are issued, rotated and revoked by a Bizin operator** (self-service is PLAN 10.7). A partner holds at most two
  live keys. A rotation issues a new key and lets the old one keep working for a grace period — 7 days unless the
  operator chooses 0–720 hours — so the partner can deploy the new key before the old one expires. Revoke is
  immediate.
- Rate limits, quotas and idempotency keys belong to the **partner**, not to the key: both keys of a rotation share one
  budget, and a retry sent with the new key still replays a write first sent with the old one.

### Scopes

Each key carries a set of scopes. Every route needs exactly one; `GET /me` needs none. A key without the route's scope
gets 403 `insufficient_scope` with `params.required` naming the scope.

| Scope | Routes |
|---|---|
| *(any valid key)* | `GET /me` |
| `tenants:provision` | `POST /tenants`; `POST /onboarding-jobs`, `POST /onboarding-jobs/{job_id}/commit`, `POST /onboarding-jobs/{job_id}/cancel` (§8.18) |
| `tenants:read` | `GET /tenants`, `GET /tenants/{external_business_id}`; `GET /onboarding-jobs`, `GET /onboarding-jobs/{job_id}`, `GET /onboarding-jobs/{job_id}/rows` |
| `channels:read` | `GET /tenants/{external_business_id}/channels` |
| `stats:read` | `GET /tenants/{external_business_id}/stats` |
| `channels:connect` | `POST /tenants/{external_business_id}/connect-links`, `POST …/channels/whatsapp`, `GET …/channels/whatsapp/{channel_id}/pairing`, `POST …/channels/telegram`, `DELETE …/channels/{channel_id}` |
| `users:activate` | `POST /tenants/{external_business_id}/owner/activation-link` |
| `catalog:read` | `GET …/products`, `GET …/products/{product_ext}` |
| `catalog:write` | `PUT …/products/{product_ext}`, `DELETE …/products/{product_ext}` |
| `payments:read` | `GET …/payment-details`, `GET …/orders/{order_id}/payment-evidence` |
| `payments:write` | `PUT …/payment-details` |
| `shipping:read` | `GET …/shipping` |
| `shipping:write` | `PUT …/shipping` |
| `assistant:read` | `GET …/assistant`, `GET …/return-policy` |
| `assistant:write` | `PUT …/assistant`, `PUT …/return-policy` |
| `payments:verify` | `GET …/orders/{order_id}/payment-evidence/{evidence_id}/content`, `POST …/orders/{order_id}/payment-evidence/{evidence_id}/approve`, `POST …/orders/{order_id}/payment-evidence/{evidence_id}/reject`, `POST …/orders/{order_id}/mark-paid` |
| `orders:read` | `GET …/orders`, `GET …/orders/{order_id}` |
| `orders:fulfil` | `POST …/orders/{order_id}/status` |
| `cases:read` | `GET …/cases`, `GET …/cases/{case_id}`, `GET …/cases/{case_id}/photos/{photo_id}` |
| `cases:write` | `POST …/cases/{case_id}/actions` |
| `inbox:read` | `GET …/conversations`, `GET …/conversations/{conversation_id}`, `GET …/conversations/{conversation_id}/messages`, `GET …/conversations/{conversation_id}/messages/{message_id}` |
| `inbox:media` | `GET …/media/{media_id}` (customer photos, voice notes, documents and payment receipts) |
| `inbox:write` | `POST …/conversations/{conversation_id}/reply`, `…/claim`, `…/release`, `…/queue`, `POST …/media` (an image for a reply) |
| `webhooks:manage` | every `/webhooks` route |
| `entitlements:read` | `GET /entitlements`, `GET …/entitlements` |
| `entitlements:write` | `PUT …/entitlements` |
| `branding:read` | `GET /branding` (§8.21) |
| `branding:write` | `PUT /branding`, `PUT /branding/disclosures/{locale}`, `POST /branding/logo` (§8.21) |

`…` stands for `/tenants/{external_business_id}`. A key holds at most 32 scopes, so one key may hold the whole catalogue,
`partner.Scopes` (`backend/internal/partner/keys.go`); an operator issuing a key with any other value gets 422 `invalid_scopes`.
The pairing poll is a read but sits under `channels:connect`: the QR it returns is a credential for the business's
WhatsApp. `inbox:media` is separate from `inbox:read` because it opens the bytes of customer photos, voice notes,
documents and bank receipts; the receipt content route sits under `payments:verify`, not `payments:read`, for the same
reason.

A scope opens a route; under `/tenants/{ext}` some routes also need a feature of your partner contract (`x-feature` in
the OpenAPI file, §8.19), checked after the scope (§3):

| Contract feature | Routes |
|---|---|
| `payments.verification` | the four `…/orders/{order_id}/payment-evidence…` routes and `POST …/orders/{order_id}/mark-paid` |
| `shipping.rules` | `GET` and `PUT …/shipping` |
| `returns.cases` | the four `…/cases…` routes (not the return policy) |
| `inbox.api` | every inbox route of §8.15 |

The channel features (`channel.whatsapp`, `channel.instagram`, `channel.telegram`) and `flows.advanced` /
`instagram.comments` are checked inside the connect routes and the flows, not per route.

## 3. Order of checks

Each request passes these steps in this order; the first one that refuses answers.

1. flag `v3.partner.api` off → 404 `not_found`
2. the caller's address is blocked by the failed-auth limiter (§6) → 429 `rate_limited`
3. key authentication → 401 `invalid_partner_key` / 403 `partner_suspended`
4. the partner's request bucket (§6) → 429 `rate_limited` (the `RateLimit-*` headers are set from here on)
5. route match → 404 `not_found` for an unknown path **or an unknown method on a known path** (no 405); an inbox
   route (§8.15) while `v3.partner.inbox` is off answers the same, whatever scopes the key holds, and so does an
   onboarding-job route (§8.18) while `v3.partner.bulk_jobs` is off
6. scope → 403 `insufficient_scope`
6a. on a route that needs a contract feature (§8.19), when `{ext}` is one of your businesses: the feature → 403
   `feature_not_entitled` with `params.feature`. Any other `{ext}` goes on unchanged, so step 8 answers it as before. A
   key without the scope therefore learns nothing about the business or its contract
7. on POST, PATCH and DELETE: the `Idempotency-Key` guard (§5); `PUT` and `GET` pass straight through
8. the route's own validation and work

Inside step 8 most routes resolve `{ext}` first (400 `external_business_id_invalid`, 404 `tenant_not_found`). Four
check their input first, so a bad input to an unknown tenant answers the input error: `GET …/stats` (the range),
`GET …/orders` (`limit`, `status`, `since`, `cursor`), `PUT …/payment-details` and `PUT …/assistant` (the body). The
inbox lists do too: `GET …/conversations` (`limit`, `state`, `channel`, `since`, `cursor`) and
`GET …/conversations/{conversation_id}/messages` (`limit`, `before`, `after`).

## 4. Errors

Every error answer has one shape:

```json
{
  "error": "insufficient_scope",
  "code": "insufficient_scope",
  "message": "this key does not hold the scope this route needs",
  "params": { "required": "tenants:provision" },
  "request_id": "6d3c0e7a-4f71-4c55-9e0b-6f1c2a8b9d10"
}
```

- `code` is the stable, machine-readable value — branch on it. `error` repeats it for older clients.
- `message` is an English sentence for logs and developers; its wording may change.
- `field` (optional) names the input at fault, as a dotted path (`owner.email`, `return_url`).
- `params` (optional) carries the values the sentence refers to (`allowed`, `max`, `required`, …).
- `request_id` repeats the `X-Request-Id` response header.

Every code a `/partner/v1` request can answer (the "English text" column is the sentence in Bizin's panel catalogue,
`frontend/lib/error-codes/core.ts`; the body's `message` is the server's own sentence):

| Code | Status | Where | `field` / `params` | English text |
|---|---|---|---|---|
| `not_found` | 404 | flag off; unknown route or method; a webhook id that is not the caller's or not a uuid | — | Not found. |
| `invalid_partner_key` | 401 | gateway | — | The partner API key is missing or not valid. |
| `partner_suspended` | 403 | gateway | — | This partner account is suspended. |
| `rate_limited` | 429 | gateway (bucket or failed-auth limiter) | `params.retry_after_seconds`; `Retry-After` header | Too many attempts. Please try again later. |
| `insufficient_scope` | 403 | gateway | `params.required` | This API key does not have the {required} scope. |
| `not_implemented` | 501 | a route without a handler (§12) | — | This route is not available yet. |
| `internal_error` | 500 | any | — | Something went wrong on our side. Please try again. |
| `idempotency_key_required` | 400 | every write without the header | — | This request needs an Idempotency-Key header. |
| `idempotency_key_invalid` | 400 | the header is repeated, empty, over 255 characters or not printable ASCII | — | The Idempotency-Key header is not valid. |
| `idempotency_body_unreadable` | 400 | the body could not be read | — | The request body could not be read. |
| `idempotency_body_too_large` | 413 | a keyed body over 1 MiB | `params.max_mb` | The request is too large to protect against repeats. |
| `idempotency_key_reused` | 422 | same key, same route, different request | — | This Idempotency-Key was already used for a different request. |
| `idempotency_request_in_progress` | 409 | the first request with this key is still running | `Retry-After: 1` | The same request is still being processed. Wait a moment. |
| `idempotency_replay_unavailable` | 409 | the first answer was too large to keep | — | This request was already done, but its answer cannot be repeated. Refresh to see the result. |
| `idempotency_unavailable` | 503 | the idempotency store could not be reached | — | Repeat protection is not available right now. Try again shortly. |
| `bad_request_body` | 400 | the JSON does not parse, has an unknown field, the wrong type, or is over the route's limit: 4 KiB on the channel connect routes, 64 KiB on `PUT …/assistant`, 256 KiB on `PUT …/products/{product_ext}`, 16 KiB elsewhere | — | The request was not valid. |
| `invalid_value` | 422 (body) / 400 (query or path) | a field fails validation; a catalog rule checked by the shop's own validation (title, lengths, prices, variant count) and an assistant length rule answer without `field` | `field`; `params.allowed` for enumerations | A value is not valid. |
| `limit_invalid` | 400 | `?limit` outside 1–100 | `params.max` | The requested count is not valid. |
| `stats_range_invalid` | 400 | `from` after `to`, or more than 92 days | `params.max_days` | The start date must not be after the end date, and the range is at most {max_days} days. |
| `external_business_id_invalid` | 422 (body) / 400 (path) | not 1–128 characters of valid UTF-8, or a malformed percent-escape in the path | `field` in the body case | external_business_id must be 1 to 128 characters. |
| `tenant_not_found` | 404 | no tenant **of this partner** has the id (another partner's tenant answers the same) | — | No business of this partner has this external_business_id. |
| `quota_exceeded` | 429 | the daily provisioning quota is used up | `params.quota` = `provision_per_day`, `params.limit` | The {quota} quota of {limit} is used up. Try again later. |
| `entitlement_exceeded` | 403 | the partner's contract allows no more tenants (always allowed in v1) | — | This partner's contract allows no more businesses. |
| `owner_email_in_use` | 409 | the owner's email already has a Bizin account | `field` = `owner.email` | This owner email already has a Bizin account. |
| `owner_mismatch` | 409 | the external id was provisioned with another owner | — | This external_business_id was set up with a different owner. |
| `owner_external_id_in_use` | 409 | `owner.external_user_id` already names another user of this partner | `field` = `owner.external_user_id` | This owner external_user_id already belongs to another user of this partner. |
| `owner_already_active` | 409 | activation link for an owner who already activated | — | The owner has already activated the account. |
| `owner_not_pending` | 409 | the tenant has no owner waiting for activation (disabled, or no active owner membership) | — | This business has no owner waiting for activation. |
| `channel_not_supported` | 400 | connect link for a channel other than `instagram` | `params.allowed` | This channel cannot be connected with a link. |
| `return_url_not_allowed` | 400 | `return_url` is not https on one of the partner's return origins | `field` = `return_url` | return_url must be an https address on one of the partner's approved origins. |
| `channel_already_connected` | 409 | the channel is connected and `replace` is false | — | This channel is already connected. Ask for replace to connect another account. |
| `webhook_url_refused` | 422 | the endpoint URL is not https on 443 or does not name a public host | `field` = `url` | The webhook URL must use https on port 443 and point to a public host. |
| `webhook_limit_reached` | 409 | the partner already has 5 endpoints (active or disabled) | `params.max` | This partner already has the maximum of {max} webhook endpoints. |
| `webhook_disabled` | 409 | ping on a disabled endpoint | — | This webhook endpoint is disabled. Enable it before sending a ping. |
| `secrets_unavailable` | 503 | an endpoint secret could not be sealed | — | Secret storage is not available. |
| `channel_account_not_found` | 404 | `{channel_id}` is not a uuid, not a channel of this tenant, or (on the pairing poll) not a WhatsApp channel | — | This connection no longer exists. |
| `whatsapp_pairing_in_progress` | 409 | `POST …/channels/whatsapp` while a pairing of this tenant is still waiting for its scan | — | A WhatsApp pairing is already running for this business. Poll it or wait for it to end. |
| `channel_create_failed` | 500 | the WhatsApp channel row could not be created | — | The connection could not be created. Please try again. |
| `whatsapp_pairing_failed` | 502 | the WhatsApp pairing session could not be started (the new channel is left in `error`) | — | WhatsApp pairing could not be started. Please try again. |
| `telegram_unavailable` | 503 | the `v3.channels.telegram` flag is off for this tenant, or the server cannot connect bots (no public base URL, no secrets keyring) | — | Connecting a Telegram bot is unavailable right now. |
| `telegram_token_invalid` | 422 | `bot_token` does not have a bot token's shape | `field` = `bot_token` | This is not a Telegram bot token. |
| `telegram_token_rejected` | 422 | Telegram refused the token, or it is not a bot's | `field` = `bot_token` | Telegram did not accept this bot token. |
| `telegram_bot_taken` | 409 | the bot already belongs to a Bizin channel: another business's, or a connected one of this business | — | This bot is already connected to another account. |
| `telegram_failed` | 502 | Telegram could not be reached | — | Telegram could not be reached. Please try again. |
| `product_not_found` | 404 | no product of this tenant has `{product_ext}` | — | This product no longer exists. |
| `sku_taken` | 409 | another product of this tenant already uses `sku` | — | Another product already uses this SKU. |
| `variant_external_id_taken` | 409 | another product of this tenant already has a variant with this `external_id` | — | Another product of this business already has a variant with this external_id. |
| `card_number_invalid` | 422 | `card_number` is not 16 digits or fails the Luhn check | `field` = `card_number` | The card number is not valid. Check all 16 digits. |
| `iban_invalid` | 422 | `iban` is not `IR` + 24 digits or fails the IBAN check | `field` = `iban` | The IBAN is not valid. It must be IR followed by 24 digits. |
| `payment_destination_required` | 422 | neither `card_number` nor `iban` is set | `field` = `card_number` | Enter a card number or an IBAN. |
| `order_not_found` | 404 | `{order_id}` is not a uuid or not an order of this tenant | — | This order no longer exists. |
| `case_not_found` | 404 | `{case_id}` is not a uuid or not a case of this tenant | — | This case no longer exists. |
| `photo_not_found` | 404 | `{photo_id}` is not a uuid, not a photo of that case, or the picture is gone | — | This photo no longer exists. |
| `evidence_not_found` | 404 | `{evidence_id}` is not a uuid, not a receipt of that order of this tenant, or (content) the picture is gone | — | This payment receipt no longer exists. |
| `evidence_already_decided` | 409 | approve on a rejected or closed receipt, reject on an approved or closed one | `params.status` | This receipt has already been decided. Refresh to see the decision. |
| `order_not_awaiting_payment` | 409 | approve or mark-paid on an order that is not `confirmed` (a paid order's mark-paid is 200) | `params.status`, `params.payment_status` | This order is not waiting for a payment. |
| `payment_verification_off` | 409 | approve, reject or mark-paid while `v3.orders.payment_verification` is off for the business | — | Payment verification is not enabled for this business. |
| `invalid_transition` | 409 | a status move the order's state does not allow | `params.from`, `params.to`, `params.allowed` | This order cannot move to that status from where it is now. |
| `conversation_not_found` | 404 | `{conversation_id}` is not a uuid or not a conversation of this tenant | — | This conversation no longer exists. |
| `message_not_found` | 404 | `{message_id}` is not a uuid or not a message of that conversation | — | This message no longer exists. |
| `no_customer_message` | 409 | a reply on a conversation the customer never wrote in (no cold outreach) | — | This customer has not written in this conversation yet, so a reply cannot be sent. |
| `customer_opted_out` | 409 | a release on a conversation whose customer asked the assistant to stop | — | This customer asked the assistant to stop. Only the business can turn it back on, from its panel. |
| `window_closed` / `recipient_refused` / `send_paused` / `channel_not_connected` / `conversation_busy` | 409 | the reply's channel refused or held it (§8.15) | `params` per §8.15 | — |
| `image_not_supported_on_channel` | 409 | an image reply on Instagram (§8.15) | — | Images cannot be sent on Instagram from here yet. Send text instead. |
| `media_not_found` | 404 | a reply's `media_id`, or a media download's id, that is not a uuid or not this business's | — | This image no longer exists. Upload it again. |
| `image_type_unsupported` / `file_too_large` / `bad_multipart` / `file_field_missing` / `image_empty` | 415 / 413 / 400 | an upload that is not a JPEG or PNG, over the image cap, or not a multipart `file` (§8.15) | `params.max_mb` / `params.field` | The image must be a JPEG or PNG under the size limit. |
| `send_rate_limited` | 429 | the channel's budget or the platform's limit; `Retry-After` | `retry_after_seconds` | — |
| `send_failed` | 502 | the reply did not reach the customer | — | — |
| `case_state_conflict` | 409 | the case is not in `expected_state`, or the action is not allowed from its state | — | This case has changed since you loaded it. Refresh and try again. |
| `case_closed` | 409 | an action on a case in a final state | — | This case is closed. |
| `invalid_action` | 422 | the action body breaks a rule of §8.14 | `field`; `params.allowed` for enumerations, `params.max` for lengths | This action is not valid for this case. |
| `refund_exceeds_total` | 422 | `refund.amount` is more than the linked order's total | `field` = `refund.amount` | The refund amount is more than the order total. |
| `return_policy_not_set` | 404 | `GET …/return-policy` before any `PUT` | — | This business has no return policy yet. |
| `return_policy_empty` | 422 | an enabled policy without `window_days` and `conditions` | `field` = `conditions` | An enabled return policy needs a return window, conditions or both. |
| `media_unavailable` / `media_store_unavailable` | 503 | the case photo or receipt download cannot read the media store (`Retry-After: 5` on the second) | — | — |

Request bodies are decoded strictly: an unknown field is 400 `bad_request_body`. Send only the fields documented here.

## 5. Idempotency

Every `POST`, `PATCH` and `DELETE` on `/partner/v1` **requires** an `Idempotency-Key` header (1–255 printable ASCII
characters, e.g. a UUID). Without it the answer is 400 `idempotency_key_required` and nothing runs. `GET` takes no key.

`PUT` takes no key either, and an `Idempotency-Key` sent on a `PUT` is ignored: the three `PUT` routes (product,
payment details, assistant) each replace one resource with the body, so sending the same body twice leaves the same
state. Two different bodies sent concurrently end as whichever wrote last.

- A key is scoped to (partner, method, exact path, key). The same key on another route, or from another partner, is a
  different operation.
- The first request with a key runs. A retry with the same key and the **same request** (method, path, query string,
  `Content-Type` media type and body bytes) within **24 hours** gets the stored answer again — same status, same body,
  plus `Idempotent-Replayed: true`. The handler does not run again.
- The same key with a different request on the same route → 422 `idempotency_key_reused`.
- A retry while the first request is still running → 409 `idempotency_request_in_progress` with `Retry-After: 1`.
- Only 2xx answers are stored. A 4xx or 5xx frees the key, so a corrected or later retry with the same key runs.
- **Replays never return a credential.** Fields that carry one are stored as `null` with a marker beside them, so a
  replayed answer carries, for example, `"secret": null, "secret_redacted_on_replay": true`. Redacted on every write:
  `secret` (webhook create and rotate-secret) and `activation_url` (activation link); on `POST …/connect-links` also
  `url`. A partner that lost the first answer re-issues the link or rotates the secret with a **new** key.
- On `POST …/channels/telegram` `bot_token` is on the redaction list too, though no answer carries it: the token is
  never in a response, an error or a log line, and the idempotency store keeps only a SHA-256 of the request.
- The payment-details answers are masked by construction (`card_number_last4`, `iban_last4`), so nothing in them needs
  redacting and no answer, first or replayed, carries a whole number.
- A replayed `POST …/channels/whatsapp` returns the first answer's `channel_id` and starts no second pairing; a
  replayed `DELETE` returns 204 again.
- Provisioning is idempotent beyond the 24 hours as well: a second `POST /tenants` for an `external_business_id` the
  partner already holds creates nothing (§8.1).

## 6. Rate limits

**Request bucket.** One token bucket per partner, refilled at `api_rate_per_minute` (default 120) up to `api_burst`
(default 60); each request spends one token. The operator sets both (`docs/backend/partner.md`); a change can take up
to a minute to apply. Every authenticated answer, including a 429, carries:

| Header | Meaning |
|---|---|
| `RateLimit-Limit` | `api_rate_per_minute` |
| `RateLimit-Remaining` | whole tokens left after this request |
| `RateLimit-Reset` | seconds until the bucket is full again |

Over the limit: 429 `rate_limited`, `Retry-After: <seconds until one token is back>` and
`params.retry_after_seconds` with the same number.

**Failed authentication.** 30 failed authentications (`invalid_partner_key`) from one client address within a 15-minute
window block that address: every further request from it — a valid key included — gets 429 `rate_limited` with
`Retry-After` until the window ends, before any key is checked. These answers carry no `RateLimit-*` headers.

**Provisioning quota.** At most `provision_per_day` (default 200) new tenants per partner in any rolling 24 hours,
counted exactly from the tenants table. Over → 429 `quota_exceeded` (`params.quota`, `params.limit`; no `Retry-After`).
A `POST /tenants` that resolves to an existing external id does not count.

The bucket and the failed-auth limiter are kept in the API process's memory.

## 7. Versioning

- `v1` changes only additively: new optional request fields, new response fields, new routes, new event types, new
  error codes. **Clients must ignore unknown response fields and unknown webhook event types**, and must branch on
  `code`, never on `message`.
- **Every response enum is extensible** (OD8, 2026-10-14): a client must accept a value it does not know and treat it
  as "some other state". Under this rule the order `status` gained `packing` and `payment.status` gained
  `pending_verification` and `rejected`; the spec marks such enums `x-extensible-enum: true`.
- A breaking change ships as `/partner/v2`. A retired v1 route keeps working for at least 6 months and announces the
  date with `Deprecation` and `Sunset` (RFC 8594) headers during that time (owner decision D25 / OD9). No v1 route is
  deprecated today.

---

## 8. Routes

All paths are below `https://api.bizin.app/partner/v1`. `{ext}` is the partner's own `external_business_id`.

**Writing `{ext}` and `{product_ext}` in a path.** Percent-escape any character outside the unreserved URL set
(`A–Z a–z 0–9 - . _ ~`); the server decodes the escape before the lookup, so `shop%3A42` addresses `shop:42` and
`region%2F7` addresses `region/7`. A malformed escape (`%zz`) is 400 — `external_business_id_invalid` for `{ext}`,
`invalid_value` with `field` = `product_external_id` for `{product_ext}`. Both ids are 1–128 characters of valid UTF-8
after decoding.

### 8.0 `GET /me` — who am I

Any valid key. Returns the partner, the key and the limits it spends against; nothing about any tenant.

```http
GET /partner/v1/me
Authorization: Bearer bzp_kq3x7m2ta5rwze4d_…
```

```json
200
{
  "partner_id": "5d0c2f8a-31a4-4f0e-b7a2-0c9e7d41a6b3",
  "key_id": "kq3x7m2ta5rwze4d",
  "scopes": ["tenants:provision", "tenants:read", "channels:read", "channels:connect", "stats:read", "webhooks:manage", "users:activate"],
  "limits": { "api_rate_per_minute": 120, "api_burst": 60, "provision_per_day": 200 }
}
```

### 8.1 `POST /tenants` — provision a business and its owner

Scope `tenants:provision`. Creates, in one transaction, the tenant, its signup trial credit, its AI reply language, its
market profile, its owner as a **pending** user (no password, cannot log in), the owner membership and the partner's
external refs. It sends no message, calls no channel and runs no AI. A `tenant.provisioned` webhook follows.

```http
POST /partner/v1/tenants
Authorization: Bearer bzp_…
Idempotency-Key: 4b7f9a52-0d55-4a8e-9f1e-2a7d3c1b6e90
Content-Type: application/json

{
  "external_business_id": "biz-778",
  "name": "Luna Store",
  "reply_language": "en",
  "market_profile": "intl",
  "metadata": { "campaign": "q4" },
  "owner": {
    "external_user_id": "usr-4411",
    "email": "owner@shop.example",
    "display_name": "Lucia",
    "locale": "en"
  }
}
```

| Field | Rule |
|---|---|
| `external_business_id` | required; 1–128 characters; unique per partner (422 `external_business_id_invalid`) |
| `name` | required; 1–200 characters after trimming |
| `market_profile` | **required**, no default; one of the selectable profiles — today `ir`, `ae`, `intl` (422 `invalid_value`, `params.allowed`). Only a Bizin operator changes it later. |
| `reply_language` | optional, default `en`; the language the assistant answers customers in when their own language is not `en`, `ar` or `fa`; one of `en`, `ar`, `fa` (422 `invalid_value`, `params.allowed`) |
| `metadata` | optional JSON object, at most 8 KiB, stored for the partner; `null` or absent stores nothing. Not returned by the read routes today. |
| `owner.external_user_id` | required; 1–128 characters; the partner's id for the person |
| `owner.email` | required; a bare address (`name@host`, no display-name form); stored lower-case |
| `owner.display_name` | required; 1–200 characters after trimming |
| `owner.locale` | optional; the owner's panel language, one of `fa`, `en`, `ar` (422 `invalid_value`, `params.allowed`) |

```json
201
{
  "tenant": {
    "id": "0b1c6f0e-8d2a-4c3b-9a71-5e2f4d8c1a90",
    "external_business_id": "biz-778",
    "name": "Luna Store",
    "status": "active",
    "reply_language": "en",
    "market_profile": "intl",
    "created_at": "2026-10-13T09:12:44.512Z"
  },
  "owner": { "user_id": "7f2e1c4b-9a3d-4e8f-b2c6-1d5a7e9f0b38", "external_user_id": "usr-4411", "status": "pending" },
  "channels": [],
  "credit": { "state": "ok" },
  "created": true
}
```

- **Same external id again** (any `Idempotency-Key`, any time): if the owner matches — same `owner.external_user_id`
  **and** same `owner.email` — the answer is **200** with the tenant's current state and `"created": false`; nothing is
  written and the quota is not spent. Other fields of the request (name, languages, metadata) are not applied. If the
  owner differs → 409 `owner_mismatch`.
- 409 `owner_email_in_use`: the email already has a Bizin account (linking existing accounts is a later release).
- 409 `owner_external_id_in_use`: this partner already uses `owner.external_user_id` for another person.
- 429 `quota_exceeded`, 403 `entitlement_exceeded`: §6 and §4.

### 8.2 `GET /tenants` — list the partner's businesses

Scope `tenants:read`. Newest first. `?limit=` 1–100 (default 50); `?cursor=` the `next_cursor` of the previous page
(opaque; 400 `invalid_value`, `field` = `cursor` when it does not parse). `next_cursor` is `null` on the last page.
Each item is the `tenant` object of §8.3, without owner, channels or credit.

```json
200
{
  "tenants": [
    { "id": "0b1c6f0e-8d2a-4c3b-9a71-5e2f4d8c1a90", "external_business_id": "biz-778", "name": "Luna Store",
      "status": "active", "reply_language": "en", "market_profile": "intl", "created_at": "2026-10-13T09:12:44.512Z" }
  ],
  "next_cursor": "MjAyNi0xMC0xM1QwOToxMjo0NC41MTJafDBiMWM2ZjBlLThkMmEtNGMzYi05YTcxLTVlMmY0ZDhjMWE5MA"
}
```

### 8.3 `GET /tenants/{ext}` — one business

Scope `tenants:read`. A tenant of another partner is 404 `tenant_not_found`, exactly like an unknown id.

```json
200
{
  "tenant": {
    "id": "0b1c6f0e-8d2a-4c3b-9a71-5e2f4d8c1a90",
    "external_business_id": "biz-778",
    "name": "Luna Store",
    "status": "active",
    "reply_language": "en",
    "market_profile": "intl",
    "created_at": "2026-10-13T09:12:44.512Z"
  },
  "owner": { "user_id": "7f2e1c4b-9a3d-4e8f-b2c6-1d5a7e9f0b38", "external_user_id": "usr-4411", "status": "active" },
  "channels": [ { "channel_id": "3e9b7c21-5a4d-4f86-9c0e-1b2d3f4a5c6e", "kind": "instagram", "status": "connected",
                  "connected_at": "2026-10-13T10:02:11Z" } ],
  "credit": { "state": "ok" }
}
```

| Field | Values |
|---|---|
| `tenant.id` | Bizin's tenant id — opaque, for support tickets; the API addresses tenants by `external_business_id` only |
| `tenant.status` | `active` (tenants have no suspension yet; `suspended` is reserved) |
| `owner` | `null` when the business has no owner; `owner.status` is `pending`, `active` or `disabled`; `external_user_id` is `""` for an owner the partner did not provision |
| `channels[].channel_id` | the channel account's id; the `{channel_id}` of the pairing poll and of `DELETE …/channels/{channel_id}` (§8.9) |
| `channels[].kind` | `instagram`, `whatsapp`, `telegram` |
| `channels[].status` | `disconnected`, `pairing`, `connected`, `banned`, `error` |
| `channels[].connected_at` | set only while `connected` |
| `credit.state` | `ok`, or `exhausted` when the AI credit balance is zero or below — a state, never a balance |

### 8.4 `GET /tenants/{ext}/channels` — channel state

Scope `channels:read`. The tenant's channel accounts in creation order: id, kind, status and, while connected, since
when. No handle, no platform id, no token. Each item is the `channels[]` object of §8.3, plus `health` while channel
health is switched on for the business (flag `v3.channels.health_partner`; off, the key is absent).

```json
200
{ "channels": [
  { "channel_id": "3e9b7c21-5a4d-4f86-9c0e-1b2d3f4a5c6e", "kind": "instagram", "status": "connected",    "connected_at": "2026-10-13T10:02:11Z",
    "health": { "state": "broken", "reason": "ig_subscription_missing", "since": "2026-10-17T08:40:00Z" } },
  { "channel_id": "a1f4c8d2-6b3e-4e7a-9d05-2c8b1e6f4a73", "kind": "whatsapp",  "status": "disconnected", "connected_at": null,
    "health": null }
] }
```

`health` says whether the provider is still delivering to a connected channel: `{state, reason, since}`, or `null`
while the channel is not connected (its status is the signal) or before its first check. `since` is when the state
began.

| `state` | Meaning |
|---|---|
| `ok` | the last check passed, or a message arrived since |
| `quiet` | no message for a long time while the provider's checks pass — shown here, never sent as an event |
| `degraded` | the provider shows trouble that may heal (the socket down for a short while, delivery errors, a token close to expiry) |
| `broken` | the provider's answer proves no message can arrive |
| `unknown` | not checked yet, or the provider could not be reached |

`reason` is a closed token, never the provider's own text: `none`, `idle`, `unusual_silence`, `wa_socket_down`,
`wa_session_missing`, `tg_webhook_empty`, `tg_webhook_foreign`, `tg_delivery_failing`, `tg_updates_incomplete`,
`tg_token_rejected`, `ig_subscription_missing`, `ig_token_rejected`, `ig_token_expiring`, `ig_scope_missing`,
`probe_unreachable`. A move into or out of `degraded` or `broken` sends `channel.health_changed` (§9.2).
`GET /tenants/{ext}` does not carry `health`.

### 8.5 `GET /tenants/{ext}/stats` — daily counts

Scope `stats:read`. `?from=YYYY-MM-DD&to=YYYY-MM-DD`, inclusive UTC days. `to` defaults to today (UTC); `from` defaults
to the 7 days ending at `to`. At most 92 days (400 `stats_range_invalid`, `params.max_days`); a date that does not
parse is 400 `invalid_value` with `field` = `from` or `to`. The range is checked before the tenant is looked up. Every
day of the range is present, zeros included.

```http
GET /partner/v1/tenants/biz-778/stats?from=2026-10-01&to=2026-10-03
```

```json
200
{ "days": [
  { "date": "2026-10-01", "conversations_started": 14, "automated_replies": 41, "handoffs": 3, "orders_created": 2 },
  { "date": "2026-10-02", "conversations_started": 9,  "automated_replies": 27, "handoffs": 1, "orders_created": 0 },
  { "date": "2026-10-03", "conversations_started": 0,  "automated_replies": 0,  "handoffs": 0, "orders_created": 0 }
] }
```

| Count | Counts |
|---|---|
| `conversations_started` | conversations created that day |
| `automated_replies` | messages the assistant sent that day |
| `handoffs` | conversations handed to a human that day |
| `orders_created` | orders created that day (any source) |

### 8.6 `POST /tenants/{ext}/connect-links` — let the seller connect Instagram

Scope `channels:connect`. Issues a single-use link, valid **15 minutes**, to a Bizin-hosted page where the seller
connects the business's Instagram account through Meta. The partner never sees a Meta token.

```http
POST /partner/v1/tenants/biz-778/connect-links
Idempotency-Key: 1f0d7c3e-2b8a-4f6d-a1c9-8e4b5d7f2a60
Content-Type: application/json

{ "channel": "instagram", "return_url": "https://partner.example/onboarding/done", "replace": false }
```

```json
201
{
  "id": "c41a9e27-6b3f-4d58-8e0a-2f7c1b9d6e45",
  "url": "https://www.bizin.app/connect/cl_Zx3…",
  "expires_at": "2026-10-13T10:17:11Z"
}
```

| Field | Rule |
|---|---|
| `channel` | `instagram` only (400 `channel_not_supported`, `params.allowed`) |
| `return_url` | absolute `https` URL, at most 2048 characters, whose exact origin (scheme, host, port) is one of the partner's return origins, which a Bizin operator sets (400 `return_url_not_allowed`) |
| `replace` | optional, default `false`; `true` lets the link replace an Instagram account that is already connected; with `false` and a connected account → 409 `channel_already_connected` |

The flow:

1. The partner sends the seller's browser to `url`. The page shows the business name and one button.
2. The button claims the link (its single use) and starts Meta's OAuth. A link that is used, expired, of a suspended
   partner, or whose channel became connected meanwhile (with `replace: false`) can no longer start: the browser is
   sent back to `url`, which then says why. When Bizin's Instagram app is not configured the page says so before the
   button is pressed, and the link is not spent. While `v3.partner.api` is off, `url` shows "link not found".
3. After Meta, the browser returns to `return_url` with these query parameters added:
   `status=connected|failed`, `channel=instagram`, `link=<id>`, and on failure `reason=<token>` — one of `denied`,
   `state`, `browser`, `exchange`, `scope`, `profile`, `taken`, `config`, `server`. If the partner's return origins no
   longer allow `return_url` at that moment, the seller lands on Bizin's own result page instead.
4. A successful connect also emits `channel.connected` (§9); `GET …/channels` is the source of truth.

`url` is in this answer only (a replay returns `"url": null, "url_redacted_on_replay": true`). Connecting an Instagram
account that is not an app tester needs Meta App Review on Bizin's app.

### 8.7 `POST /tenants/{ext}/owner/activation-link` — the owner's activation link

Scope `users:activate`. For a business whose owner is still `pending`, issues a single-use link valid **72 hours**
where the owner sets a password and becomes `active`. A new call voids the previous unused link. The partner delivers
the link to the owner through its own channel; a fully headless partner never calls this route and the owner simply
stays `pending`.

```http
POST /partner/v1/tenants/biz-778/owner/activation-link
Idempotency-Key: 8c2e5a71-4d9b-4f30-b6e2-7a1d3c9f5b84
```

No body is read.

```json
201
{ "activation_url": "https://www.bizin.app/activate/Q2x…", "expires_at": "2026-10-16T09:20:03Z" }
```

409 `owner_already_active` once the owner has activated; 409 `owner_not_pending` when there is no pending owner to
activate. `activation_url` is in this answer only (a replay returns `"activation_url": null,
"activation_url_redacted_on_replay": true`).

### 8.8 Webhook endpoints — `/webhooks`

Scope `webhooks:manage`. At most **5** endpoints per partner. Every create, update, enable, disable, secret rotation
and delete appears in the activity log of each business attached to the partner (the endpoint id, what happened and
the key id; never the URL or the secret). The endpoint object:

```json
{
  "id": "9a3e6c10-5f2b-4d7a-8c41-0e6b2d9f7a35",
  "url": "https://partner.example/hooks/bizin",
  "event_types": ["channel.connected", "channel.disconnected", "order.created"],
  "status": "active",
  "disabled_reason": null,
  "consecutive_failures": 0,
  "description": "production",
  "created_at": "2026-10-13T09:30:00Z",
  "updated_at": "2026-10-13T09:30:00Z"
}
```

`status` is `active` or `disabled`; `disabled_reason` is `partner` (you disabled it), `gone` (it answered 410),
`failing` (20 dead deliveries in a row) or `operator`.

| Route | Body | Answer |
|---|---|---|
| `GET /webhooks` | — | 200 `{"webhooks": [endpoint, …]}` (oldest first, no paging) |
| `POST /webhooks` | `{"url", "event_types", "description"}` | **201** `{"webhook": endpoint, "secret": "whsec_…"}` |
| `GET /webhooks/{id}` | — | 200 `{"webhook": endpoint}` |
| `PATCH /webhooks/{id}` | any of `url`, `event_types`, `status`, `description` | 200 `{"webhook": endpoint}` |
| `DELETE /webhooks/{id}` | — | **204**, no body |
| `POST /webhooks/{id}/rotate-secret` | — | **200** `{"webhook": endpoint, "secret": "whsec_…", "previous_secret_valid_until": "…"}` |
| `POST /webhooks/{id}/ping` | — | **202** `{"event_id": "<uuid>"}` |
| `GET /webhooks/{id}/deliveries` | `?limit=` 1–100 (default 50), `?cursor=` | 200 `{"deliveries": [delivery, …], "next_cursor": "…" \| null}` |

- `url`: `https`, port 443, a public host name or address, at most 2048 characters, no credentials and no fragment;
  `localhost`, `*.local`, `*.internal`, dot-less names and private addresses are refused (422 `webhook_url_refused`).
  The same rule is enforced again at every delivery after DNS resolution.
- `event_types`: 1–32 entries from §9.2, or `["*"]` for every type. `ping` cannot be subscribed to (422
  `invalid_value`, `field` = `event_types`).
- `description`: at most 200 characters.
- `PATCH` `status`: `"disabled"` stops deliveries (reason `partner`); `"active"` re-enables the endpoint and clears its
  reason and failure count. Events that happen while an endpoint is disabled are not delivered to it later.
- `secret` is shown only in the create and rotate answers (a replay returns `"secret": null,
  "secret_redacted_on_replay": true`). After a rotation the previous secret keeps signing, beside the new one, for 24
  hours (`previous_secret_valid_until`).
- `ping` queues one `ping` event for this endpoint only; 409 `webhook_disabled` on a disabled endpoint. Its delivery
  appears in the deliveries list.
- An `{id}` that is not a uuid, or not the caller's, is 404 `not_found`.

```http
POST /partner/v1/webhooks
Idempotency-Key: 0e9b4c7a-3f21-4d6e-8a5b-c2d1f0e7a913
Content-Type: application/json

{ "url": "https://partner.example/hooks/bizin", "event_types": ["*"], "description": "production" }
```

```json
201
{
  "webhook": { "id": "9a3e6c10-5f2b-4d7a-8c41-0e6b2d9f7a35", "url": "https://partner.example/hooks/bizin",
               "event_types": ["*"], "status": "active", "disabled_reason": null, "consecutive_failures": 0,
               "description": "production", "created_at": "2026-10-13T09:30:00Z", "updated_at": "2026-10-13T09:30:00Z" },
  "secret": "whsec_3qN…"
}
```

A delivery (newest event first):

```json
{
  "event_id": "2f6b8d14-7c3a-4e95-b1d0-9a5e3c7f1b26",
  "event_type": "channel.connected",
  "occurred_at": "2026-10-13T10:02:11Z",
  "state": "delivered",
  "attempts": 2,
  "last_status": 200,
  "last_error": null,
  "last_attempt_at": "2026-10-13T10:02:24Z",
  "delivered_at": "2026-10-13T10:02:24Z"
}
```

`event_id` here is the bare uuid; the webhook body's `id` and `Bizin-Event-Id` are the same uuid with an `evt_`
prefix. `state` is `pending`, `delivered`, `dead` or `cancelled`. `last_error` is a class, never the receiver's body:
`timeout`, `dial_refused`, `tls`, `http_4xx`, `http_5xx`, `gone`.

### 8.9 Channels through the API — WhatsApp pairing, Telegram, disconnect

Scope `channels:connect` on all four routes. They are for a partner that shows the connect step in its own UI; the
Bizin-hosted link of §8.6 stays the way to connect Instagram. Every channel change made here is audited with the key
as the actor.

#### `POST /tenants/{ext}/channels/whatsapp` — start a QR pairing

```http
POST /partner/v1/tenants/biz-778/channels/whatsapp
Idempotency-Key: 5a1e7c93-2d4b-4f68-8b0e-3c9d1f7a2e54
Content-Type: application/json

{ "display_name": "Luna WhatsApp" }
```

The body is optional (an empty body is `{}`); `display_name` is the label sellers see for the channel, stored trimmed.
The answer comes as soon as the pairing session has started, before any QR exists:

```json
201
{ "channel_id": "a1f4c8d2-6b3e-4e7a-9d05-2c8b1e6f4a73", "status": "pending" }
```

- Each call creates a **new** WhatsApp channel account (status `pairing`) and starts its pairing session in the API
  process. A business may hold more than one WhatsApp account.
- One pairing at a time per business: while a pairing of this business is still waiting for its scan, another call —
  with either key — is 409 `whatsapp_pairing_in_progress`. A pairing that has ended (connected, failed, expired) does
  not block, and neither does a row left in `pairing` by an API restart.
- 502 `whatsapp_pairing_failed`: the session could not start; the new channel is left in `error`. 500
  `channel_create_failed`: the channel row could not be written.
- A pairing that ends without a scan leaves its channel account behind; `DELETE` it before starting again.

#### `GET /tenants/{ext}/channels/whatsapp/{channel_id}/pairing` — poll the pairing

```json
200
{ "status": "qr", "qr": "2@Yk7f…,Qm9x…,c2Vj…,MTIz…", "expires_at": "2026-10-13T10:05:31Z" }
```

| `status` | Meaning | Next |
|---|---|---|
| `pending` | the session runs; no QR yet | poll again |
| `qr` | `qr` is current; `expires_at` is when this QR stops working | render `qr` as a QR code for the seller to scan from WhatsApp → Linked devices; keep polling — WhatsApp rotates the QR and a later poll returns a new `qr` |
| `connected` | the phone scanned and the account is connected (`channel.connected` follows, §9) | stop polling |
| `failed` | the pairing ended in an error, or the account is neither connected nor pairing | `DELETE` the channel, start again |
| `expired` | the QR was never scanned in time, or the session is gone (an API restart) while the row still says `pairing` | `DELETE` the channel, start again |

- `qr` is present only in state `qr`. It is the raw pairing payload: encode it as a QR image and show it to the seller
  only — whoever scans it links their phone to the business.
- `expires_at` is `null` in every state but `qr`.
- A stored `connected` wins over whatever the process holds, so the poll keeps answering `connected` after a restart.
- A `{channel_id}` that is not a uuid, not a channel of this business, or not a WhatsApp channel → 404
  `channel_account_not_found`.
- Polling spends the partner's request bucket (§6): one poll every 2 seconds is 30 requests a minute.

#### `POST /tenants/{ext}/channels/telegram` — connect a bot by its token

```http
POST /partner/v1/tenants/biz-778/channels/telegram
Idempotency-Key: 9c4d2b17-8e6a-4a35-b1f0-7d2e5c3a9b86
Content-Type: application/json

{ "bot_token": "7012345678:AAH…", "display_name": "Luna Bot" }
```

| Field | Rule |
|---|---|
| `bot_token` | required; the token from @BotFather: 5–16 digits, `:`, 30–64 of `A–Z a–z 0–9 _ -`, after trimming (422 `telegram_token_invalid`); Telegram must accept it and it must be a bot's (422 `telegram_token_rejected`) |
| `display_name` | optional; default the bot's first name, then its username; at most 100 characters (longer is cut) |

Bizin checks the token with Telegram, stores it sealed, and points the bot's webhook at Bizin (pending updates are
dropped). The account is connected when the answer comes:

```json
201
{ "channel_id": "6d2a9f40-1c7b-4e3d-8a5f-9b0e2c4d7f18", "status": "connected" }
```

- **The token is write-only.** No answer, error, log line or replay carries it (§5).
- 409 `telegram_bot_taken`: the bot already belongs to another business, or is connected in this one. A bot this
  business disconnected in the panel comes back on its old `channel_id`.
- 502 `telegram_failed`: Telegram could not be reached; nothing is kept. 503 `telegram_unavailable`: the
  `v3.channels.telegram` flag is off for the business, or the server cannot connect bots right now.
- `channel.connected` follows (§9).

#### `DELETE /tenants/{ext}/channels/{channel_id}` — disconnect and remove a channel

Any kind: Instagram, WhatsApp or Telegram. The channel is disconnected (a connected one raises `channel.disconnected`),
then deleted: a WhatsApp device is logged out, the stored credential is dropped and the channel account is removed.
It disappears from the channel lists and its `channel_id` is gone.

```http
DELETE /partner/v1/tenants/biz-778/channels/a1f4c8d2-6b3e-4e7a-9d05-2c8b1e6f4a73
Idempotency-Key: 0e8b3d65-7a2c-4f91-9d4e-6c1a5b8f2e37
```

204, no body. An unknown, malformed or other business's `channel_id` → 404 `channel_account_not_found`, so a second
`DELETE` with a **new** key answers 404; with the same key it replays the 204.

### 8.10 Catalog — products by the partner's own id

The partner writes the business's shop catalog by its own product and variant ids. The rows are the panel's own
products and variants, held to the same rules, so the assistant quotes exactly what the partner wrote: prices and stock
reach a customer only from these rows, read when the reply is sent.

#### `PUT /tenants/{ext}/products/{product_ext}` — create or replace a product

Scope `catalog:write`. No `Idempotency-Key` (§5).

```http
PUT /partner/v1/tenants/biz-778/products/tee-classic
Content-Type: application/json

{
  "title": "Classic T-shirt",
  "description": "100% cotton",
  "category": "Clothing",
  "sku": "TS-001",
  "active": true,
  "variants": [
    { "external_id": "tee-classic-m-black", "options": ["M", "Black"], "price": 12500000, "stock": 14 },
    { "external_id": "tee-classic-l-black", "options": ["L", "Black"], "price": 12500000, "stock": 0 },
    { "external_id": "tee-classic-gift",    "title": "Gift wrap",       "price": 13000000 }
  ]
}
```

| Field | Rule |
|---|---|
| `title` | required; 1–200 characters after trimming |
| `description` | optional; at most 4000 characters |
| `category` | optional; canonicalised the way the panel does it |
| `sku` | optional; at most 64 characters; unique among the business's products when not empty (409 `sku_taken`) |
| `active` | **required** boolean: `true` = on sale, `false` = archived (the assistant does not offer it) |
| `variants` | **required**, 1–200 items; an unsized product sends one variant with neither `title` nor `options` |
| `variants[].external_id` | required; 1–128 characters; at most once in the body; unique across all products of the business (409 `variant_external_id_taken`) |
| `variants[].title` | optional; the variant's name, at most 120 characters |
| `variants[].options` | optional; non-empty strings joined with ` / ` into the name (`["M","Black"]` → `M / Black`); not together with `title` (422, `field` = `variants[i].title`) |
| `variants[].price` | **required** integer ≥ 0 in the market's storage unit (below); at most 10^18 |
| `variants[].stock` | optional integer 0–100,000,000, or `null` |

**Money.** `price` is an integer in the business's market storage unit; the answer's `currency` and `price_exponent`
say which. Market `ir`: `IRR`, exponent 0 — whole **Rial** (the panel shows Toman = Rial ÷ 10, so 12,500,000 Rial is
1,250,000 Toman). Markets `ae` (`AED`) and `intl` (`USD`): exponent 2, so `1999` is 19.99.

**Variants.** The body's variant list is the whole truth for the product:

- a variant whose `external_id` is new is created; one that exists is updated and **reactivated**;
- a stored variant missing from the body — including one the seller added in the panel — is **deactivated**
  (`active: false`), never deleted: order lines and the stock ledger still point at it. Sending its `external_id` again
  brings it back.

**Stock.** A number sets the variant's counted stock to exactly that level (a stocktake noted `partner sync`) and turns
counting on; `null` or no `stock` turns counting off — the variant is never out of stock. The level is set on every
`PUT` that carries it, so a `PUT` built before a sale overwrites that sale's decrement: send the current level. A read
returns the live level (orders move it), or `null` while not counted.

Search aliases and images are the seller's own fields: not in this shape, and a `PUT` leaves them as they are.

```json
201
{
  "id": "4c8e1a27-9b3d-4f60-a5e2-1d7c9f3b8e04",
  "external_id": "tee-classic",
  "title": "Classic T-shirt",
  "description": "100% cotton",
  "category": "Clothing",
  "sku": "TS-001",
  "active": true,
  "currency": "IRR",
  "price_exponent": 0,
  "variants": [
    { "id": "e2b7…", "external_id": "tee-classic-m-black", "title": "M / Black", "price": 12500000, "stock": 14,   "active": true },
    { "id": "f81c…", "external_id": "tee-classic-l-black", "title": "L / Black", "price": 12500000, "stock": 0,    "active": true },
    { "id": "0a9d…", "external_id": "tee-classic-gift",    "title": "Gift wrap", "price": 13000000, "stock": null, "active": true }
  ],
  "created_at": "2026-10-13T11:20:05Z",
  "updated_at": "2026-10-13T11:20:05Z",
  "created": true
}
```

201 with `"created": true` for a new product, 200 with `"created": false` for a replaced one. The whole write is one
transaction. 422 `invalid_value`: a rule above, with `field` for `active`, `variants`, `variants[i].price`,
`variants[i].title` and `variants[i].options`; the other rules answer with the rule in `message` and no `field`.

#### `GET /tenants/{ext}/products/{product_ext}` — one product

Scope `catalog:read`. The product object above, without `created`; `variants` includes deactivated ones. 404
`product_not_found` for an id this business does not have.

#### `GET /tenants/{ext}/products` — every product

Scope `catalog:read`. `?limit=` 1–100 (default 50), `?cursor=` as in §8.2; newest first. **Every** product of the
business: archived ones, and panel-made ones with `"external_id": null`.

```json
200
{ "products": [ { "id": "4c8e1a27-…", "external_id": "tee-classic", "…": "…" } ], "next_cursor": null }
```

#### `DELETE /tenants/{ext}/products/{product_ext}` — archive

Scope `catalog:write`; `Idempotency-Key` required. Archives the product — the same as a `PUT` with `"active": false`;
its variants are untouched and it stays readable. A later `PUT` with `"active": true` brings it back. 204, no body,
also on a product that is already archived. 404 `product_not_found` for an unknown id.

### 8.11 Payment details — the card-to-card destination

The card number / IBAN the assistant gives a customer to pay into: the same record the seller edits in the panel. The
panel's owner-only rule and step-up do not apply here; the key's scope is the authority. Every change is audited with
the key as the actor.

#### `PUT /tenants/{ext}/payment-details` — set them

Scope `payments:write`. No `Idempotency-Key` (§5). The body replaces the destination: a field left out is cleared.

```http
PUT /partner/v1/tenants/biz-778/payment-details
Content-Type: application/json

{ "card_number": "6037-9912-3456-7893", "iban": "IR820540102680020817909002", "holder_name": "Sara Ahmadi", "bank_name": "Melli" }
```

| Field | Rule |
|---|---|
| `card_number` | 16 digits passing the Luhn check (422 `card_number_invalid`); spaces, hyphens, dots and ZWNJ are dropped; Persian and Arabic-Indic digits are read as digits |
| `iban` | `IR` + 24 digits, any case, the same separators allowed, valid IBAN checksum (422 `iban_invalid`) |
| — | at least one of `card_number` and `iban` (422 `payment_destination_required`, `field` = `card_number`) |
| `holder_name` | **required**; at most 60 characters; folded to one line (422 `invalid_value`, `field` = `holder_name`) |
| `bank_name` | optional; at most 60 characters; folded to one line (422 `invalid_value`, `field` = `bank_name`) |

The fields are checked in that order and the first failure answers; the body is checked before the business is looked
up. The seller's own note under the number (a panel field) is kept as it is.

```json
200
{ "configured": true, "card_number_last4": "7893", "iban_last4": "9002", "holder_name": "Sara Ahmadi", "bank_name": "Melli" }
```

#### `GET /tenants/{ext}/payment-details` — read them, masked

Scope `payments:read`. The same masked shape. **No answer ever carries a whole card number or IBAN**, so nothing needs
redacting on a replay either. With nothing set: `"configured": false`, both `…_last4` `null`, both names `""`.

### 8.12 Assistant — on/off, reply language, business description

The same settings and the same write as the panel's AI settings page.

#### `GET /tenants/{ext}/assistant`

Scope `assistant:read`.

```json
200
{
  "enabled": true,
  "auto_reply": true,
  "reply_language": "fa",
  "persona_name": "Luna",
  "business_profile": "We sell cotton T-shirts. Orders ship from Tehran in 2 working days.",
  "updated_at": "2026-10-13T11:41:09Z"
}
```

#### `PUT /tenants/{ext}/assistant`

Scope `assistant:write`. No `Idempotency-Key` (§5).

| Field | Rule |
|---|---|
| `enabled` | **required** boolean; the master switch (off for a new business) |
| `auto_reply` | **required** boolean; lets the assistant send without a human's approval (off for a new business) |
| `reply_language` | **required**; one of `en`, `ar`, `fa` (case and surrounding space ignored; `params.allowed` lists them). The language the assistant answers in when the customer's own language is not one of them; the same value as `tenant.reply_language` of §8.3 |
| `persona_name` | optional; at most 80 characters; the name customers see; left out = unchanged |
| `business_profile` | optional; at most 4000 characters; what the shop sells, hours, policies; left out = unchanged, `""` clears it |

**The assistant answers customers only while `enabled` and `auto_reply` are both `true`** (and the conversation's own
AI switch is on, which a seller changes in the panel). The answer is the stored settings, as `GET` returns them; a body
that changes nothing writes nothing and returns the current settings. A missing switch is 422 `invalid_value` with
`field` = `enabled` / `auto_reply`; a missing or unknown language is 422 `invalid_value`, `field` = `reply_language`,
with `params.allowed`; a text over its length is 422 `invalid_value` without `field`. The body is checked before the
business is looked up.

### 8.13 Orders

The `order.created` webhook (§9.2) carries ids and states only; these routes are where the partner reads the order.

#### `GET /tenants/{ext}/orders/{order_id}` — one order

Scope `orders:read`. `{order_id}` is the webhook's `data.order_id`. Not a uuid, or not an order of this business → 404
`order_not_found`.

```json
200
{
  "id": "9b3f6e12-4d8a-4c71-a0e5-2f7b1c9d3e68",
  "code": "1043",
  "status": "draft",
  "source": "ai",
  "created_at": "2026-10-13T12:03:44Z",
  "updated_at": "2026-10-13T12:03:44Z",
  "items": [
    { "title": "Classic T-shirt", "variant_name": "M / Black", "quantity": 2, "unit_price": 12500000, "line_total": 25000000 }
  ],
  "totals": { "subtotal": 25000000, "shipping": 500000, "total": 25500000, "currency": "IRR", "minor_unit": 0 },
  "customer": { "name": "Reza", "phone": "09121234567", "channel": "whatsapp", "conversation_id": "c7e2a9f4-…" },
  "payment": { "method": "card_to_card", "status": "unpaid", "receipt_received": false, "pending_evidence": 0, "paid_at": null },
  "confirmed_at": null, "paid_at": null, "packing_at": null, "shipped_at": null, "cancelled_at": null
}
```

| Field | Meaning |
|---|---|
| `code` | the order number the seller and the customer see |
| `status` | `draft`, `confirmed`, `paid` (payment verified, waiting to be packed), `packing`, `shipped`, `delivered`, `cancelled`; extensible (§7) |
| `source` | `dashboard`, `ai` or `api` |
| `items[]` | in the order they were added; `title` and `variant_name` as they were at order time; `variant_name` is left out when the line has none; prices in the storage unit |
| `totals` | `subtotal`, `discount`, `shipping`, `total`; `discount` and `shipping` are left out when zero. `shipping_basis` says how shipping was decided (`manual` the seller's own fee, `flat` the default fee, `province`, `city`, `free` the free-over threshold, `unresolved` a draft no rule prices yet; extensible, §7) and `shipping_zone` names the province or city whose rate applied; both are left out when the shop's rules (§8.17) were off at the order's last pricing. `currency` and `minor_unit` (the decimal digits of the unit: 0 for IRR, whole Rial) are the market's, as `price_exponent` is on a product |
| `customer.name`, `customer.phone` | what the customer gave for this order's shipping address, else the customer record; each left out when unknown |
| `customer.channel` | the customer's channel kind (`instagram`, `whatsapp`, `telegram`) or `null` |
| `customer.conversation_id` | the conversation the order came from, or `null` |
| `payment.method` | `card_to_card` |
| `payment.status` | `orders.payment_status`: `unpaid`, `pending_verification` (a receipt waits for a decision), `rejected` (the last receipt was refused and none is pending), `paid`; extensible (§7) |
| `payment.receipt_received` | `true` once at least one payment receipt is attached to the order; the receipts are at §8.16 |
| `payment.pending_evidence` | how many receipts wait for a decision |
| `payment.paid_at`, `paid_at` | when the payment was verified, or `null` |
| `confirmed_at`, `packing_at`, `shipped_at`, `cancelled_at` | when the order entered that status, or `null` |

Never in the answer: the shipping address, the order's internal note, the customer's handle or platform id.

**`status` and `payment.status` agree.** Since migration 0173 two database CHECKs tie them: an order in `paid`,
`packing`, `shipped` or `delivered` always has `payment.status` `paid`, and a `paid` payment belongs to one of those
statuses or to `cancelled` (a paid order that was cancelled keeps its payment); a `draft` or `confirmed` order is never
`paid`. The order enters `paid` only through a payment decision (§8.16), which
writes both at once; `cancelled` closes the pending receipts and turns `pending_verification` back to `unpaid`. The
whole state machine is in `docs/backend/orders.md`.

#### `GET /tenants/{ext}/orders` — list

Scope `orders:read`. Newest first (`created_at`, then id). The query is checked before the business is looked up:

| Parameter | Rule |
|---|---|
| `limit` | 1–100, default 50 (400 `limit_invalid`, `params.max`) |
| `status` | one of the order statuses (400 `invalid_value`, `field` = `status`, `params.allowed`) |
| `payment_status` | one of the payment statuses (400 `invalid_value`, `field` = `payment_status`, `params.allowed`); `pending_verification` is the verification queue |
| `since` | RFC 3339 time; only orders created at or after it (400 `invalid_value`, `field` = `since`) |
| `cursor` | the previous page's `next_cursor` (400 `invalid_value`, `field` = `cursor`); send the same `status`, `payment_status` and `since` with it |

```json
200
{ "orders": [ { "id": "9b3f6e12-…", "code": "1043", "…": "…" } ], "next_cursor": null }
```

**With the webhook.** On `order.created`, read `GET …/orders/{data.order_id}`. Deliveries can come late, out of order
or twice (§9.3), so: de-duplicate by order id; after an outage, catch up with
`GET …/orders?since=<the newest created_at you hold>` and follow `next_cursor` (`since` is inclusive). A later status
change arrives as `order.status_changed` and a new receipt as `payment.evidence_received` (§9.2); a `payment_status`
change alone emits nothing, so re-read an order to see its current status and payment.

### 8.14 Returns and complaints — cases and the return policy

A customer who asks to return, exchange or refund an order, complains or reports a delivery problem goes through a
fixed conversation; the assistant then opens a **case** and hands the conversation off (`handoff.raised`). The partner
is the shop: it reads the case and records the shop's decision here. The assistant never decides, never says a request
is accepted or eligible, and Bizin moves no money: a refund is the seller's own card-to-card transfer, which the shop
records. A case never changes its order.

While returns are switched off for the business (`v3.returns.cases`), every route of this section answers 404
`not_found`, reads included.

#### `GET /tenants/{ext}/cases/{case_id}` — one case

Scope `cases:read`. `{case_id}` is the webhook's `data.case_id`. Not a uuid, or not a case of this business → 404
`case_not_found`.

```json
200
{
  "id": "6f1c2a8b-…", "code": "R12", "kind": "return", "state": "open",
  "order": { "id": "9b3f6e12-…", "code": "1043" }, "order_unresolved": false, "days_since_ship": 4,
  "customer": { "name": "Reza", "phone": "09121234567", "channel": "whatsapp", "conversation_id": "c7e2a9f4-…" },
  "reject_reason": null, "refund": null, "photo_count": 1,
  "created_at": "2026-10-14T09:12:00Z", "updated_at": "2026-10-14T09:15:30Z",
  "customer_text": "The shoes are one size too small.", "note": "",
  "photos": [ { "id": "3a4b5c6d-…", "content_type": "image/jpeg", "bytes": 182311, "created_at": "2026-10-14T09:15:30Z" } ],
  "events": [ { "seq": 1, "action": "opened", "actor": "assistant", "from_state": null, "to_state": "open", "notice": null, "occurred_at": "…" } ]
}
```

| Field | Meaning |
|---|---|
| `code` | the case code the customer was given (`R` and a number, per business) |
| `kind` | `return`, `exchange`, `refund`, `complaint`, `issue` (a delivery problem) — the customer's own choice |
| `state` | `open`, `awaiting_customer`, `accepted`, `rejected`, `refunded`, `exchanged`, `closed`; the last four are final |
| `order` | the customer's own order the case is about, or `null` with `order_unresolved: true` when the customer gave no code, or one that is not an order of theirs in this conversation |
| `days_since_ship` | days from shipping (else payment, else confirmation) to the case opening; `null` without an order. Bizin never judges eligibility; this is for the shop |
| `customer` | the customer record's name and phone (`null` when unknown), channel kind and conversation |
| `customer_text` | what the customer wrote about the request, as written (at most 2000 characters) |
| `note` | the shop's own note from the actions route; never sent to the customer |
| `reject_reason` | set in state `rejected` |
| `refund` | set in state `refunded`: `{"amount", "currency", "minor_unit", "reference"}`, each as the shop recorded it (`amount` and `reference` may be `null`) |
| `photos[]` | at most 5, oldest first; `id` is the `{photo_id}` of the download below, never a media id; `content_type` and `bytes` are `null` once the picture is gone |
| `events[]` | every event in order: `opened`, `photo_added`, `customer_replied`, and the shop's decisions; `actor` is `customer`, `assistant`, `partner`, `seller` or `system`; `notice` is the customer message's outcome (`sent`, `window_closed`, `blocked`, `failed`), `null` when none was asked for or it is still pending |

#### `GET /tenants/{ext}/cases` — list

Scope `cases:read`. Newest first (`created_at`, then id). The query is checked before the business is looked up:
`limit` (1–100, default 50), `state`, `kind` (400 `invalid_value`, `params.allowed`), `order_id` (a uuid), `cursor`
(as in §8.13; send the same filters with it). Each entry is the case above without `customer_text`, `note`, `photos`
and `events`:

```json
200
{ "cases": [ { "id": "6f1c2a8b-…", "code": "R12", "…": "…" } ], "next_cursor": null }
```

#### `GET /tenants/{ext}/cases/{case_id}/photos/{photo_id}` — one photo's bytes

Scope `cases:read`. Only a photo listed in that case's `photos` is reachable, by that id; any other id (another
case's photo, a payment receipt, a catalog image, a media id) → 404 `photo_not_found`. Every answer, refusals
included, carries `Content-Security-Policy: sandbox; default-src 'none'`, `X-Frame-Options: DENY`,
`Cross-Origin-Resource-Policy: same-origin` and `X-Content-Type-Options: nosniff`; the photo itself is served with
`Cache-Control: private, no-store`, inline under its stored image type (anything else is an attachment typed
`application/octet-stream`), and answers range requests. Fetch it from your backend and serve it to your sellers
yourself; there is no public URL. 503 `media_unavailable` / `media_store_unavailable` (`Retry-After: 5`) when the
store cannot be read.

#### `POST /tenants/{ext}/cases/{case_id}/actions` — record the shop's decision

Scope `cases:write`. `Idempotency-Key` required; a replay answers the stored case and records nothing twice. Audited
(`partner.case_action`) with the key as actor. The body is checked before the business is looked up.

```json
{ "action": "mark_refunded", "expected_state": "accepted",
  "refund": { "amount": 12000000, "reference": "123456789012" }, "note": "Paid back by card.", "notify_customer": true }
```

| Field | Rule |
|---|---|
| `action` | `request_info`, `accept`, `reject`, `mark_refunded`, `mark_exchanged`, `close` |
| `expected_state` | required: the state you saw. A case that moved since → 409 `case_state_conflict` |
| `reject_reason` | required for `reject`, refused otherwise: `outside_window`, `condition_not_met`, `item_not_returnable`, `order_not_found`, `other` |
| `refund` | `mark_refunded` only, refused otherwise; `amount` (integer, storage unit, ≥ 0, at most the linked order's total → 422 `refund_exceeds_total`) and `reference` (at most 64 characters) are both optional |
| `note` | optional, at most 1000 characters; kept as the case's `note` when not blank; never sent to the customer |
| `notify_customer` | default `true`: the customer gets the fixed message for the action (the case code is its only detail; a refund message carries no amount). `false` sends nothing |

The moves: `open` → `awaiting_customer` (`request_info`; the customer's next message moves it back to `open`);
`open` or `awaiting_customer` → `accepted` or `rejected`; `accepted` → `refunded` (`mark_refunded`) or `exchanged`
(`mark_exchanged`); any open state → `closed`. Any other pair → 409 `case_state_conflict`; a case in a final state →
409 `case_closed`. A shape error → 422 `invalid_action` with `field`. 200 answers the case as `GET` reads it.

#### `GET` / `PUT /tenants/{ext}/return-policy` — the return policy

Scopes `assistant:read` / `assistant:write`. The policy is the only return terms the assistant ever shows a customer:
it quotes `conditions` exactly as written, adds one sentence with `window_days` when that is set, and states no
return terms at all without a policy or with `enabled: false`.

```json
PUT { "enabled": true, "window_days": 7, "conditions": "کالا باید پلمپ و با فاکتور باشد." }
200 { "enabled": true, "window_days": 7, "conditions": "کالا باید پلمپ و با فاکتور باشد.", "updated_at": "…" }
```

`GET` without a policy → 404 `return_policy_not_set`. `PUT` replaces the whole policy, takes no `Idempotency-Key`
(one sent is ignored, §5: the same body twice leaves the same policy) and is audited (`partner.return_policy_updated`, the names of the changed fields, never their values). `enabled`
defaults to `true`; `window_days` is 0–365 or `null`/omitted (422 `invalid_value`, `field` = `window_days`);
`conditions` is trimmed, at most 1500 characters (422 `invalid_value`, `field` = `conditions`); an enabled policy
needs `window_days`, `conditions` or both (422 `return_policy_empty`).

**With the webhooks.** On `case.opened`, read `GET …/cases/{data.case_id}`; `case.updated` tells you something
happened (a photo, the customer's reply, a decision) — re-read the case for the details.

### 8.15 Inbox — conversations and messages

The partner's sellers answer handed-off customers from the partner's own UI. These routes are the conversation list,
the thread, and a human reply, claim and release; the webhooks carry ids only and point here. The routes answer whatever the business's assistant setting is
(a shop with the assistant off still needs an inbox). While `v3.partner.inbox` is off, every route of this section
answers 404 `not_found`, as an unmapped path does.

A thread's `state` has one definition, shared with the webhooks: `human` when a person holds it (the assistant is off
for the thread), else `handoff` when it is waiting for a person, else `ai`.

**Read by id after a webhook.** The inbox webhooks (§9.2) name ids only: on `message.received` or `message.sent` read
`GET …/conversations/{data.conversation_id}/messages/{data.message_id}`; on `handoff.raised` or `handoff.released` read
`GET …/conversations/{data.conversation_id}`. Use the list and the `after` cursor only to catch up after an outage.

#### `GET /tenants/{ext}/conversations/{conversation_id}` — one conversation

Scope `inbox:read`. `{conversation_id}` is a webhook's `data.conversation_id`. Not a uuid, or not a conversation of this
business → 404 `conversation_not_found`.

```json
200
{
  "id": "c7e2a9f4-…", "channel_kind": "instagram", "status": "open", "state": "handoff",
  "handoff": { "reason": "customer_request", "raised_at": "2026-10-14T09:12:03Z" },
  "held_since": null,
  "customer": { "id": "5d1e…", "display_name": "Reza", "phone": null },
  "last_message": { "id": "…", "conversation_id": "c7e2a9f4-…", "direction": "in", "sender": "customer", "kind": "text",
                    "text": "سلام، هنوز موجوده؟", "status": "received", "created_at": "2026-10-14T09:12:00Z", "media": null },
  "last_message_at": "2026-10-14T09:12:00Z",
  "last_customer_message_at": "2026-10-14T09:12:00Z",
  "reply_window_closes_at": "2026-10-15T09:12:00Z"
}
```

| Field | Meaning |
|---|---|
| `channel_kind` | `whatsapp`, `instagram` or `telegram` |
| `status` | `open`, `snoozed` or `closed` (the panel's inbox status) |
| `state` | `ai`, `handoff` or `human`, as above |
| `handoff` | set only in state `handoff`: the reason token and when it was raised (either may be `null`) |
| `held_since` | set only in state `human`: when the assistant was switched off for the thread (may be `null`) |
| `customer` | Bizin's customer id, the display name and the phone, each `null` when unknown |
| `last_message` | the newest message (a message object, below), or `null`; reactions and unsends are not shown here |
| `last_customer_message_at` | the newest message the customer sent, or `null` |
| `reply_window_closes_at` | Instagram only: `last_customer_message_at` + 24 h, after which Instagram refuses a free-form reply; `null` elsewhere |

While `v3.handoff.queues` is on, the object also carries the handoff's queue. Each of these keys is **absent** (not
`null`) when it has no value, and all of them are absent while the flag is off:

```json
{
  "handoff": { "reason": "receipt_received", "raised_at": "2026-10-17T09:12:03Z",
               "reason_class": "PAYMENT_VERIFICATION", "priority": "high" },
  "queue": "accounting",
  "intent": { "code": "payment.receipt.submit", "parent": "payment.receipt", "at": "2026-10-17T09:12:01Z" },
  "related_order": { "id": "…", "code": "B-1042", "status": "confirmed", "payment_status": "pending_verification" }
}
```

| Field | Meaning |
|---|---|
| `handoff.reason_class` | why a person is needed, as a class of the reason: `PAYMENT_VERIFICATION`, `POLICY_REQUIRED`, `CLARIFICATION_EXHAUSTED`, `INTEGRATION_FAILURE`, `EXPLICIT_HUMAN_REQUEST`, `HIGH_RISK_LOW_CONFIDENCE`, `SYSTEM_FAILURE` or `NONE` |
| `handoff.priority` | `low`, `normal`, `high` or `urgent`, set by the reason when it is raised |
| `queue` | `sales`, `support`, `accounting`, `appointment` or `fulfillment`: where the last raise routed the thread, or where a move put it. It stays after the handoff ends; a thread never handed off has none |
| `intent` | the assistant's last classified intent, codes only (`parent` and `at` may be `null`) |
| `related_order` | the newest order written on this thread (id, code, status, payment status); read it in full with `GET …/orders/{order_id}` |

Every value list here is extensible: accept a value you do not know.

Never in the answer: the customer's platform id (WhatsApp JID, Instagram IGSID, Telegram chat id) or handle, the
handoff's internal data, the assignee, provider message ids.

#### `GET /tenants/{ext}/conversations` — list

Scope `inbox:read`. Newest activity first (`last_message_at`, then id). The query is checked before the business is
looked up:

| Parameter | Rule |
|---|---|
| `limit` | 1–100, default 50 (400 `limit_invalid`, `params.max`) |
| `state` | `ai`, `handoff` or `human`; repeatable (`state=handoff&state=human`); default all (400 `invalid_value`, `field` = `state`, `params.allowed`) |
| `channel` | `whatsapp`, `instagram` or `telegram` (400 `invalid_value`, `field` = `channel`, `params.allowed`) |
| `since` | RFC 3339 time; only conversations whose `last_message_at` is at or after it (400 `invalid_value`, `field` = `since`) |
| `cursor` | the previous page's `next_cursor` (400 `invalid_value`, `field` = `cursor`); send the same filters with it |

The filters below need the `v3.inbox.filters` flag. While it is off, each of them, even with an empty value, is 400
`filter_unavailable` (`field` = the parameter); the list never ignores one. Repeated values of one parameter match any
of them; different parameters must all match. A bad value is 400 `invalid_value` on its `field`, with `params.allowed`
where the set is closed. When the filters change, start again without a cursor.

| Parameter | Rule |
|---|---|
| `until` | RFC 3339 time; only conversations whose `last_message_at` is before it (exclusive) |
| `status` | `open`, `snoozed` or `closed`; repeatable |
| `queue` | `sales`, `support`, `accounting`, `appointment` or `fulfillment`; repeatable. The queue stays after the handoff ends, so combine it with `state` for the open handoffs of a queue |
| `priority` | `low`, `normal`, `high` or `urgent`; repeatable |
| `reason` | a handoff reason token (`[a-z0-9_]`, 1–64 characters); repeatable; matches the current handoff only (no `params.allowed`: new tokens appear over time) |
| `reason_class` | `EXPLICIT_HUMAN_REQUEST`, `POLICY_REQUIRED`, `PAYMENT_VERIFICATION`, `CLARIFICATION_EXHAUSTED`, `HIGH_RISK_LOW_CONFIDENCE`, `INTEGRATION_FAILURE`, `SYSTEM_FAILURE` or `NONE`; repeatable |
| `intent` | an intent code (`commerce.purchase.ask_price`) or a parent intent (`commerce.purchase`); repeatable; matches the conversation's latest classified intent or its parent, which is what the customer is talking about now, not what the handoff was raised for |
| `q` | 2–64 characters after trimming; matches the customer's display name (Arabic and Persian letters alike) or phone (Persian and Arabic digits are read as Latin). It never matches a platform id (WhatsApp JID, Instagram id, Telegram chat id) or message text |
| `order_id` | uuid of an order of this business; the conversation the order was written on. Another business's order gives an empty list |
| `has_order` | `true` or `false`: whether an order of this business was written on the conversation |

```json
200
{ "conversations": [ { "id": "c7e2a9f4-…", "state": "handoff", "…": "…" } ], "next_cursor": null }
```

React to the webhooks rather than polling; do not poll the list faster than once per 10 seconds per business.

#### `GET /tenants/{ext}/conversations/{conversation_id}/messages` — the thread

Scope `inbox:read`. Without a cursor: the newest page. Each page is oldest → newest.

| Parameter | Rule |
|---|---|
| `limit` | 1–100, default 50 (400 `limit_invalid`, `params.max`) |
| `before` | a `next_before`: the page of older messages (400 `invalid_value`, `field` = `before`) |
| `after` | a `next_after`: the messages after it, oldest first (400 `invalid_value`, `field` = `after`); not together with `before` |

```json
200
{
  "messages": [
    { "id": "…", "conversation_id": "…", "direction": "in", "sender": "customer", "kind": "image", "text": "",
      "status": "received", "created_at": "…",
      "media": { "id": "9a0f…", "mime": "image/jpeg", "size": 183224, "path": "/partner/v1/tenants/biz-778/media/9a0f…" } }
  ],
  "next_before": "…",
  "next_after": "…"
}
```

- `next_before` is set while older messages exist; it is `null` on an `after` page.
- `next_after` is the newest message of the page (on an empty `after` page, the cursor you sent), so you can resume a
  catch-up later; it is `null` on a `before` page. A page shorter than `limit` means you are caught up.
- `sender` is `customer`, `human` (the seller, from the panel, the phone or this API) or `ai`; `kind` is `text`,
  `image`, `video`, `audio`, `document`, `sticker` or `other`; `text` is the body or the caption.
- `media` is `null` without a stored attachment. `path` is a partner route, not a link: it answers only with the
  partner key in `Authorization` and the `inbox:media` scope (below). No media link is ever signed or public, and the
  partner key must never reach a browser — fetch media through your own backend.
- Order is by the provider's timestamp, not by arrival, so a late message can land behind an `after` cursor. **After a
  webhook, read the one message by id**; use `after` only to catch up after an outage, and de-duplicate by message id.

#### `GET /tenants/{ext}/conversations/{conversation_id}/messages/{message_id}` — one message

Scope `inbox:read`. The message object above. Not a uuid, or not a message of that conversation → 404
`message_not_found`; an unknown conversation is 404 `conversation_not_found` first.

#### `POST /tenants/{ext}/conversations/{conversation_id}/reply` — a human reply

Scope `inbox:write`, `Idempotency-Key` required. Body `{"text": "…", "agent_ref": "seat-12"}`, or an image:
`{"media_id": "…", "caption": "…", "agent_ref": "seat-12"}` with a `media_id` from `POST …/media` below and an
optional caption of at most 1024 characters (`text` and `media_id` together, or a caption without `media_id`, is 422
`invalid_value`). `agent_ref` is optional, at most 64 printable ASCII characters, and lands only in the audit row. An
image goes out as one photo on WhatsApp and Telegram and is stored as a message of kind `image` with its `media`;
Instagram answers 409 `image_not_supported_on_channel` and sends nothing, because Instagram fetches a photo from a
public link and Bizin publishes no link to an uploaded file.

**Contract clause: the reply route is for text a person typed.** It is the panel's own human-send path: the row is
stored as sender `human`, it is not checked against the catalog the way the assistant's replies are, and it keeps the
assistant quiet for the business's takeover window. A partner that sends generated text through it breaks its
contract. There is no cold outreach: the conversation must exist and hold at least one customer message, otherwise
409 `no_customer_message` and nothing is sent; no partner route creates a conversation. The panel's assignee rule does
not apply — the key's scope is the authority.

| Answer | When |
|---|---|
| 201 — the stored message (shape above) | sent and stored |
| 202 `{"status": "sent_not_saved"}` | the customer has the message, Bizin could not store it — **do not resend** |
| 400 `text_required` / `text_too_long` (`params.max`) | empty; over the channel cap (Instagram 1000, others 4096; a caption 1024) |
| 404 `conversation_not_found` | unknown, or another business's — the same answer |
| 404 `media_not_found` | `media_id` not a uuid, unknown, or another business's — the same answer |
| 409 `image_not_supported_on_channel` | an image on Instagram |
| 415 `image_type_unsupported` | the media is not a JPEG or PNG image |
| 409 `no_customer_message` | the customer never wrote in this thread |
| 409 `channel_not_connected` | the channel account is gone or not connected |
| 409 `window_closed` (`params.last_customer_message_at`, `params.closed_at` when known) | the channel's reply window has closed (Instagram, 24 h after the customer's last message; no tag, no override), for text and images alike |
| 409 `recipient_refused` | Telegram: the customer blocked the bot |
| 409 `send_paused` (`paused_until`, `pause_reason`) | WhatsApp: the account is paused after the platform pushed back |
| 409 `conversation_busy` | the business's flow work holds the thread for a moment; retry |
| 422 `invalid_value` (field `agent_ref`, `text` or `caption`) | `agent_ref` too long or not printable ASCII; `text` with `media_id`; `caption` without it |
| 422 `image_undecodable` | the image could not be prepared for the channel |
| 429 `send_rate_limited` + `Retry-After` (`retry_after_seconds`) | the channel's budget or the platform's own limit — not the API's `rate_limited` |
| 502 `send_failed` | anything else; nothing reached the customer |

A reply that reached the customer always answers 2xx, so it is kept under its `Idempotency-Key` and a retry replays it
(`Idempotent-Replayed: true`) instead of sending twice; a 5xx frees the key. The channel's send gate (its budget,
the gap between two sends to one chat, human pacing) can hold the request for up to 20 s: use a client timeout of at least 30 s (the server's own request timeout), and on a timeout retry with
the same key. Audited as
`partner.inbox_reply_sent` (`conversation_id`, `message_id` or `outcome: sent_not_saved`, `media_id` for an image,
`agent_ref`, `key_id`); neither the text nor the caption is in any audit row or log line.

#### `POST /tenants/{ext}/media` — an image for a reply

Scope `inbox:write`, `Idempotency-Key` required. `multipart/form-data` with one file field `file`: a JPEG or PNG within
the image cap (8 MiB by default). The type is read from the bytes — the part's `Content-Type` counts only when the
bytes say nothing — and both the type and the size are checked before anything is stored: a refused upload stores
nothing. 201 `{"id": "…", "mime": "image/png", "size": 183224}`; send the `id` as the reply's `media_id`. The file
belongs to this business only and is served by the media download below once a message carries it. Storage is by
content: the same bytes for the same business are the same id, so a retry is safe — a multipart body is not kept
for replay, so a retry under the same key runs again and answers the same id. Refusals: 415 `image_type_unsupported`,
413 `file_too_large` (`params.max_mb`), 400 `bad_multipart` / `file_field_missing` / `image_empty`, 503
`media_unavailable` / `media_store_unavailable` (`Retry-After: 5`). Each upload is audited as `partner.media_uploaded`
(`mime`, `size`, `key_id`; target the media id). 404 `not_found` while the inbox is off.

#### `POST /tenants/{ext}/conversations/{conversation_id}/claim` — take the thread

Scope `inbox:write`, `Idempotency-Key` required, empty body. State becomes `human` and any handoff flag is cleared; the
assistant stops answering the thread. A claim on a held thread changes nothing and keeps `held_since`; a claim never
expires, like the panel's «خودم پاسخ می‌دهم» button. Nothing is sent to the customer. 200 with the conversation
object. Audited as `partner.conversation_claimed` (`from`: the state before, `key_id`).

#### `POST /tenants/{ext}/conversations/{conversation_id}/release` — give it back to the assistant

Scope `inbox:write`, `Idempotency-Key` required, empty body. The thread follows the business's assistant setting
again, the handoff flag is cleared and the takeover window ends; the assistant speaks only on the customer's next
message. **A release never lifts a customer's "stop":** a customer who opted out answers 409 `customer_opted_out` and
nothing changes; only the business lifts that, in its panel. 200 with the conversation object plus
`"assistant_active": bool` — whether the business's assistant answers at all (enabled with auto-reply), so the UI can
say "released, but your assistant is off". Audited as `partner.conversation_released` (`from`, `key_id`).

#### `POST /tenants/{ext}/conversations/{conversation_id}/queue` — move a handoff to another queue

Scope `inbox:write`, `Idempotency-Key` required, flag `v3.handoff.queues` (404 `not_found` while it or the inbox is
off). Body `{"queue": "accounting"}`, one of the five queues above. Bizin routes every handoff when it is raised; this
moves a thread in state `handoff` or `human` by hand. It changes nothing else: the state, the handoff and the takeover
stay as they are, nothing is sent to the customer and no webhook is emitted. **A raise overrides a move:** the next
raise with a new reason, or the next raise after the handoff ended, routes the thread again (with its own
`handoff.raised`); a raise with the same reason while the thread is still waiting keeps the move. 200 with the
conversation object. A move to the queue already set answers 200 and writes nothing. Refusals: 422 `invalid_value`
(`field: "queue"`, `params.allowed`; checked before the business is looked up), 409 `conversation_not_handed_off` (state `ai`: there is nothing to route), 404
`conversation_not_found` (not a uuid, or not this business's), 400 `bad_request_body`. Audited as
`partner.conversation_queue_changed` (`conversation_id`, `from` — `null` on a thread no raise routed — `to`,
`key_id`).

#### `GET /tenants/{ext}/media/{media_id}` — one attachment's bytes

Scope `inbox:media`, separate from `inbox:read` because it opens customer photos, voice notes, documents and bank
receipts. The `media.path` of a message. Only a file some message of this business carries as its own attachment is
served; a product image, a story's picture, another business's file, an unknown id or not a uuid → the same 404
`media_not_found`. Every answer, refusals included, carries `Content-Security-Policy: sandbox; default-src 'none'`,
`X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin` and `X-Content-Type-Options: nosniff`; the file
itself is served exactly as the panel serves it: `Cache-Control: private, no-store`, an image, audio or video type
inline under its own type, a PDF as an attachment typed `application/pdf`, anything else as an attachment typed
`application/octet-stream`, the filename the media id plus the type's extension; range requests are answered. Each
read leaves one `partner.media_read` row in the business's activity log (actor the key, target the media id, data the
key id only), committed before the first byte. 503 `media_unavailable` / `media_store_unavailable`
(`Retry-After: 5`) when the store cannot be read. 404 `not_found` while the inbox is off, like the other inbox routes.

### 8.16 Payment receipts, decisions and fulfilment

The customer pays card to card and sends a receipt (a picture, or a typed reference). Bizin records it as **evidence**
on the order and never reads an amount off it; a person or the partner decides. Approval attests that the order's
whole total arrived. Every route here names the order: a receipt is reachable only under its own order of its own
business, and any other id, a receipt of another order included, is 404 `evidence_not_found`. Writes need an
`Idempotency-Key`; every decision and move is audited with the key as the actor (`payment.evidence_approved`,
`payment.evidence_rejected`, `order.marked_paid`, `order.status_changed`). Approve, reject and mark-paid answer 409
`payment_verification_off` while `v3.orders.payment_verification` is off for the business, as the panel does; reads
and status moves are not affected.

#### `GET /tenants/{ext}/orders/{order_id}/payment-evidence` — the order's receipts

Scope `payments:read`. Newest first, at most 50. Metadata only: no media id, no receipt text.

```json
200
{ "data": [ {
  "id": "…", "order_id": "…", "kind": "image", "status": "rejected",
  "created_at": "2026-10-20T08:11:02Z", "expected_amount": 12500000, "currency": "IRR", "minor_unit": 0,
  "decided_at": "2026-10-20T09:00:41Z", "decided_by": "partner_key",
  "reject_reason": "amount_mismatch", "note": "…", "closed_reason": null, "has_content": true
} ] }
```

`kind` is `image` or `text`; `status` is `pending_verification`, `approved`, `rejected` or `closed` (`closed_reason`
`order_paid` or `order_cancelled`: no decision is needed any more); both are extensible. `expected_amount` is the
order's total when the receipt arrived, in the order totals' unit. `decided_by` is a kind (`user`, `partner_key`,
`system`), never who. `note` is the decider's internal note; it is never sent to the customer.

#### `GET /tenants/{ext}/orders/{order_id}/payment-evidence/{evidence_id}/content` — the receipt itself

Scope `payments:verify` (`payments:read` is 403). A bank receipt carries card numbers and names: fetch it from your
backend, never cache it, and show it only to the person who decides. Every answer, refusals included, carries
`Content-Security-Policy: sandbox; default-src 'none'`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy:
same-origin` and `X-Content-Type-Options: nosniff`. A picture is served exactly as the panel's media route serves it:
`Cache-Control: private, no-store`, inline under its stored image type, anything else an attachment typed
`application/octet-stream`, range requests answered. A typed receipt answers `{"kind":"text","text":"…"}` with
`Cache-Control: private, no-store`. Each answered fetch writes one `payment_evidence.content_viewed` row to the
business's activity log with the key as the actor. 503 `media_unavailable` / `media_store_unavailable`
(`Retry-After: 5`) when the store cannot be read. The panel's `GET /api/v1/media/{id}` stays bearer-only: a partner
key there is 401.

#### `POST /tenants/{ext}/orders/{order_id}/payment-evidence/{evidence_id}/approve` — the whole total arrived

Scope `payments:verify`. Body `{}` or none. The order moves `confirmed` → `paid`, `payment.status` → `paid`, the
order's other pending receipts are closed (`order_paid`) and the customer is told once. Approving an approved receipt
is 200 with nothing written; a rejected or closed one is 409 `evidence_already_decided`; an order that is not
`confirmed` is 409 `order_not_awaiting_payment`.

```json
200 { "order": { "id": "…", "status": "paid", "payment": { "status": "paid", "…": "…" }, "…": "…" },
      "evidence": { "id": "…", "status": "approved", "decided_by": "partner_key", "…": "…" } }
```

#### `POST /tenants/{ext}/orders/{order_id}/payment-evidence/{evidence_id}/reject` — refuse one receipt

Scope `payments:verify`. `{"reason":"amount_mismatch","note":"…"}`. `reason` is required: `amount_mismatch`,
`unreadable`, `not_received`, `wrong_destination` or `other` (422 `invalid_value`, `field` = `reason`,
`params.allowed`; checked before the business is looked up). `note` is optional, at most 500 characters (422
`invalid_value`, `field` = `note`) and internal. The customer is told the reason as a fixed sentence. The order stays
`confirmed`; `payment.status` becomes `rejected` when no other receipt is pending. Rejecting a rejected receipt is 200
with nothing written. The answer has the approve shape.

#### `POST /tenants/{ext}/orders/{order_id}/mark-paid` — a payment seen without a receipt

Scope `payments:verify`. `{"reference":"…"}` or none; `reference` is at most 64 characters (422 `invalid_value`,
`field` = `reference`) and internal. The order must be `confirmed` (otherwise 409 `order_not_awaiting_payment`); a
paid order is 200 with nothing written. Pending receipts are closed (`order_paid`) and the customer is told once.
Answers the order as `GET …/orders/{order_id}` reads it.

#### `POST /tenants/{ext}/orders/{order_id}/status` — fulfilment moves

Scope `orders:fulfil` (OD7). `{"status":"packing"|"shipped"|"delivered"|"cancelled"}`; anything else, `paid`
included, is 422 `invalid_value` (`field` = `status`, `params.allowed`; checked before the business is looked up):
an order is paid only through approve or mark-paid. The moves are `paid` → `packing`, `paid`/`packing` → `shipped`,
`shipped` → `delivered`, and `draft`/`confirmed`/`paid`/`packing` → `cancelled`. There is no move out of `confirmed`
but `cancelled` here: a `confirmed` order is waiting for its payment. Stock follows as in the panel: shipping turns the
reservation into a sale, cancelling releases it, packing moves nothing. Any other move, a move to the status the order
already has included, is 409 `invalid_transition` (`params.from`, `params.to`, `params.allowed`). Answers the order.

`paid` gets 422 `invalid_value` with the message "an order is paid through mark-paid or an approved receipt"; the
panel's own status route answers the same request 409 `use_mark_paid` (`docs/backend/orders.md`). The partner route
refuses it with the other values outside the list, before the business is looked up; behind it, the orders repository
refuses `paid` as a status move for both surfaces.

**The verification queue.** `GET …/orders?payment_status=pending_verification` lists the orders with a receipt to
decide; read `GET …/orders/{order_id}/payment-evidence`, fetch the content, then approve or reject.

---

### 8.17 Shipping — the postage rules

The same rules the panel edits and every checkout prices from, in the storage unit like the order totals.

#### `GET /tenants/{ext}/shipping`

Scope `shipping:read`. A business that never saved rules reads as `"enabled": false`, no rates, `updated_at` `null`.

```json
200
{
  "enabled": true,
  "default_fee": 600000,
  "free_over": 30000000,
  "rates": [
    { "province": "تهران", "fee": 400000 },
    { "province": "فارس", "city": "شیراز", "fee": 700000 },
    { "province": "فارس", "fee": 800000 }
  ],
  "currency": "IRR",
  "minor_unit": 0,
  "updated_at": "2026-10-14T09:00:00Z"
}
```

#### `PUT /tenants/{ext}/shipping` — replace them

Scope `shipping:write`. No `Idempotency-Key` (§5): the body is the whole rule set, a field left out is cleared, and a
save that changes nothing writes nothing. `currency`, `minor_unit` and `updated_at` are accepted and ignored, so a GET
answer can be sent back. The answer is the GET shape.

| Field | Rule |
|---|---|
| `enabled` | off: every order keeps the fee its writer set; on needs `default_fee` or at least one rate (422, `field` = `enabled`) |
| `default_fee` | the flat fee, and the fee where no rate matches; `null`: such an address goes to a person |
| `free_over` | goods after the coupon at or above this ship free; `null`: never free; at least 1 |
| `rates[]` | at most 500; `province` and optional `city` in any spelling the place list knows (`Fars`, `فارس`), answered as the place name; one rate per (province, city); rates need the market's place list (`ir`) |
| every fee | a whole quote unit: a multiple of 10 for IRR (whole Toman) |

A refused rule is 422 `invalid_value` with the first failing `field`: `default_fee`, `free_over`, `rates`,
`rates[i].province`, `rates[i].city` ("not a city of فارس"), `rates[i].fee`, `rates[i]` (a repeated province and city)
or `enabled`. A fractional amount is 400 `bad_request_body`. The write is audited as `shipping_settings.changed` with
the key as the actor, keeping the enabled flag and the rate counts, not the table. A checkout the customer accepted
under the old rules goes stale and is priced again before the seller confirms it.

A city rate wins over its province's rate, which wins over `default_fee`; reaching `free_over` wins over all three; a
fee the seller typed on the order is never replaced. The order read (§8.13) shows which applied.

### 8.18 Bulk onboarding — `/onboarding-jobs`

Many businesses in one job, from a CSV or XLSX file or a JSON list (design
`docs/v3/design/10.4-5.1-bulk-onboarding-xlsx-import.md`). A job is previewed first and writes nothing; its commit
then provisions each valid row in a transaction of its own, exactly as `POST /tenants` (§8.1) would: the same
validation, quota, tenant cap, replay (`unchanged` for the same owner) and audit row, which carries the job id. Rows
that failed are never written, and nothing spans rows. Every route answers 404 `not_found` while
`v3.partner.bulk_jobs` is off, before the scope; a job already committing still finishes. Another partner's job, or
an id that is not a uuid, is 404 `import_job_not_found`.

| Method | Path | Scope | Answer |
|---|---|---|---|
| POST | `/onboarding-jobs` | `tenants:provision` | 201 the job (`ready`); 200 the same job on an idempotent repeat |
| GET | `/onboarding-jobs` | `tenants:read` | `{ "jobs", "next_cursor" }`, newest first, `limit` 1-100 (50) and `cursor` |
| GET | `/onboarding-jobs/{job_id}` | `tenants:read` | the job |
| GET | `/onboarding-jobs/{job_id}/rows` | `tenants:read` | `{ "rows", "next_cursor" }`, `?action=fail\|create\|update\|unchanged\|not_attempted`, `limit` 1-500 (100); `Accept: text/csv` → the results export |
| POST | `/onboarding-jobs/{job_id}/commit` | `tenants:provision` | 202 the job (`committing`); 409 `job_not_ready` / `job_has_row_errors` |
| POST | `/onboarding-jobs/{job_id}/cancel` | `tenants:provision` | 200 the job (`cancelled`); 409 `job_not_ready` unless `ready` |

#### `POST /onboarding-jobs` — preview a job

Either `multipart/form-data` — a `file` field (CSV in UTF-8 or XLSX, told apart by the bytes, at most 10 MiB, an XLSX
at most 64 MiB inflated; the first visible sheet is read, a formula by the value Excel saved) plus optional fields
`on_errors`, `defaults` (a JSON string) and `auto_commit` (`true`/`false`) — or `application/json` (at most 1 MiB):

```json
{
  "on_errors": "skip",
  "auto_commit": false,
  "defaults": { "market_profile": "ir", "reply_language": "fa", "owner_locale": "fa" },
  "rows": [
    { "external_business_id": "shop-1042", "name": "گل‌سرا",
      "metadata": { "source": "spring-campaign" },
      "owner": { "external_user_id": "u-88", "email": "a@example.com", "first_name": "Sara", "last_name": "A.",
                 "phone": "+989121234567" } }
  ]
}
```

A JSON row is a `POST /tenants` body; the owner may give `first_name` + `last_name` instead of `display_name`.
`defaults` fill a blank `market_profile`, `reply_language` and `owner.locale`. At most 2000 rows (422 `too_many_rows`,
`params.max`); none is 422 `rows_missing`. `on_errors` is `skip` (default: the commit writes the valid rows) or `abort`
(the commit is refused while any row failed); anything else is 422 `invalid_value` (`field` = `on_errors`).

File columns, canonical English headers with Farsi and Arabic aliases (case, spacing and digits folded); blank cells
take `defaults`:

| Column | Required | Aliases (examples) | Maps to |
|---|---|---|---|
| `external_business_id` | yes | `business_id`, «شناسه کسب‌وکار», «شناسه فروشگاه», «معرف النشاط» | `external_business_id` |
| `business_name` | yes | `shop_name`, «نام کسب‌وکار», «نام فروشگاه», «اسم النشاط» | `name` |
| `market_profile` or `country` | yes, or a default | `market`, «بازار», «کشور», «السوق», «الدولة» | `market_profile`; `country` IR → `ir`, AE → `ae`, another → row `market_profile_invalid` |
| `reply_language` | no | «زبان پاسخ», «لغة الرد» | `reply_language` |
| `owner_external_user_id` | yes | `external_user_id`, «شناسه کاربر», «معرف المستخدم» | `owner.external_user_id` |
| `owner_email` | yes | `email`, «ایمیل», «البريد الإلكتروني» | `owner.email` |
| `owner_display_name`, or `owner_first_name` + `owner_last_name` | one of | «نام مالک», «نام», «نام خانوادگی», «الاسم الأول», «اسم العائلة» | `owner.display_name` |
| `owner_phone` | no | `phone`, `mobile`, «تلفن», «موبایل», «الهاتف» | the owner's phone (E.164, by the market's rule) |
| `owner_locale` | no | `language`, `locale`, «زبان», «اللغة» | `owner.locale` |
| `source`, `campaign` | no | «منبع», «کمپین», «المصدر», «الحملة» | `metadata.source`, `metadata.campaign` |
| `metadata.<key>` | no | — | `metadata.<key>` (string values; the object at most 8 KiB) |

Templates: [`tenants.csv`](../partner/templates/tenants.csv) and [`tenants.xlsx`](../partner/templates/tenants.xlsx), the canonical headers with one business per market.

A file without a required column is refused whole: 422 `columns_missing` with `params.columns` (the canonical names
missing, e.g. `["owner_email"]`). Other file refusals: 400 `bad_multipart` / `file_field_missing`, 413 `file_too_large`,
415 `file_format_unsupported` (an XLSX while `v3.import.xlsx` is off) / `file_xls_or_encrypted`, 422
`file_too_large_uncompressed` / `file_unreadable` / `import_file_invalid`.

**Idempotency.** The `Idempotency-Key` header is required, and it is bound to the job: to the file (or the JSON rows)
and to `on_errors`, `defaults` and `auto_commit`. The same key with the same request answers the existing job, 200,
as it is now (committed, cancelled or expired included); the same key with another file or other parameters is 422
`idempotency_key_reused` and stores nothing. This is the only replay a file upload has: the guard of §5 never stores a
multipart body. A JSON create is additionally replayed by that guard for 24 h.

`auto_commit: true` starts the commit inside the create, so the answer is already `committing`; an `abort` job with a
failed row stays `ready`, as its commit would be refused. An uncommitted job expires after 24 h; a finished one keeps
its results for 7 days.

The job:

```json
{
  "id": "6f0c2d1e-7a4b-4c8d-9e2f-1a3b5c7d9e0f", "kind": "tenants", "status": "ready", "format": "xlsx",
  "filename": "shops.xlsx", "on_errors": "skip", "tenant": null,
  "counts": { "rows": 120, "valid": 117, "will_create": 100, "will_update": 0, "unchanged": 17, "failed": 3 },
  "result": null, "error": null,
  "warnings": [ { "code": "sheet_ignored", "line": 0, "params": {} } ],
  "created_at": "2026-10-17T09:00:00Z", "committed_at": null, "finished_at": null, "expires_at": "2026-10-18T09:00:00Z"
}
```

`status` is `ready`, `committing`, `done`, `error`, `expired` or `cancelled`. `result` is set on `done` and `error`:
`{ "created", "updated", "unchanged", "failed", "not_attempted" }`. `error` is `commit_interrupted` when a commit
could not be carried on after three interrupted attempts; the businesses provisioned before it stand and a rerun of
the same file finishes the rest. Warnings are file-wide notes by code (`sheet_ignored`, `formula_cached_value`,
`merged_cells`, `rows_truncated`).

#### `GET /onboarding-jobs/{job_id}/rows` — the rows and the results export

Before a commit each row carries the preview's prediction (`create`, `unchanged` or `fail`); once a commit began, the
commit's outcome, and `not_attempted` for a row it has not reached (or never will, on an `error` job).

```json
{ "line": 14, "external_id": "shop-1042", "name": "گل‌سرا", "action": "fail",
  "errors": [ { "code": "owner_email_in_use", "column": "owner_email", "field": "owner.email", "params": {},
                "message": "this email already has a Bizin account" } ],
  "tenant_id": null, "owner_status": null }
```

`line` is the file line (the sheet row), or the 1-based index of a JSON row. A created or unchanged row has
`tenant_id` and `owner_status` (`pending` until the owner activates, then `active`); no activation link is ever in a
job — fetch it per business with §8.7. Each error has a stable `code` (render from it; `message` is English),
`column` (the canonical file column), `field` (the `POST /tenants` field) and `params` (for a cell the reader refused,
`params.value`, at most 120 characters). The row codes:

| Code | Meaning |
|---|---|
| `required_missing` | a required cell is blank and no default fills it |
| `too_long` | the name or display name is over 200 characters, or a cell over Excel's limit |
| `invalid_value` | a value outside its rule not covered by a code below |
| `invalid_email` | `owner_email` is not an email address |
| `invalid_phone` | `owner_phone` is not a phone number of the row's market |
| `market_profile_invalid` | an unknown `market_profile`, or a `country` without a market |
| `reply_language_invalid` | `reply_language` is not `en`, `ar` or `fa` |
| `locale_invalid` | `owner_locale` is not a supported locale |
| `metadata_invalid` | the metadata is not an object of at most 8 KiB |
| `external_id_invalid` | `external_business_id` or `owner_external_user_id` is not 1-128 characters |
| `duplicate_in_file` | this `external_business_id` is on an earlier row (`params.line`) |
| `owner_email_duplicate_in_file` | this owner email owns another business earlier in the file |
| `owner_email_in_use` | the email already has a Bizin account |
| `owner_mismatch` | the business exists with another owner |
| `owner_external_id_in_use` | the owner's external id is linked to another user |
| `entitlement_exceeded` | the partner's tenant cap is reached |
| `quota_exceeded` | `provision_per_day` is used up for today; a rerun tomorrow finishes the row |
| `id_precision_lost` | Excel stored an id as a number and lost digits; format the column as text |
| `formula_no_value` | a formula cell has no saved value; open and save the file in Excel |
| `row_unreadable` | the CSV line could not be split into cells |
| `write_failed` | the business could not be written; a rerun retries it |

With `Accept: text/csv` the answer is every row (still filtered by `action`, never paged) as a CSV with the header
`line,external_business_id,business_name,action,tenant_id,owner_status,error_codes,error_columns`, the codes and
columns `;`-joined. A cell beginning with `=`, `+`, `-`, `@`, TAB or CR is written behind a leading `'`, so a
spreadsheet never runs a name such as `=HYPERLINK(…)` as a formula.

#### `POST /onboarding-jobs/{job_id}/commit` and `…/cancel`

`commit` claims a `ready` job and answers 202 with it `committing`; the businesses are provisioned in the background
— poll the job until `done` or `error`, or subscribe a webhook to `import.completed` (§9.2), sent once when the job
ends. A second commit, or a commit of a job that is not `ready`, is 409
`job_not_ready`, so one job runs once; an `abort` job with a failed row is 409 `job_has_row_errors` and nothing is
written. A commit cut short by a restart carries on from where it stopped. `cancel` drops a `ready` job unwritten
(200, `cancelled`); any other state is 409 `job_not_ready`.

### 8.19 Entitlements — what your contract allows each business

Your partner contract (set by Bizin, versioned, never edited in place) lists the features your businesses may use
and the limits on them. A contract never carries a price, a fee or credit: the assistant's AI use is metered by each
business's prepaid credit as before.

| Feature | Routes that need it (403 `feature_not_entitled` without it) |
|---|---|
| `inbox.api` | every inbox route (§8.15) |
| `payments.verification` | `…/payment-evidence`, its `content`, `approve` and `reject`, and `…/mark-paid` (§8.16) |
| `returns.cases` | every `…/cases` route (§8.14); the return policy is the assistant's and is not gated |
| `shipping.rules` | `GET` / `PUT …/shipping` (§8.17) |
| `channel.whatsapp`, `channel.instagram`, `channel.telegram`, `flows.advanced`, `instagram.comments` | checked where the business connects the channel or uses the feature |

A feature removed takes effect at once for new use; nothing stored or connected is deleted or paused, and the read
below shows it as `over_contract`. A limit used up (`tenants.max` on `POST /tenants`, `channels.max`,
`products.max`) is 403 `entitlement_exceeded` with `params.limit`, `params.value` and `params.used`.

#### `GET /entitlements` — your contract

```json
{ "contract": { "version": 3, "effective_from": "2026-10-20T00:00:00Z", "commercial_ref": "MSA-2026-01" },
  "features": ["channel.whatsapp", "channel.telegram", "inbox.api", "payments.verification"],
  "limits": { "tenants.max": { "value": 100, "used": 12 } },
  "next": { "version": 4, "effective_from": "2026-11-01T00:00:00Z" } }
```

A limit with no entry is unlimited. `used` is counted for `tenants.max` and `null` for a per-business limit. `next` is
the version scheduled to take over, or `null`; `contract` is `null` only when no version is in force.

#### `GET /tenants/{ext}/entitlements` — one business

```json
{ "external_business_id": "shop-17", "contract_version": 3,
  "features": { "channel.whatsapp": { "allowed": true,  "source": "contract" },
                "inbox.api":        { "allowed": false, "source": "tenant" },
                "channel.instagram":{ "allowed": false, "source": "contract", "over_contract": true } },
  "limits": { "channels.max": { "value": 2, "used": 3, "source": "tenant", "over_contract": true },
              "products.max": { "value": null, "used": 840, "source": "contract" } } }
```

Every feature of the catalogue is listed. `source` is what decided the entry: `contract`, `tenant` (your own
narrowing of this business) or `operator` (Bizin support). `value: null` is unlimited.

#### `PUT /tenants/{ext}/entitlements` — narrow one business

```json
{ "features": { "inbox.api": false }, "limits": { "channels.max": 2 } }
```

You can only narrow within your contract (owner decision OD5); only Bizin support widens one business.

- A feature `false` narrows it; `true` or `null` drops your narrowing, so the contract decides again. A limit value
  narrows the contract's limit for this business; `null` drops it. Entries the body does not name keep their value.
- A feature your contract lacks, or a limit above your contract's → 403 `entitlement_exceeded` with `params.feature`,
  or `params.limit` and `params.value` (the contract's). Nothing in the body is written.
- An entry Bizin support set → 409 `entitlement_set_by_operator`.
- An unknown feature → 400 `unknown_feature`; a limit other than `channels.max` / `products.max` → 400
  `unknown_limit` (`tenants.max` is yours, not a business's); a value outside 0–1000000 → 422 `invalid_value`; an
  empty body → 400 `bad_request_body`.
- No `Idempotency-Key`. A save that changes nothing writes nothing, is not audited and sends no webhook. A change is
  audited in the business's activity log with your key as actor and sends one `entitlements.changed` (§9.2). The
  answer is the `GET` shape after the write.

### 8.20 Bulk catalogue — `/tenants/{ext}/catalog-import-jobs`

One business's catalogue in one job, from a CSV or XLSX file or a JSON list (design
`docs/v3/design/10.4-5.1-bulk-onboarding-xlsx-import.md`, BX-8b). It is the same job as §8.18 — previewed first and
writing nothing, then committed in the background — with the product as its unit: each valid product is written exactly
as `PUT …/products/{product_ext}` (§8.10) writes it, in a transaction of its own (variants authoritative, a dropped one
deactivated, never deleted; `products.max` counted; the currency lock of the business's market holds), then its
pictures are fetched and its specification sheet is written to the business's knowledge, as the panel's import does.
A product the preview failed is never written. Every route answers 404 `not_found` while `v3.partner.bulk_jobs` is
off, before the scope; another partner's business is 404 `tenant_not_found`; a job of another of your businesses, or
an id that is not a uuid, is 404 `import_job_not_found`.

| Method | Path | Scope | Answer |
|---|---|---|---|
| POST | `/tenants/{ext}/catalog-import-jobs` | `catalog:write` | 201 the job (`ready`); 200 the same job on an idempotent repeat |
| GET | `/tenants/{ext}/catalog-import-jobs` | `catalog:read` | `{ "jobs", "next_cursor" }`, newest first, `limit` 1-100 (50) and `cursor` |
| GET | `/tenants/{ext}/catalog-import-jobs/{job_id}` | `catalog:read` | the job |
| GET | `/tenants/{ext}/catalog-import-jobs/{job_id}/rows` | `catalog:read` | `{ "rows", "next_cursor" }`, one per product, `?action=`, `limit` 1-500 (100); `Accept: text/csv` → the results export |
| POST | `/tenants/{ext}/catalog-import-jobs/{job_id}/commit` | `catalog:write` | 202 the job (`committing`); 409 `job_not_ready` / `job_has_row_errors` |
| POST | `/tenants/{ext}/catalog-import-jobs/{job_id}/cancel` | `catalog:write` | 200 the job (`cancelled`); 409 `job_not_ready` unless `ready` |

**Create.** `multipart/form-data` (a `file` field, CSV or XLSX as in §8.18, plus optional `on_errors` and
`auto_commit`) or `application/json` (at most 1 MiB):

```json
{ "on_errors": "skip", "auto_commit": true,
  "rows": [ { "external_id": "tee-classic", "title": "Classic T-shirt", "sku": "TS-001", "active": true,
              "variants": [ { "external_id": "tee-classic-m-black", "options": ["M", "Black"], "price": 12500000, "stock": 14 } ] } ] }
```

A JSON row is a `PUT …/products/{product_ext}` body plus its `external_id`, prices in the market's storage unit; at
most 5000 rows. In a file, a row is one variant and rows sharing an `external_id` are one product, in the order each
id first appears, its variants in file order. The product's own fields (title, description, category, SKU, status) and
its specification sheet come from its first row; every row adds its variant and its pictures (at most 8 per product).
A row that fails fails its whole product, because a product written without one of its variants would deactivate it.
At most 5000 lines. The product columns, aliases and price reading are the panel import's (`docs/backend/import.md`:
`title`, `sku`, `description`, `status`, `category`, a price in the business's market — Rial or a Toman column for
`ir` —, `variant_name`, `stock_qty`, `in_stock`, `track_stock`, `image_urls`, every other column a line of the
sheet), plus two that are required:

| Column | Aliases (examples) | Maps to |
|---|---|---|
| `external_id` | `product_external_id`, «شناسه خارجی», «شناسه خارجی محصول», «المعرف الخارجي» | the product's `external_id` |
| `variant_external_id` | «شناسه خارجی نوع», «المعرف الخارجي للخيار» | the variant's `external_id` |

Templates: [`products.csv`](../partner/templates/products.csv) and [`products.xlsx`](../partner/templates/products.xlsx), the canonical headers with a two-variant product and a simple one (`price` in the market's display unit, Rial for `ir`).

A file without either is 422 `columns_missing` (`params.columns`). Both are identifiers and read as text: an XLSX
number that lost digits is the row's `id_precision_lost`. A variant's stock: a `stock_qty` sets the counted level to
that number, as a PUT `stock` does; a row that says the variant is available without a number (`in_stock` true, or
`track_stock` false) is not counted (`stock: null`); a row that says nothing, or out of stock, is counted at 0. The
compare-at price and search names are not part of a partner product and are not read.

Idempotency, `on_errors`, `auto_commit`, expiry and the job shape are §8.18's, with `kind: "products"`,
`tenant: { "external_business_id" }` and the counts in products (`unchanged` is always 0). The same key on another of
your businesses, or one spent on an onboarding job, is 422 `idempotency_key_reused`. `error` is `market_changed` when
the business's market changed between the preview and the commit (nothing is written), or `commit_interrupted`.
Re-committing the same file in a new job updates every product and creates none.

**Rows.** One row per product:

```json
{ "line": 2, "lines": [2, 4], "external_id": "shirt", "title": "Linen shirt", "action": "create",
  "errors": [], "warnings": ["image_failed"],
  "product_id": "4c8e1a27-9b3d-4f60-a5e2-1d7c9f3b8e04", "variant_ids": ["e2b7c4a1-…", "0a9d1e2f-…"] }
```

`lines` are the file lines of the product; an error carries the `line` at fault. `action` is `create`, `update`, `fail`
or `not_attempted`. `warnings` are what failed after the product was written (`image_failed`, `image_skipped`,
`knowledge_failed`). The codes: `required_missing`, `too_long`, `invalid_value` (the catalogue's own rules, with the
`PUT` field for a JSON row), `external_id_invalid`, `duplicate_in_file` (a product or variant id earlier in the job,
`params.line`), `entitlement_exceeded` (`products.max` reached: `params.limit`, `value`, `used`; the job carries on),
`variant_external_id_taken`, `id_precision_lost`, `formula_no_value`, `title_missing`, `price_invalid`,
`price_not_integral`, `price_negative`, `stock_invalid`, `row_unreadable`, `write_failed` (`params.reason`
`sku_in_use` for a SKU of another product). The CSV export's header is
`line,external_id,title,action,product_id,variant_ids,error_codes,error_columns`, with §8.18's formula guard.

### 8.21 Branding — your name, logo and AI disclosure

One brand per partner, always your key's own: no path, body or query names another partner's, and a business's brand
comes only from the partner it belongs to (design `docs/v3/design/10.5-10.6-entitlements-branding-disclosure.md`,
BR-3). Bizin support sets the brand's `mode`: `direct` shows Bizin, `partner` your name and logo, `co_brand` both with
"Powered by Bizin", on the screens a seller sees — the connect page (§8.6), the activation page (§8.7) and the panel.
A customer never sees your brand: in every mode the assistant speaks as the business. What reaches a customer is your
AI disclosure, per language, while the mode is `partner` or `co_brand`.

#### `GET /branding` — your brand (`branding:read`)

```json
{ "mode": "partner",
  "names": { "en": "ShopKit", "ar": "شوب كيت", "fa": "شاپ‌کیت" },
  "support_label": { "en": "ShopKit support", "ar": "دعم شوب كيت", "fa": "پشتیبانی شاپ‌کیت" },
  "support_url": "https://help.shopkit.example",
  "logo_url": "https://www.bizin.app/api/v1/brand-assets/5b0d6a3e-7c1f-4f2b-9a51-2f0e8d7c6b5a",
  "disclosures": { "en": { "text": "…", "source": "brand" },
                   "ar": { "text": "…", "source": "default" },
                   "fa": { "text": "…", "source": "default" } },
  "updated_at": "2026-10-18T09:30:00Z" }
```

A brand never written is `direct` with empty `names` and `support_label`, `null` URLs and `updated_at: null`. A locale
without a name shows the English name, then your slug. `disclosures` always has `en`, `ar` and `fa` and is never
empty: `source: brand` is your text, `source: default` Bizin's — also for a stored text that no longer passes the
rules below, because that text is not what is sent.

#### `PUT /branding` — names, support label, support URL (`branding:write`)

```json
{ "names": { "en": "ShopKit", "fa": "شاپ‌کیت" }, "support_url": "https://help.shopkit.example" }
```

- A member the body leaves out keeps its value; `null` clears it; `names` or `support_label` replaces the whole
  object. Locales are `en`, `ar` and `fa`; each text is 1–60 characters after trimming; `support_url` is `https://`,
  at most 500 characters, with a host and no credentials. Otherwise 422 `invalid_value` with `field`
  (`names.<locale>`, `support_label.<locale>`, `support_url`).
- `mode` in the body → 400 `brand_mode_read_only` (OD9). Any other unknown member — `logo_url`, `disclosures`,
  `enabled` — or an empty body → 400 `bad_request_body`.
- No `Idempotency-Key`. A save that changes nothing writes nothing. A change is written, before it is made, in each of
  your businesses' activity logs as `partner.brand_updated` (`data.fields` names what changed, never a value; a
  partner with no business yet has no log to write to); the answer is the `GET` shape after the write, and the
  businesses' screens show it at once.

#### `PUT /branding/disclosures/{locale}` — the AI disclosure in one language (`branding:write`)

`{"text": "..."}` stores your text, trimmed; `{"text": null}` drops it, so Bizin's default is sent again. `{locale}`
is `en`, `ar` or `fa` (any other → 404 `not_found`). A body with no `text`, a `text` that is neither a string nor
`null`, or any other member (there is no `enabled`: the disclosure cannot be switched off by any setting) → 400
`bad_request_body`.

A text is stored only when it is a disclosure in its language. A refusal is 422 `disclosure_invalid` with
`params.locale` and `params.reason`, the first rule it breaks:

| `reason` | Rule |
|---|---|
| `empty` | nothing but spaces |
| `too_short` | fewer than 20 characters |
| `too_long` | more than 220 characters |
| `not_bot` | it does not say the replies are automated (assistant, AI, bot, …) |
| `no_human` | it does not offer a person |
| `wrong_script` | not written in the language's script: Arabic script for `fa` and `ar` (by which keyboard's letters dominate), Latin with no Arabic script for `en` |
| `no_handoff_word` | it names no word the assistant hands off on in that language, so "type X for a person" would be a promise nobody keeps (e.g. «اپراتور», «موظف», "operator", "human") |

The same check runs again on every send; a stored text that fails it there is replaced by the default in the reply's
language, so a business always discloses. No `Idempotency-Key`. Each change is logged in each of your businesses'
activity logs as `partner.brand_disclosure_set` (`data.locale`, `data.from` and `data.to` as `default` or `brand`,
never the text).

#### `POST /branding/logo` — the logo (`branding:write`)

`multipart/form-data` with one file field `file`: PNG or WebP, at most 256 KiB and 512×512 pixels. The type is read
from the bytes, never from a header; SVG is refused. What is stored and served is Bizin's PNG re-encode of the decoded
pixels — never your bytes, no metadata — under a new id each time, at the public `logo_url`
(`GET /api/v1/brand-assets/{id}`: no session, `Cache-Control: public, max-age=31536000, immutable`,
`X-Content-Type-Options: nosniff`, a sandboxing CSP). A logo holds no business data, and the authenticated media route
is not involved. Refusals: 413 `file_too_large` (the upload), 413 `logo_too_large` (`params.max_kb`, the re-encode),
415 `logo_type_unsupported`, 422 `logo_too_wide` (`params.max_px`), 422 `logo_invalid`; the multipart errors of §8.15's
upload (`bad_multipart`, `file_field_missing`, `image_empty`). The answer is the `GET` shape with the new `logo_url`.

Needs an `Idempotency-Key`, but a multipart body is never stored for replay: a retry under the same key uploads again
and gets a new id (the previous logo is simply no longer the brand's). Each upload is logged as `partner.brand_updated`
with `data.fields: ["logo"]`.

## 9. Webhooks

### 9.1 What a delivery looks like

```http
POST /hooks/bizin HTTP/1.1
Host: partner.example
Content-Type: application/json
User-Agent: Bizin-Webhooks/1
Bizin-Event-Id: evt_2f6b8d14-7c3a-4e95-b1d0-9a5e3c7f1b26
Bizin-Event-Type: channel.connected
Bizin-Delivery-Attempt: 1
Bizin-Signature: t=1760349731,v1=5f1c…

{"id":"evt_2f6b8d14-7c3a-4e95-b1d0-9a5e3c7f1b26","type":"channel.connected","api_version":"v1","occurred_at":"2026-10-13T10:02:11Z","tenant":{"id":"0b1c6f0e-8d2a-4c3b-9a71-5e2f4d8c1a90","external_business_id":"biz-778"},"data":{"channel_id":"3e9b7c21-5a4d-4f86-9c0e-1b2d3f4a5c6e","channel_kind":"instagram","status":"connected"}}
```

| Envelope field | Meaning |
|---|---|
| `id` | `evt_<uuid>`; stable across every attempt and every replay of this event |
| `type` | §9.2 |
| `api_version` | `v1` |
| `occurred_at` | when the change happened (not when it was delivered) |
| `tenant` | `{id, external_business_id}`; `null` for `ping`, for `import.completed` of a `tenants` job and for `entitlements.changed` of `scope: "partner"` |
| `data` | the type's payload, nothing else |

**Webhooks carry ids and states only** (owner decision D25 / OD10): no customer name, handle, phone, address, message
text, receipt or amount. Use the read routes for current state.

### 9.2 Event types

| Type | When | `data` |
|---|---|---|
| `tenant.provisioned` | a tenant is attached to the partner (after `POST /tenants`) | `{}` |
| `channel.connected` | a channel account's status becomes `connected` | `{"channel_id": "<uuid>", "channel_kind": "instagram", "status": "connected"}` — `channel_id` is the `channel_id` of §8.4 |
| `channel.disconnected` | a channel account's status leaves `connected` | `{"channel_id": "<uuid>", "channel_kind": "instagram", "status": "error"}` — the new status: `disconnected`, `pairing`, `banned` or `error` |
| `channel.health_changed` | a connected channel's `health.state` (§8.4) moves into or out of `degraded` or `broken`; moves among `ok`, `quiet` and `unknown` send nothing. Only while channel health is switched on for the business | `{"channel_id": "<uuid>", "channel_kind": "telegram", "state": "broken", "previous_state": "ok", "reason": "tg_webhook_foreign"}` — states and the reason token of §8.4 only, never the provider's text, URL or token |
| `handoff.raised` | a conversation is handed to a human | `{"conversation_id": "<uuid>", "channel_kind": "instagram" \| null, "reason": "<token>", "reason_class": "PAYMENT_VERIFICATION", "queue": "accounting", "priority": "high"}` — the reason is a short machine token (at most 64 characters); `reason_class` is one of the seven handoff classes or `NONE`, `queue` one of `sales`, `support`, `accounting`, `appointment`, `fulfillment`, `priority` one of `low`, `normal`, `high`, `urgent`, as the platform routed the raise |
| `handoff.released` | a conversation goes back to the assistant from `handoff` or `human` (taking a thread over emits nothing) | `{"conversation_id": "<uuid>", "channel_kind": "instagram" \| null, "from": "handoff"}` — `from` is `handoff` or `human` |
| `message.received` | a customer message is stored (a redelivery that stores nothing emits nothing) | `{"conversation_id": "<uuid>", "message_id": "<uuid>", "channel_kind": "telegram" \| null, "kind": "image"}` — `kind` is `text`, `image`, `video`, `audio`, `document`, `sticker` or `other`; never the text, a caption or a media URL |
| `message.sent` | an outbound message is stored, the assistant's or a human's | `{"conversation_id", "message_id", "channel_kind", "kind", "sender": "ai" \| "human"}` — `sender` is the value when the message was stored |
| `order.created` | an order is created | `{"order_id": "<uuid>", "code": "1043", "status": "draft", "source": "ai"}` — `source` is `dashboard`, `ai` or `api`; no items, totals or customer: read them with `GET /tenants/{ext}/orders/{order_id}` (§8.13) |
| `order.status_changed` | an order's status changes (a `payment_status` change alone emits nothing) | `{"order_id": "<uuid>", "code": "1043", "from": "confirmed", "to": "paid", "payment_status": "paid"}` — `from`/`to` are order statuses (`draft`, `confirmed`, `paid`, `packing`, `shipped`, `delivered`, `cancelled`); `payment_status` is `unpaid`, `pending_verification`, `rejected` or `paid` |
| `payment.evidence_received` | a payment receipt is stored against an order | `{"evidence_id": "<uuid>", "order_id": "<uuid>", "code": "1043", "kind": "image"}` — `kind` is `image` or `text`. Never in an order or payment webhook: an amount, the customer's name or phone, a media id, the receipt text, a reject reason or a note |
| `credit.exhausted` | the business's AI credit runs out (once per exhaustion) | `{"state": "exhausted"}` |
| `case.opened` | the assistant opens a returns or complaints case | `{"case_id", "code": "R12", "kind", "state": "open", "order_id": "<uuid>" \| null, "order_unresolved", "conversation_id", "channel_kind"}` — read the case with `GET …/cases/{case_id}` (§8.14) |
| `case.updated` | any later event on a case: a photo, the customer's reply, a decision | `{"case_id", "code", "kind", "action", "actor", "previous_state", "state", "photo_count"}` — `action` is `photo_added`, `customer_replied`, `request_info`, `accept`, `reject`, `mark_refunded`, `mark_exchanged` or `close` (the first event, `opened`, is `case.opened`); `actor` is the class (`customer`, `assistant`, `partner`, `seller`, `system`), never a key or user id. Never in a case webhook: the customer's words, name or phone, the shop's note, the refund amount or reference, a media id |
| `entitlements.changed` | `scope: "tenant"`: a business's entitlements changed, by you (§8.19) or by the operator. `scope: "partner"`: a new contract version is in force — written in force by the operator, or a future-dated one taking effect (sent once, within about a minute of its `effective_from`; a version overtaken before it starts is never sent) | `{"scope": "tenant", "external_business_id": "shop-17", "contract_version": 3}` or `{"scope": "partner", "external_business_id": null, "contract_version": 4}` — ids and the contract version in force only; read the entitlements with `GET …/entitlements` |
| `import.completed` | an onboarding job (§8.18) or a catalogue job (§8.20) ends: `done` after its commit, `error` when the commit could not finish | `{"job_id": "<uuid>", "kind": "tenants", "status": "done", "created": 100, "updated": 0, "unchanged": 17, "failed": 3, "not_attempted": 0}` — `status` is the job's status as `GET /onboarding-jobs/{job_id}` shows it; the counts only, never a row: read the rows with `GET …/rows`. A `tenants` job spans many businesses, so `tenant` is `null`; each business provisioned still sends its own `tenant.provisioned`. A `products` job (`"kind": "products"`) names its business in `tenant` |
| `ping` | `POST /webhooks/{id}/ping` | `{}` |

There is no `credit.low` in v1. New types may be added at any time: ignore a type you do not know and answer 2xx.

The type list is `partnerhooks.Types()` (`backend/internal/partnerhooks/events.go`), and each payload is the struct the
catalogue there decodes it into; `contract_doc_test.go` fails when the OpenAPI file's `EventType` list or any payload's
keys differ from them. An endpoint subscribes to any of these but `ping`, or to `*`.

### 9.3 Delivery and retries

- Events are picked up every 2 seconds and sent to every **active** endpoint of the partner subscribed to the type (or
  to `*`). There is no ordering guarantee between events: use `occurred_at`, and treat the read routes as the truth.
- Each attempt is a `POST` with a 10-second timeout. Redirects are not followed.
- **2xx** → `delivered`. Answer fast; do the work after answering.
- **5xx, 408, 429**, a timeout, a TLS failure or a refused connection → retried. 8 attempts in all, spaced 10 s, 30 s,
  2 min, 10 min, 30 min, 1 h, 3 h (the last attempt about 4 h 43 min after the first). The last failure makes the
  delivery `dead`.
- **410** → `dead` at once, and the endpoint is disabled with reason `gone`.
- **Any other status** (other 4xx, and 3xx) → `dead` at once.
- 20 dead deliveries in a row disable the endpoint with reason `failing`; a delivered one resets the run.
- Bizin keeps events and their delivery history for **14 days**. Within that window a Bizin operator can replay a dead
  delivery; a replay carries the same event id and a fresh signature.
- A receiver may get the same event more than once. **De-duplicate by `Bizin-Event-Id`** (keep seen ids for at least
  24 hours).

### 9.4 Verifying the signature

```
Bizin-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>]
v1 = hex( HMAC-SHA256( key = endpoint secret, message = "<t>." + raw request body ) )
```

- The HMAC key is the whole secret string as shown, `whsec_` prefix included.
- Compute over the **raw body bytes as received**. Parsing the JSON and re-encoding it changes the bytes and fails.
- Accept the request when **any** `v1` matches (during a secret rotation there are two: the new secret's first) and
  `|now − t| ≤ 300 seconds`. Then de-duplicate by `Bizin-Event-Id`. The window refuses an old captured request; the
  de-duplication refuses a fresh copy.
- Each attempt is signed with a fresh `t`.

Test vector (also pinned by `backend/internal/partnerhooks/sign_test.go`):

```
secret : whsec_test_vector_secret
t      : 1760184000
body   : {"id":"evt_3b9e","type":"ping"}
header : t=1760184000,v1=e8cc33d3f817d334e805c078eb22b4da1a145dcb460dd29b1dbdbd6f79519d8d

printf '1760184000.{"id":"evt_3b9e","type":"ping"}' | openssl dgst -sha256 -hmac 'whsec_test_vector_secret'
```

**Go**

```go
package bizinhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// SignatureTolerance is the replay window: a request whose t is further
// than this from the receiver's clock is refused.
const SignatureTolerance = 300 * time.Second

var ErrSignature = errors.New("bizin: webhook signature does not verify")

// VerifySignature checks a Bizin-Signature header against the raw request
// body, exactly as received. secret is the endpoint secret ("whsec_…").
func VerifySignature(header string, rawBody []byte, secret string, now time.Time) error {
	var (
		t     int64
		haveT bool
		sigs  []string
	)
	for _, part := range strings.Split(header, ",") {
		k, v, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			return ErrSignature
		}
		switch k {
		case "t":
			n, err := strconv.ParseInt(v, 10, 64)
			if err != nil || haveT {
				return ErrSignature
			}
			t, haveT = n, true
		case "v1":
			sigs = append(sigs, v)
		}
	}
	if !haveT || len(sigs) == 0 {
		return ErrSignature
	}
	if d := now.Sub(time.Unix(t, 0)); d > SignatureTolerance || d < -SignatureTolerance {
		return ErrSignature
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(t, 10) + "."))
	mac.Write(rawBody)
	want := []byte(hex.EncodeToString(mac.Sum(nil)))
	for _, s := range sigs {
		if hmac.Equal([]byte(s), want) {
			return nil
		}
	}
	return ErrSignature
}

// Handler verifies, de-duplicates and acknowledges; process runs the event.
func Handler(secret string, seen func(eventID string) bool, process func(body []byte)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if VerifySignature(r.Header.Get("Bizin-Signature"), body, secret, time.Now()) != nil {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if !seen(r.Header.Get("Bizin-Event-Id")) {
			go process(body)
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
```

A 401 from your receiver is a 4xx: Bizin dead-letters that delivery at once rather than retrying it.

**Node.js** (18+, no dependencies)

```js
import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_TOLERANCE_SECONDS = 300;

// verifySignature checks a Bizin-Signature header against the raw request
// body (a Buffer, exactly as received). secret is the endpoint secret.
export function verifySignature(header, rawBody, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  let t = null;
  const sigs = [];
  for (const part of String(header ?? "").split(",")) {
    const i = part.indexOf("=");
    if (i < 0) return false;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === "t") {
      if (t !== null || !/^-?\d+$/.test(value)) return false;
      t = Number(value);
    } else if (key === "v1") {
      sigs.push(value);
    }
  }
  if (t === null || sigs.length === 0) return false;
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const want = Buffer.from(
    createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest("hex"),
  );
  return sigs.some((s) => {
    const got = Buffer.from(s);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

// Express: take the raw body for this route only, never express.json().
// app.post("/hooks/bizin", express.raw({ type: "application/json" }), (req, res) => {
//   if (!verifySignature(req.get("Bizin-Signature"), req.body, process.env.BIZIN_WEBHOOK_SECRET)) {
//     return res.sendStatus(401);
//   }
//   if (!alreadySeen(req.get("Bizin-Event-Id"))) queue(JSON.parse(req.body));
//   res.sendStatus(204);
// });
```

Both samples were run against the test vector above: they accept it at `t`, accept a header whose first `v1` is
wrong and second is right, and refuse a one-byte body change and a `t` 301 seconds old.

---

### 9.5 Staff notifications and webhooks

The panel's bell (`backend/internal/notify`, the closed `notify.Catalogue`) and the partner webhooks are two separate
outboxes written from the same domain events; neither reads the other, and a partner's webhook goes out whatever the
business's staff notification preferences are.

| Staff notification code | Partner webhook |
|---|---|
| `handoff.raised` | `handoff.raised` |
| `payment.evidence_received` | `payment.evidence_received` |
| `order.confirmed` (status → `confirmed`) | `order.status_changed` with `to: "confirmed"` |
| `order.ready_to_pack` (status → `packing`) | `order.status_changed` with `to: "packing"` |
| `case.opened` | `case.opened` |
| `channel.disconnected` | `channel.disconnected` |
| `credit.exhausted` | `credit.exhausted` |
| `task.assigned`, `task.created`, `task.sla_breached`, `task.completed` | none: tasks have no partner route |
| `approval.requested`, `flow.staff_notified` | none: flow approvals and staff notices stay in the panel |
| `booking.changed` | none: bookings have no partner route |

The webhooks with no staff notification: `tenant.provisioned`, `channel.connected`, `channel.health_changed`,
`handoff.released`, `message.received`, `message.sent`, `order.created`, every other `order.status_changed`,
`case.updated`, `entitlements.changed`, `import.completed` and `ping`. There is no `notification.*` webhook that repeats
the bell (OD12) and no `booking.*` webhook (OD10).

## 10. A partner's first day

1. A Bizin operator creates the partner, sets its return origins and issues a key with the scopes it needs; the key is
   handed over once.
2. `GET /me` confirms the key, its scopes and its limits.
3. `POST /webhooks` with `["*"]`; store the `secret`; `POST /webhooks/{id}/ping` and check the delivery arrives and
   verifies.
4. On each seller signup: `POST /tenants` (store `tenant.id` for support), then either `POST …/owner/activation-link`
   (the owner will use the Bizin panel) or nothing (headless), then `POST …/connect-links` and send the seller to `url`.
5. Show status from `GET /tenants/{ext}` and `GET …/channels`, charts from `GET …/stats`, and react to webhooks.

## 11. v3.0 integration walkthrough (headless)

The whole path for one seller of a headless partner in the Iran market, in order. The key needs `tenants:provision`,
`tenants:read`, `channels:read`, `channels:connect`, `catalog:write`, `payments:write`, `assistant:write`,
`orders:read` and `webhooks:manage` (plus the matching `:read` scopes to show state back).

1. **Provision the business.** `POST /tenants` with `"market_profile": "ir"` and the reply language (§8.1). A
   headless partner never asks for the activation link; the owner stays `pending`.
2. **Connect the channels** (§8.9, §8.6):
   - WhatsApp: `POST …/channels/whatsapp`, then poll `GET …/channels/whatsapp/{channel_id}/pairing` and show each `qr`
     until `connected` (on `failed` or `expired`: `DELETE …/channels/{channel_id}` and start again);
   - Telegram: `POST …/channels/telegram` with the seller's bot token;
   - Instagram: `POST …/connect-links` and send the seller to `url`.
   `channel.connected` arrives for each; `GET …/channels` is the truth.
3. **Upsert the catalog.** `PUT …/products/{product_ext}` once per product, prices in whole Rial, `stock` set where the
   partner counts it (§8.10). `DELETE` archives a product the seller stops selling.
4. **Set the payment details.** `PUT …/payment-details` with the card number and/or IBAN and the holder's name
   (§8.11). The assistant sends these to a customer who orders.
5. **Turn the assistant on.** `PUT …/assistant` with `"enabled": true, "auto_reply": true`, the reply language and a
   short business description (§8.12). From now on the assistant answers the business's customers from the catalog.
6. **Receive `order.created`.** A customer orders in a conversation; the signed webhook carries `order_id`, `code`,
   `status` and `source` (§9).
7. **Read the order.** `GET …/orders/{order_id}` gives the items, totals, customer contact and payment state (§8.13);
   re-read it later for the status, and use `GET …/orders?since=…` to catch up after an outage.

## 12. Route status

All 73 operations have handlers. While `v3.entitlements.enforce` is off every feature and limit check passes; the
entitlement routes (8.19) answer from the stored contract either way. The onboarding-job and catalogue-job routes (8.18, 8.20) answer only while `v3.partner.bulk_jobs` is on
(registered off); an XLSX upload is read only while `v3.import.xlsx` is on (415 `file_format_unsupported` otherwise). The webhook routes (8.8) answer 501 `not_implemented` only on a server started
without its secrets keyring, where no endpoint secret could be sealed or opened; production runs with it. Connecting a
Telegram bot needs the `v3.channels.telegram` flag on for the business (503 `telegram_unavailable` otherwise). The
inbox routes (8.15: four reads, the media download, the image upload, and the reply, claim, release and queue move) answer only while `v3.partner.inbox` is on (registered off); the queue move, and the queue fields of the conversation object, also need `v3.handoff.queues` (registered off). The list's filters past `state`, `channel` and `since` need
`v3.inbox.filters` (registered off; 400 `filter_unavailable` while it is off).

Per business, and without hiding a route: approve, reject and mark-paid (8.16) answer 409 `payment_verification_off`
while `v3.orders.payment_verification` is off; the case and return-policy routes (8.14) answer 404 `not_found` while
`v3.returns.cases` is off; the channel read carries `health` and `channel.health_changed` is written only while
`v3.channels.health_partner` is on. The branding routes (8.21) are not behind `v3.branding`: you can read and write
your brand with it off, but what sellers and customers see follows the flag — with it off every business shows Bizin
on the seller screens, every logo id is 404, and the default disclosure is sent. "Registered off" is the code's default; the flags table of `PROJECT_OVERVIEW.md`
says which are on in production. The route list itself is `partnerapi.Routes` (`backend/internal/partnerapi/routes.go`),
and `contract_doc_test.go` fails when an operation is added to or missing from the OpenAPI file.
