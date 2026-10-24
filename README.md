# سپردی (sepordi-web)

سپردی دستیار هوشمند فروش برای فروشنده‌های ایرانی است: به پیام مشتری‌ها در واتس‌اپ، اینستاگرام و تلگرام از روی کاتالوگ خود فروشگاه جواب می‌دهد، گفت‌وگو را در لحظه‌ی لازم به فروشنده می‌سپارد، پیش‌نویس سفارش می‌نویسد و رسید کارت‌به‌کارت را برای تأیید فروشنده کنار می‌گذارد. همه‌ی این کارها از طریق Partner API بیزین انجام می‌شود؛ این مخزن سایت و پنل فروشنده‌ی سپردی است.

---

## Developer notes (English)

Next.js 16 App Router (`src/`, `proxy.ts`, Cache Components on), React 19, TypeScript strict, Tailwind v4,
VibeFarsi components, `node:sqlite`, no native dependencies (the macOS build runs on Linux). Node ≥ 22.13.

### Run it

```bash
cp .env.example .env.local      # set BIZIN_MODE=mock for local work
npm install
npm run dev                     # http://localhost:3000
```

Scripts: `dev`, `build`, `start`, `lint` (`eslint . --max-warnings=0`), `typecheck`, `test` (`vitest run`),
`gen:bizin` (regenerates `src/server/bizin/types.ts` from `docs/bizin/openapi-v1.yaml`).

### Environment

See `.env.example` (names only). `BIZIN_PARTNER_KEY` and `BIZIN_WEBHOOK_SECRETS` are server secrets: they never
reach the browser and never go in a `NEXT_PUBLIC_` variable.

### Mock mode

`BIZIN_MODE=mock` swaps the Partner API transport for an in-memory Bizin (`src/server/bizin/mock/`) with two demo
shops (`demo-nila`, `demo-rasta`), products, conversations, orders with receipts, cases, stats, webhooks and
branding. Writes change the in-memory state (kept across dev hot reloads, lost on restart). WhatsApp pairing goes
pending → rotating QR → connected over four polls. Mock mode is only ever selected by that explicit setting; without
it the real API is used and a missing `BIZIN_PARTNER_KEY` is an error.

In development with mock mode the DB seeds two accounts (`src/server/db/seed.ts`): seller `09120000001` (shop
`demo-nila`) and admin `09120000000`, password `sepordi-demo`. Login OTP codes are printed to the server console
in development.

### The one rule: `ext` only from the session

The partner key can read and change **every** shop of the partner. A seller's `external_business_id` therefore
comes only from their own DB row: `const { shop } = await requireSeller()` then `bizin.getOrder(shop.external_business_id, id)`.
Never take an `ext`, shop id or tenant id from a URL, form field, body, header or cookie. Media, receipts and case
photos are proxied by our route handlers behind the same check and are never cached.

### Folder map

```
src/
  app/
    layout.tsx, not-found.tsx, error.tsx, manifest.ts, icon.png, apple-icon.png
    (marketing)/   public site            (auth)/   login, register
    panel/         seller panel           admin/    sepordi staff
    api/           route handlers (media proxy, webhook receiver, …)
  proxy.ts         optimistic cookie gate for /panel and /admin
  components/
    ui blocks charts animations backgrounds templates sites   VibeFarsi (copied in, MIT)
    brand/         Logo, ErrorScreen
    panel/shell/   panel sidebar, topbar, bottom nav, session gate
    marketing/  panel/  admin/   page components per area
  server/          server-only code ("server-only" import)
    bizin/         typed Partner API client, errors-fa, mock
    auth/          sessions, passwords, OTP, rate limits
    db/            node:sqlite, migrations, repositories
    webhooks/      Bizin-Signature verification
    http/          client IP
  lib/             shared helpers: money (Rial↔Toman), date (Jalali), phone, VibeFarsi utils
docs/              Bizin Partner API contract, VibeFarsi guides
brand/source/      owner's logo files (PNG, JPG, PSD)
public/brand/      traced SVG logos and app icons
```

### Deploy (CI/CD)

Nothing deploys from a laptop (`deploy/deploy.sh` only says so). A push to `main` runs `.github/workflows/deploy.yml`:
type check, lint, tests, `npm run build`, `deploy/package.sh`, then a force-push of one orphan commit
(`release.tgz`, `manifest.json`, and `env.enc` when present) to the `deploy` branch. The VM sits behind NAT, so it
pulls: `sepordi-pull-deploy.timer` runs `deploy/server/sepordi-pull-deploy.sh` every minute, which fetches that branch
over SSH with a read-only deploy key, checks the sha256, extracts to `/opt/sepordi/releases/<stamp>-<sha>`, backs up
the database (`VACUUM INTO /var/lib/sepordi/backups/pre-<sha>-<stamp>.db`, newest 10 kept) before every switch,
switches `/opt/sepordi/current`, restarts and waits for `/api/health` to report the new sha. A release that fails is
rolled back and never retried; ship a fix (or an empty commit) to try again. The newest 3 releases are kept.

- **Roll back:** Actions → `deploy` → Run workflow with `ref` = an older commit or tag. The env bundle always comes
  from `main`, so a rollback never restores old env values.
- **Status:** the Actions run (its `verify` job waits up to 6 minutes for `https://sepordi.ir/api/health` to report
  the built sha), the `version` in `/api/health`, and on the VM `journalctl -u sepordi-pull-deploy` and
  `/var/lib/sepordi-deploy/status.json` / `env-status.json`.
- **First setup on the VM (once, as root):** `bash deploy/server/install-pull-deploy.sh`. Add the printed public key
  as a read-only deploy key on the repo and commit the printed cert as `deploy/env-cert.pem`.

**Env changes** travel the same way, sealed to the VM's key. On any laptop with OpenSSL 3:

```bash
deploy/encrypt-env.sh KAVENEGAR_API_KEY=@~/kavenegar.txt PUBLIC_BASE_URL=https://sepordi.ir
git add deploy/env.enc && git commit -m "chore(env): …" && git push
```

Only `KAVENEGAR_API_KEY KAVENEGAR_TEMPLATE ZARINPAL_MERCHANT_ID ZARINPAL_SANDBOX SEPORDI_ADMIN_PHONES
BIZIN_PARTNER_KEY BIZIN_WEBHOOK_SECRETS PUBLIC_BASE_URL` are accepted, values are single lines, and `NAME=@file`
keeps a secret out of shell history. Each run **replaces** `env.enc` with exactly the keys given: keys left out keep
their current value on the VM, `NAME=` sets an empty one. The VM merges the bundle into `/etc/sepordi/env` (other
keys untouched), restarts and health-checks; if the app does not come up, the previous env is restored. A bundle
that fails to decrypt or validate is logged and skipped; code deploys carry on. Values are never logged.

### Notices

UI components come from [VibeFarsi](https://vibefarsi.ir) (MIT). See `THIRD_PARTY_NOTICES.md`.
