# sepordi ↔ bizin seller feature-parity audit

Date: 2026-10-24. bizin read at `origin/main` 83ec1c8; sepordi at d91c74e (working tree, `deploy/deploy.sh` locally modified, not read).
Sources: bizin panel pages `frontend/app/(dashboard)/**`, `(print)/**`; panel API surface `backend/internal/auth/testdata/rbac_matrix.golden`
(every tenant route) and the module route files; partner API `backend/internal/partnerapi/routes.go:111-183` (73 routes) and
`docs/backend/partner-api.md`. sepordi paths are relative to the sepordi repo; bizin paths to bizin-v3 at `origin/main`.

Legend: ✅ done · 🟡 partial · ⛔ blocked, no partner route · ➖ not applicable to a white-label partner.

## 1. The matrix

### 1.1 Onboarding / account
| # | bizin capability (where) | sepordi | Notes |
|---|---|---|---|
| 1 | Register a business — `/register`, `backend/internal/auth/routes.go:15` | ✅ `src/server/signup/actions.ts:68` → `src/server/signup/provision.ts:67` (`createTenant`) | idempotent retry built in |
| 2 | Password login — `auth/routes.go:16` | ✅ `src/server/signup/sign-in.ts:40`; OTP login `sign-in.ts:71` (sepordi extra) | |
| 3 | Owner activation link / `/activate/[token]` — `partnerapi/routes.go:122`, `auth/routes.go:17` | ➖ | sepordi owns auth; using it would send the seller to bizin. Not wrapped in `src/server/bizin/client.ts` (deliberate). |
| 4 | Profile name/email — `PATCH /auth/me` `auth/routes.go:24` | ✅ `src/app/panel/settings/actions.ts:16` | local account |
| 5 | Change password — | ✅ `src/app/panel/settings/actions.ts:30`; end other sessions `:48` (extra) | |
| 6 | Several businesses per login — `auth/routes.go:25-26` (memberships, switch-tenant) | 🟡 | one shop per user (`members.shopFor`, `src/server/signup/actions.ts:28`). Fixable in sepordi. |
| 7 | Rename the business / seller legal profile (legal name, economic code, national id, address, logo, invoice footer) — `backend/internal/seller/routes.go:24-25`, `frontend/components/settings/seller-profile-form.tsx` | ⛔ | no `PATCH /tenants/{ext}` and no seller-profile route; name is fixed at `POST /tenants`. |
| 8 | Panel language / market — `auth/routes.go:35` | ➖ | sepordi is Farsi/IR; the assistant reply language is #33 |
| 9 | Simple/advanced display mode — `frontend/components/settings/display-mode-card.tsx` | ➖ | |
| 10 | Setup checklist on the dashboard | ✅ `src/components/panel/overview/setup-steps.ts:36-79` | |

### 1.2 Channels
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 11 | Channel list, status and health — `channel/routes.go:19`, channel health | ✅ `src/app/panel/channels/page.tsx:39`, reasons `src/components/panel/channels/channel-meta.ts:74-88` | |
| 12 | WhatsApp QR pairing — `channel/routes.go:21,27` | ✅ `src/app/panel/channels/actions.ts:23` (+ restart `:40`, poll `channels/whatsapp/[id]/pairing/route.ts:11`) | |
| 13 | Telegram bot — `telegram/routes.go:17` | ✅ `src/app/panel/channels/actions.ts:62` | |
| 14 | Instagram connect — `instagram/routes.go:46` | 🟡 `src/app/panel/channels/actions.ts:77-88` | **Sends the seller's browser to `https://www.bizin.app/connect/…`** (partner-api.md §8.6) and Meta's consent names bizin's app. Breaks "never send sellers to bizin". Needs a bizin change (row B3). |
| 15 | Instagram connect result | ✅ `src/app/panel/channels/instagram/return/page.tsx:54`, all 9 reasons `channel-meta.ts:127-141` | |
| 16 | Disconnect / delete — `channel/routes.go:28-29` | ✅ `src/app/panel/channels/actions.ts:50` | partner DELETE = disconnect+remove; bizin's "disconnect, keep" variant is not offered (minor) |

