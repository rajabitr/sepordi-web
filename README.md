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

### Notices

UI components come from [VibeFarsi](https://vibefarsi.ir) (MIT). See `THIRD_PARTY_NOTICES.md`.
