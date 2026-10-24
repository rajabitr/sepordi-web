# sepordi.ir — operations runbook

Connection details for the VM live only in the git-ignored `server.txt` (HOST, PORT, USER, PASSWORD). Never commit or print it.

## Topology
- **Request path:** visitors → CDN (MizbanCloud, TLS ends here: "flexible" SSL) → `http://<public-ip>:491` → the provider router DST-NATs it to the VM's port 3000.
- **The VM:**
  - Ubuntu 24.04, 2 vCPU, 1.9 GB RAM.
  - Node 24 at `/opt/node`. No TLS and no reverse proxy on the VM.
  - SSH: public port 490 → VM 22. It only works from an Iranian IP or with the Mac's VPN off, and is often filtered from abroad.
- **The app:**
  - systemd `sepordi-web`, user `sepordi`, `WorkingDirectory=/opt/sepordi/current`, a symlink to `/opt/sepordi/releases/<stamp>-<sha>`.
  - Env: `/etc/sepordi/env` (640 root:sepordi).
  - Data: `/var/lib/sepordi` (SQLite `sepordi.db`, `media/`, `backups/`).
- **The CDN rewrites headers:** it replaces our `Content-Security-Policy` with `upgrade-insecure-requests`. The origin sends the right CSP. To fix it, turn off the CDN's CSP / "upgrade insecure requests" injection.

## Deploy = push to `main` (CI/CD; never from a laptop)
1. GitHub Actions `.github/workflows/deploy.yml` runs `npm ci`, tsc, eslint, vitest and `next build`, then `deploy/package.sh`, then force-pushes `release.tgz` + `manifest.json` to the orphan branch `deploy`.
2. The VM's timer `sepordi-pull-deploy.timer` (every 60 s, as root) runs `/usr/local/sbin/sepordi-pull-deploy`:
   - fetches `deploy` with the read-only deploy key `/root/.ssh/sepordi_deploy` (GitHub title "sepordi-vm-deploy (read-only)");
   - verifies the sha256;
   - backs up the DB (`VACUUM INTO /var/lib/sepordi/backups/pre-<sha>-<stamp>.db`);
   - switches the symlink, restarts, and health-checks `/api/health` until it reports the new version;
   - on failure, rolls back and records the sha in `/var/lib/sepordi-deploy/failed-shas`.
3. The workflow's `verify` job polls `https://sepordi.ir/api/health` until `version` equals the commit.

**Status:**
- the Actions run;
- `https://sepordi.ir/api/health` (shows `version`);
- on the VM: `journalctl -u sepordi-pull-deploy -n 50` and `/var/lib/sepordi-deploy/status.json`.

**Roll back:** Actions → "deploy" → Run workflow with `ref` = an older commit.

**Retry a sha the VM marked failed:** remove it from `/var/lib/sepordi-deploy/failed-shas` (needs SSH), or push a new commit.

## Backups
- **Daily:** `sepordi-backup.timer` runs at 22:30 UTC as user `sepordi` and writes `VACUUM INTO /var/lib/sepordi/backups/daily-<stamp>.db`, keeping the newest 14. Sources: `deploy/backup/`. Installed 2026-10-24.
- **Before every deploy:** the pull agent writes `pre-<sha>-<stamp>.db`.
- **Not covered yet:** media files are not copied, and nothing leaves the VM. An off-site target is still an owner decision.

## Server admin (needs SSH, so only from an Iranian IP / VPN off)
- `deploy/set-env.sh NAME=@file|value|@random` sets env values without printing them, then restart `sepordi-web`.
- `deploy/create-admin.sh 09xxxxxxxxx` creates a staff admin. The password goes only into the local `admin-login.secret.txt`.
- `deploy/provision.sh` sets up the VM once (Node, unit, dirs).
- Restore a DB backup: stop `sepordi-web`, copy the backup over `/var/lib/sepordi/sepordi.db` (remove `-wal`/`-shm`), start it.

## bizin side
- **Partner `sepordi`:** key `<partner-key-id>`, 27 scopes, **expires 2027-10-20** (rotate before then; the operator does it in bizin). The key is in `/etc/sepordi/env` as `BIZIN_PARTNER_KEY` and locally in `~/.sepordi/partner-key`.
- **Webhook:** `5db85d67-…` → `https://sepordi.ir/api/bizin/webhook`, all events. Its secret is in `BIZIN_WEBHOOK_SECRETS`.
- **Booking:** the routes are not live yet. The contract is in bizin `docs/handover/2026-10-24-partner-booking-api.md`. sepordi shows «به‌زودی» until bizin ships them; the key then needs the `booking:read`/`booking:write` scopes.

## Env names on the VM
`BIZIN_API_BASE`, `BIZIN_PARTNER_KEY`, `BIZIN_WEBHOOK_SECRETS`, `SESSION_SECRET`, `PUBLIC_BASE_URL`.

Still to set when available: `KAVENEGAR_API_KEY`, `KAVENEGAR_TEMPLATE` (OTP), `ZARINPAL_MERCHANT_ID`, `SEPORDI_ADMIN_PHONES`.