### 1.3 Inbox
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 17 | Conversation list + filters — `messaging/routes.go:23` | ✅ `src/app/panel/inbox/data/conversations/route.ts:8`, filters `src/components/panel/inbox/model.ts:155-162` | sepordi sends state/channel/queue/q only; contract also has priority, reason_class, status, has_order, intent, until (S8) |
| 18 | Thread, customer media — `messaging/routes.go:24`, `GET /media/{id}` | ✅ `src/app/panel/inbox/[id]/page.tsx:17`, `src/app/panel/media/[id]/route.ts:26` | |
| 19 | Human reply, text + image — `messaging/routes.go:26`, `POST /media` | ✅ `src/app/panel/inbox/actions.ts:61`, `src/app/panel/inbox/data/media/route.ts:11` | image on Instagram refused by bizin (`image_not_supported_on_channel`) for both surfaces |
| 20 | Take over / give back to AI — `ai/routes.go:31` | ✅ claim/release `src/app/panel/inbox/actions.ts:45,49` | |
| 21 | Turn AI back on for a customer who opted out — `ai/routes.go:31` | ⛔ | release answers 409 `customer_opted_out` "only the business can turn it back on, from its panel" (partner-api.md §4) |
| 22 | Move handoff queue — `messaging/routes.go:28` | ✅ `src/app/panel/inbox/actions.ts:53` | |
| 23 | Mark read / unread counts — `messaging/routes.go:27` | ⛔ | no route, no unread field in the partner `Conversation`. sepordi can approximate per user locally (S5). |
| 24 | Delete a conversation — `messaging/routes.go:29`, `frontend/components/inbox/conversation-delete-dialog.tsx` | ⛔ | |
| 25 | Message AI trace — `messaging/routes.go:25` | ➖ | operator diagnostic |
| 26 | Realtime — `GET /ws` `messaging/routes.go:32` | ✅ polling `src/components/panel/inbox/use-poll.ts` + webhooks | |
| 27 | Customer labels in the thread — `frontend/components/inbox/customer-labels.tsx` | ⛔ | see #71-73 |
| 28 | Link an Instagram post to a product from the thread — `frontend/components/inbox/content-link-action.tsx`, `catalog/routes.go:38-40` | ⛔ | |
| 29 | Booking cards in the thread — `frontend/components/inbox/booking-cards.tsx` | ⛔ in design | |
| 30 | Global search — `dashboard/routes.go:25` | ⛔ | sepordi has inbox `q` only |
| 31 | Order ↔ conversation links | ✅ `src/app/panel/orders/[id]/page.tsx:280-282`, `src/components/panel/inbox/thread-view.tsx:407` | |
| 32 | Who replied (agent attribution) | 🟡 | partner replies carry no actor (partner-api.md §8.15: "the key's scope is the authority"); sepordi keeps no local record (S9) |

### 1.4 AI assistant settings
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 33 | On/off, auto-reply, reply language, persona name — `ai/routes.go:24-25` | ✅ `src/app/panel/assistant/actions.ts:24`, `src/components/panel/assistant/assistant-form.tsx` | |
| 34 | Tone, handoff on low confidence, max replies per conversation, send product photos, confirm images, human-takeover minutes — `frontend/components/settings/ai-settings-form.tsx` | ⛔ | partner `PUT …/assistant` has only enabled, auto_reply, reply_language, persona_name, business_profile (partner-api.md §8.12) |
| 35 | Test the assistant (preview) — `ai/routes.go:26` | ⛔ | |
| 36 | AI usage — `ai/routes.go:27`, `ai-usage-card.tsx` | ⛔ | daily `automated_replies` counts in stats only |
| 37 | Product search names / aliases — `ai/routes.go:28`, `search-aliases-field.tsx` | ⛔ | "Search aliases and images are the seller's own fields: not in this shape" (partner-api.md §8.10) |
| 38 | Order automation (confirmation mode) — `orders/routes.go:28-29`, `order-automation-settings-card.tsx` | ⛔ | |
| 39 | Purchase recipe switch — `purchase-recipe-switch-card.tsx` | ⛔ | part of flows (#88-91) |
| 40 | Return policy | ✅ `src/app/panel/assistant/actions.ts:62` | bizin's panel has no page for it; sepordi is ahead |

### 1.5 Knowledge
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 41 | Business description | ✅ `src/components/panel/assistant/knowledge-editor.tsx`, `src/server/knowledge/draft.ts:13-30` | structured editor compiled into `business_profile` (4000 chars) |
| 42 | Knowledge sources (up to 500), bulk, entries, status, reindex — `knowledge/routes.go:24-33`, `/knowledge` | 🟡 | one 4000-char profile; no partner knowledge routes |
| 43 | Knowledge search test — `knowledge/routes.go:26` | ⛔ | |

### 1.6 Catalogue
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 44 | Product list | 🟡 `src/app/panel/products/page.tsx:61` | cursor only; no search/category/active filter (partner list has no `q`; S3) |
| 45 | Create / edit with variants, SKU, category, stock | ✅ `src/app/panel/products/actions.ts:13`, `src/components/panel/products/product-form.tsx` | stock overwrite race, S2 |
| 46 | Archive | ✅ `src/app/panel/products/actions.ts:36` | |
| 47 | Product images — `catalog/routes.go:34-35` | ✅ sepordi-hosted + import job `src/app/panel/products/[ext]/images/send/route.ts:25` | |
| 48 | Stock movement (relative) — `catalog/routes.go:29`, `stock-modal.tsx` | 🟡 | only absolute stock through `PUT`; no relative adjust/ledger |
| 49 | Bulk product import — `importer/routes.go:21-24` | ✅ `src/app/panel/products/import/page.tsx:85`, `upload/route.ts:20`, `actions.ts:48,59` | |
| 50 | Stock import / stocktake worksheet — `importer/routes.go:34-38`, `stocktake-modal.tsx` | 🟡 | catalogue import carries stock; no stock-only import/worksheet |
| 51 | Discounts — `catalog/routes.go:50-53`, `discounts-tab.tsx` | ⛔ | |
| 52 | Content links (product ↔ posts, reels, stories) — `catalog/routes.go:38-45` | ⛔ | |

### 1.7 Orders, payments, invoices, shipping
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 53 | Order list + filters | ✅ `src/app/panel/orders/page.tsx:34`, `src/components/panel/orders/orders-filters.tsx` | no search by code/customer (no `q` on partner list) |
| 54 | Order detail | ✅ `src/app/panel/orders/[id]/page.tsx:38` | |
| 55 | **Shipping address on the order** — `order-detail.tsx`, `address-modal.tsx` | ⛔ | partner order: "Never in the answer: the shipping address" (partner-api.md §8.13). Seller cannot ship from sepordi. |
| 56 | Edit items / address — `orders/routes.go:37-38` | ⛔ | sepordi shows "به‌زودی" `src/app/panel/orders/[id]/page.tsx:166-167` |
| 57 | Manual order — `orders/routes.go:35`, `order-create-modal.tsx` | ⛔ | |
| 58 | Confirm an AI draft (draft → confirmed) — `docs/backend/orders.md:86`, `ai-draft-band.tsx` | ⛔ | partner status accepts packing/shipped/delivered/cancelled only (§8.16) |
| 59 | Fulfilment moves | ✅ `src/app/panel/orders/actions.ts:39` | |
| 60 | Carrier + tracking code — `orders/routes.go:46`, `orders/handlers.go:186-189` | ⛔ | |
| 61 | Receipts: view, approve, reject, mark paid | ✅ `src/app/panel/orders/actions.ts:44,49,67`, `src/app/panel/evidence/[orderId]/[evidenceId]/route.ts:26` | |
| 62 | Invoice — `orders/routes.go:44-45`, `(print)/orders/[id]/invoice/print` | ⛔ | needs address (#55) and legal profile (#7) |
| 63 | Shipping label — `orders/routes.go:46-47`, `(print)/orders/[id]/label/print` | ⛔ | |
| 64 | Card-to-card payment details | ✅ `src/app/panel/payments/actions.ts:26` | |
| 65 | Shipping rules | ✅ `src/app/panel/shipping/actions.ts:9` | |
| 66 | Verification queue on the dashboard | ✅ `src/components/panel/overview/sections.tsx:170-190` | |

### 1.8 Returns and privacy requests
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 67 | Return/complaint cases: list, detail, photos, decisions | ✅ `src/app/panel/returns/page.tsx:25`, `[id]/page.tsx:35`, `actions.ts:35`, `case-photos/[caseId]/[photoId]/route.ts:22` | bizin's panel has no cases page; sepordi is ahead |
| 68 | Customer privacy/data requests — `privacy/http.go:92-93` | ⛔ | |

### 1.9 Customers
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 69 | Customer list / detail — `customers/routes.go:20-21`, `/customers` | ⛔ | |
| 70 | Tags — `customers/routes.go:22-24` | ⛔ | |
| 71 | Notes — `customers/routes.go:25-26` | ⛔ | |

### 1.10 Booking / calendar
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 72 | Booking setup: services, resources, schedules, categories, exceptions — `booking/routes.go:24-49`, `/calendar/setup` | ⛔ in design | |
| 73 | Bookings: list, approve/reject, payment, cancel, complete, no-show, reschedule — `booking/routes.go:53-66`, `/calendar/bookings` | ⛔ in design | |
| 74 | Business hours, holidays, day overrides — `calendar/routes.go:22-30`, `/calendar` | ⛔ in design | hours exist only as free text in the knowledge editor |

### 1.11 Team
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 75 | Members and roles — `team/handlers.go:405-406` | 🟡 `src/server/team/team.ts:21-86` | sepordi-local, owner/agent only; bizin has manager, sales, support, accountant, payment_verifier, fulfillment, reception, content_manager, analyst (S6) |
| 76 | Invitations | ✅ `src/app/panel/settings/team/actions.ts:18,24` | by phone |
| 77 | Transfer ownership — `team/handlers.go:408` | ✅ `src/app/panel/settings/team/actions.ts:29` | several owners allowed, last-owner guard `team.ts:65` |
| 78 | Agent availability (handoff routing) — `team/handlers.go:407` | ⛔ | |
| 79 | Tasks — `team/handlers.go:413-418`, `/tasks` | ⛔ | |
| 80 | Approvals — `team/handlers.go:420-423` | ⛔ | |

### 1.12 Credit / billing
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 81 | Credit balance — `billing/routes.go:18` | 🟡 `src/components/panel/credit/sections.tsx:22-40` | ok/exhausted only ("a state, never a balance", partner-api.md §8.3) |
| 82 | Buy credit — `billing/routes.go:21-24` | 🟡 `src/app/panel/credit/actions.ts:24,31` | Zarinpal/card-to-card in sepordi; a bizin operator posts the credit by hand (`src/server/credit/orders.ts:11`, D1) |
| 83 | Statement / ledger — `billing/routes.go:20` | ⛔ | |
| 84 | Low-credit warning | ⛔ | "There is no `credit.low` in v1" (partner-api.md §9) |
| 85 | Credit-exhausted alert | ✅ `src/server/notifications/events.ts` (`credit.exhausted`) | |

### 1.13 Flows / automation / connectors
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 86 | Flow graphs, system flows, versions, runs — `flows/engine/http.go:27-44`, `/flows`, `/flows/system` | ⛔ | |
| 87 | Flow recipes — `flowrecipes/http.go:19-21` | ⛔ | |
| 88 | Forms — `flowforms/http.go:26-31` | ⛔ | |
| 89 | Connectors and internal-API grants — `connectors/handlers.go:25-37`, `businessapi/handlers.go:27-29`, `/connectors` | ⛔ | developer-level |

### 1.14 Insights / dashboard
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 90 | Dashboard KPIs — `dashboard/routes.go:21` | ✅ `src/components/panel/overview/stats-view.tsx` (`getTenantStats`) | |
| 91 | Handoff widget — `dashboard/routes.go:22` | ✅ `src/components/panel/overview/sections.tsx:180` | |
| 92 | Activity feed — `frontend/components/dashboard/activity-feed.tsx` | 🟡 | notification bell only |
| 93 | Instagram insights, recommendations, goal, plan — `insights/routes.go:37-44`, `handlers_goals.go:68-72`, `handlers_recommendations.go:96-97` | ⛔ | also waits on Meta App Review |

### 1.15 Notifications
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 94 | In-app list, read, read-all — `team/handlers.go:424-426` | ✅ `src/server/notifications/events.ts:44-155`, `src/components/panel/notifications/notification-bell.tsx`, `src/app/api/notifications/route.ts:5` | from bizin webhooks |
| 95 | Preferences and shop defaults — `notify/handlers.go:38-41` | 🟡 | none in sepordi (bizin offers in-app only, `notify/prefs.go:29`) (S4) |
| 96 | Events surfaced | 🟡 | only 8 of the documented types; not `order.status_changed`, `case.updated`, `handoff.released`, `message.received`, `channel.connected` (S4) |

### 1.16 Security / privacy
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 97 | Two-factor (TOTP, recovery codes, step-up) — `auth/routes.go:27-32`, `/settings/security` | 🟡 | password + SMS OTP login, no second factor (S7) |
| 98 | Activity log — `audit/http.go:53`, `/settings/activity` | ⛔ | sepordi can log its own actions (S9) |
| 99 | Sessions | ✅ `src/app/panel/settings/actions.ts:48` | sepordi extra |

### 1.17 Instagram comments
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 100 | Comment inbox, counts, detail — `comments/routes.go:16-18`, `/inbox/comments` | ⛔ | marketing says so honestly (`src/app/(marketing)/features/page.tsx:18`) |
| 101 | Public reply, private DM reply, status — `comments/routes.go:19-21` | ⛔ | |

### 1.18 Settings (remaining)
| # | bizin capability | sepordi | Notes |
|---|---|---|---|
| 102 | `/settings/shipping` | ✅ `/panel/shipping` | |
| 103 | `/settings` AI usage, order automation, recipe switch, seller profile | ⛔ | see #7, #36, #38, #39 |

**Counts (rows 1-102; #103 is a roll-up):** ✅ 40 · 🟡 14 · ⛔ 44 (4 of them "in design": 29, 72-74) · ➖ 4.

### 1.19 Partner-route coverage (all 73 routes)
- 71 routes are wrapped in `src/server/bizin/client.ts` and called from a page, action or route handler (seller panel or `src/app/admin/**`).
- **`getMessage` (`GET …/conversations/{id}/messages/{message_id}`) is wrapped at `src/server/bizin/client.ts:269` and called nowhere.**
- `POST …/owner/activation-link` (`partnerapi/routes.go:122`) is not wrapped: ➖, it would send the seller to bizin.
- Partner-admin routes (webhooks ×8, branding ×4, onboarding jobs ×6, entitlements ×3, `/me`, `GET /tenants`) are used by `src/app/admin/**`: ➖ for seller parity.
- `GET/PUT …/entitlements` are used by staff only; the seller panel never reads them (S1).
- Every error code in partner-api.md §4 has a Farsi line in `src/server/bizin/errors-fa.ts`; import row codes in `src/components/panel/products/catalog.ts:313-342`.

## 2. ⛔ items that need new bizin partner routes (ranked by seller value)
| Rank | Need | bizin panel source | Rows |
|---|---|---|---|
| B1 | Shipping address in `GET …/orders/{id}`, plus carrier + tracking code on `…/status` (shipped) | `orders/routes.go:38,46`; `orders/handlers.go:186-189` | 55, 60 |
| B2 | Confirm a draft order, edit items/address, create a manual order | `orders/routes.go:35,37,38`; `docs/backend/orders.md:86` | 56, 57, 58 |
| B3 | Instagram connect without the `www.bizin.app/connect` hop (partner-domain connect page, or a link that starts Meta OAuth directly) | `instagram/routes.go:46,71-72`; partner-api.md §8.6 | 14 |
| B4 | Customers: list, detail, tags, notes | `customers/routes.go:20-26` | 27, 69-71 |
| B5 | Assistant: tone, handoff on low confidence, max replies, send product photos, confirm images, takeover minutes; preview/test chat | `ai/routes.go:24-26` | 34, 35 |
| B6 | Credit: balance, statement, usage, a `credit.low` event (top-up stays manual, D1) | `billing/routes.go:18-20`; `ai/routes.go:27` | 36, 81, 83, 84 |
| B7 | Invoice + shipping label payloads; seller legal profile and business rename | `orders/routes.go:44-47`; `seller/routes.go:24-25` | 7, 62, 63 |
| B8 | Inbox: mark read + unread count, delete conversation, turn AI back on for an opted-out customer | `messaging/routes.go:27,29`; `ai/routes.go:31` | 21, 23, 24 |
| B9 | Knowledge sources (CRUD, bulk, status, reindex, search test) | `knowledge/routes.go:24-33` | 42, 43 |
| B10 | Discounts | `catalog/routes.go:50-53` | 51 |
| B11 | Search aliases, relative stock movement, stock import/worksheet, `q` on products and orders lists | `ai/routes.go:28`; `catalog/routes.go:29`; `importer/routes.go:34-38` | 37, 44, 48, 50, 53 |
| B12 | Order automation (confirmation mode) | `orders/routes.go:28-29` | 38 |
| B13 | Instagram comments | `comments/routes.go:16-21` | 100, 101 |
| B14 | Booking + business calendar — **in design** | `booking/routes.go:24-66`; `calendar/routes.go:22-30` | 29, 72-74 |
| B15 | Privacy/data requests | `privacy/http.go:92-93` | 68 |
| B16 | Content links (product ↔ posts) | `catalog/routes.go:38-45` | 28, 52 |
| B17 | Agent availability, tasks, approvals; reply actor attribution | `team/handlers.go:407,413-423` | 32, 78-80 |
| B18 | Instagram insights (also waits on Meta App Review) | `insights/routes.go:37-44` | 93 |
| B19 | Flows, recipes, forms, connectors | `flows/engine/http.go:27-44`; `flowrecipes/http.go:19-21`; `flowforms/http.go:26-31`; `connectors/handlers.go:25-37` | 39, 86-89 |
| B20 | Global search, audit events | `dashboard/routes.go:25`; `audit/http.go:53` | 30, 98 |

## 3. 🟡 items and bugs sepordi can fix today (prioritized)
| Rank | Item | Where | Fix |
|---|---|---|---|
| S1 | The seller panel ignores entitlements. Entitlement-gated routes answer 403 `feature_not_entitled` (partner-api.md §8.19), but the pages show a generic load error and the nav still lists them. Returns handles only the 404 "off" case. | `src/app/panel/shipping/page.tsx:28`; `src/app/panel/returns/page.tsx:55-57`; `src/app/panel/orders/[id]/page.tsx:177`; inbox `src/app/panel/inbox/_lib/respond.ts:22`; `src/components/panel/shell/nav.ts:66-69` | read `getShopEntitlements` once per request; hide nav items; render a "not in your plan" state linking to `/panel/credit` |
| S2 | Stock overwrite race. `saveProductAction` PUTs the stock the form loaded; a sale between load and save is undone ("a PUT built before a sale overwrites that sale's decrement", §8.10). | `src/app/panel/products/actions.ts:13-31` | re-read `getProduct` just before the PUT and keep the live level for variants whose stock the seller did not touch; warn on conflict |
| S3 | No product search/filter | `src/app/panel/products/page.tsx:21-61` | client-side search/category/active filter over the paged list |
| S4 | Notifications: no preferences, and 5 useful webhook types dropped | `src/server/notifications/events.ts:44` | add `handoff.released`, `order.status_changed`, `case.updated`, `message.received`, `channel.connected`; per-user mute settings |
| S5 | No unread markers in the inbox | `src/components/panel/inbox/conversation-list.tsx` | per-user last-seen vs `last_message_at`, stored locally |
| S6 | Two roles only | `src/server/team/team.ts:21` | add accountant / payment verifier / fulfilment style roles mapped to the page set |
| S7 | No second factor for owners | `src/server/auth/*` | TOTP for owner accounts |
| S8 | Inbox filters not exposed | `src/components/panel/inbox/model.ts:155-185` | priority, reason_class, status (open/snoozed/closed), has_order, until |
| S9 | No record of which team member replied, approved a receipt, or moved an order | `src/app/panel/inbox/actions.ts:61`; `src/app/panel/orders/actions.ts:39-67` | local audit table + an activity view (also fills #92) |
| S10 | "به‌زودی" promise for order editing, which is blocked on bizin (B2) | `src/app/panel/orders/[id]/page.tsx:166-167` | reword or remove until the route exists |
| S11 | `getMessage` is wrapped and never used | `src/server/bizin/client.ts:269` | use it to refresh a sent message's delivery status, or drop it |
| S12 | Dead code with fake product copy (plans, «گزارش پیشرفته», «دامنه‌ی اختصاصی») | `src/components/templates/*` (12 files, imported nowhere) | delete |
| S13 | One shop per account | `src/server/signup/actions.ts:28` | multi-shop membership + shop switcher (`createTenant` already allows more `ext`s) |

Checked with nothing found: seller-facing copy names bizin or an "advanced panel" (bizin appears only in staff `src/app/admin/**` and code comments); dead internal links (every `href` target exists, `public/templates/products.{csv,xlsx}` exist); unmapped contract error codes.
