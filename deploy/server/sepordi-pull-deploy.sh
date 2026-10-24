#!/usr/bin/env bash
# Pull-deploy for sepordi.ir, run as root every 60 s by sepordi-pull-deploy.timer (installed as
# /usr/local/sbin/sepordi-pull-deploy). CI publishes each release as the only commit of the orphan `deploy`
# branch: release.tgz + manifest.json, plus env.enc when the repo carries a sealed env bundle. The VM sits
# behind NAT, so it fetches that branch instead of being pushed to.
set -euo pipefail

STATE=/var/lib/sepordi-deploy
REPO="$STATE/repo.git"
REMOTES=(git@github.com:rajabitr/sepordi-web.git ssh://git@ssh.github.com:443/rajabitr/sepordi-web.git)
RELEASES=/opt/sepordi/releases
CURRENT=/opt/sepordi/current
DB=/var/lib/sepordi/sepordi.db
BACKUPS=/var/lib/sepordi/backups
ENV_FILE=/etc/sepordi/env
ENV_KEY=/root/.config/sepordi/env-key.pem
ENV_CERT=/root/.config/sepordi/env-cert.pem
NODE=/opt/node/bin/node
SERVICE=sepordi-web
HEALTH_URL=http://127.0.0.1:3000/api/health
HEALTH_TIMEOUT=45
KEEP_RELEASES=3
KEEP_BACKUPS=10
# Keep in step with deploy/encrypt-env.sh.
ENV_ALLOWED="KAVENEGAR_API_KEY KAVENEGAR_TEMPLATE ZARINPAL_MERCHANT_ID ZARINPAL_SANDBOX SEPORDI_ADMIN_PHONES BIZIN_PARTNER_KEY BIZIN_WEBHOOK_SECRETS PUBLIC_BASE_URL"

export GIT_SSH_COMMAND='ssh -i /root/.ssh/sepordi_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=20'

sha="" short="" newdir="" prev="" switched=""

log() { echo "$*"; }

json_field() { # $1 = key; JSON on stdin; prints "" for a missing key, null or unparsable input
  "$NODE" -e '
    let v;
    try { v = JSON.parse(require("fs").readFileSync(0, "utf8"))[process.argv[1]]; } catch { v = undefined; }
    process.stdout.write(v === undefined || v === null ? "" : String(v));' "$1"
}

write_json() { # $1 = target file; the fields come from the J_* environment variables
  "$NODE" -e '
    const e = process.env, o = {};
    for (const k of Object.keys(e).filter((k) => k.startsWith("J_")).sort()) o[k.slice(2).toLowerCase()] = e[k];
    o.at = new Date().toISOString();
    require("fs").writeFileSync(process.argv[1] + ".tmp", JSON.stringify(o) + "\n");' "$1" &&
    mv -f "$1.tmp" "$1"
}

status() { # $1 = deployed|failed|unchanged, $2 = message
  J_SHA="$sha" J_STATE="$1" J_MESSAGE="$2" write_json "$STATE/status.json" || true
}

sha256_of() { sha256sum "$1" | cut -d' ' -f1; }

point() { # atomic switch of the `current` symlink
  ln -sfn "$1" "$CURRENT.next" && mv -fT "$CURRENT.next" "$CURRENT"
}

wait_healthy() { # $1 = expected version, or empty for any healthy answer
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) body
  while :; do
    body="$(curl -fsS -m 3 "$HEALTH_URL" 2>/dev/null || true)"
    if [ -n "$1" ]; then
      [ "$(printf '%s' "$body" | json_field version)" = "$1" ] && return 0
    else
      [ "$(printf '%s' "$body" | json_field ok)" = "true" ] && return 0
    fi
    [ "$SECONDS" -ge "$deadline" ] && return 1
    sleep 1
  done
}

# --- sealed env bundle ------------------------------------------------------------------------------------

decrypt_env() { # $1 = env.enc; plaintext to stdout, never to disk
  openssl cms -decrypt -binary -inform DER -inkey "$ENV_KEY" -recip "$ENV_CERT" -in "$1"
}

merge_env() { # plaintext bundle on stdin; $1 = current env file, $2 = output file (pre-created with its mode)
  # Prints the merged names. Errors name a key at most, never a value.
  ENV_ALLOWED="$ENV_ALLOWED" "$NODE" -e '
    const fs = require("fs");
    const [envPath, outPath] = process.argv.slice(1);
    const allowed = new Set(process.env.ENV_ALLOWED.split(" "));
    const fail = (msg) => { process.stderr.write(`env bundle refused: ${msg}\n`); process.exit(1); };
    const next = new Map();
    for (const line of fs.readFileSync(0, "utf8").split("\n")) {
      if (line === "") continue;
      const i = line.indexOf("=");
      const name = i > 0 ? line.slice(0, i) : "";
      if (!/^[A-Z][A-Z0-9_]*$/.test(name)) fail("a line is not NAME=value");
      if (!allowed.has(name)) fail(`${name} is not an allowed name`);
      if (next.has(name)) fail(`${name} appears twice`);
      const value = line.slice(i + 1);
      if (/[\r\0]/.test(value)) fail(`${name} is not a single line`);
      next.set(name, value);
    }
    if (next.size === 0) fail("empty bundle");
    let existing = [];
    try { existing = fs.readFileSync(envPath, "utf8").split("\n"); } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (existing.at(-1) === "") existing.pop();
    const out = [], done = new Set();
    for (const line of existing) {
      const i = line.indexOf("=");
      const name = i > 0 && !line.trimStart().startsWith("#") ? line.slice(0, i) : "";
      if (next.has(name)) {
        if (!done.has(name)) out.push(`${name}=${next.get(name)}`);
        done.add(name);
        continue;
      }
      out.push(line);
    }
    for (const [name, value] of next) if (!done.has(name)) out.push(`${name}=${value}`);
    fs.writeFileSync(outPath, out.join("\n") + "\n");
    process.stdout.write([...next.keys()].join(" "));' "$1" "$2"
}

env_status() { # $1 = env sha256, $2 = applied|failed, $3 = message
  J_ENV_SHA="$1" J_STATE="$2" J_MESSAGE="$3" write_json "$STATE/env-status.json" || true
}

env_failed() { # $1 = env sha256, $2 = message
  echo "$1" > "$STATE/env-failed-sha"
  log "ENV FAILED ${1:0:12}: $2"
  env_status "$1" failed "$2"
}

apply_env() { # $1 = deploy commit, $2 = env.enc sha256 from the manifest. Failures never stop a code deploy.
  local want="$2" enc tmp names
  [ "$want" = "$(cat "$STATE/env-sha" 2>/dev/null || true)" ] && return 0
  [ "$want" = "$(cat "$STATE/env-failed-sha" 2>/dev/null || true)" ] && return 0
  enc="$(mktemp "$STATE/env.XXXXXX")" || { env_failed "$want" "cannot create a temp file"; return 1; }
  if ! git -C "$REPO" cat-file blob "$1:env.enc" > "$enc" || [ "$(sha256_of "$enc")" != "$want" ]; then
    rm -f "$enc"; env_failed "$want" "env.enc missing or its sha256 does not match the manifest"; return 1
  fi
  tmp="$(dirname "$ENV_FILE")/.env.next"
  if ! install -m 640 -o root -g sepordi /dev/null "$tmp"; then
    rm -f "$enc"; env_failed "$want" "cannot create $tmp"; return 1
  fi
  if ! names="$(decrypt_env "$enc" | merge_env "$ENV_FILE" "$tmp")"; then
    rm -f "$enc" "$tmp"; env_failed "$want" "decrypt or validation failed"; return 1
  fi
  rm -f "$enc"
  if [ -f "$ENV_FILE" ]; then cp -p "$ENV_FILE" "$ENV_FILE.prev"; fi
  mv -f "$tmp" "$ENV_FILE" || { rm -f "$tmp"; env_failed "$want" "cannot replace $ENV_FILE"; return 1; }
  if systemctl restart "$SERVICE" && wait_healthy ""; then
    echo "$want" > "$STATE/env-sha"
    log "env applied (${names})"
    env_status "$want" applied "merged ${names}"
    return 0
  fi
  if [ -f "$ENV_FILE.prev" ]; then mv -f "$ENV_FILE.prev" "$ENV_FILE"; fi
  systemctl restart "$SERVICE" || true
  env_failed "$want" "service unhealthy with the new env (${names}); previous env restored"
  return 1
}

# --- code release -----------------------------------------------------------------------------------------

fail() { # $1 = message; marks the sha failed, rolls the symlink back when it was switched
  local msg="$1"
  if [ -n "$switched" ] && [ -n "$prev" ]; then
    { point "$prev" && systemctl restart "$SERVICE"; } || true
    msg="$msg; rolled back to $(basename "$prev")"
  fi
  if [ -n "$newdir" ] && [ "$(readlink -f "$CURRENT" 2>/dev/null || true)" != "$newdir" ]; then rm -rf "$newdir"; fi
  echo "$sha" >> "$STATE/failed-shas"
  log "FAILED $short: $msg"
  status failed "$msg"
  exit 1
}

abort() { # $1 = message; a problem on this VM, not in the release: retried next run
  if [ -n "$newdir" ]; then rm -rf "$newdir"; fi
  log "ABORTED $short: $1"
  status failed "$1"
  exit 1
}

backup_db() { # $1 = backup file; VACUUM INTO gives a consistent copy while the app keeps running
  runuser -u sepordi -- "$NODE" --no-warnings -e '
    const { DatabaseSync } = require("node:sqlite");
    const [src, dst] = process.argv.slice(1);
    const db = new DatabaseSync(src);
    db.prepare("VACUUM INTO ?").run(dst);
    db.close();' "$DB" "$1"
}

prune() {
  local keep_current name
  keep_current="$(basename "$(readlink -f "$CURRENT")")"
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r | tail -n +$((KEEP_RELEASES + 1)) |
    while IFS= read -r name; do
      [ "$name" = "$keep_current" ] || rm -rf "${RELEASES:?}/$name"
    done
  find "$BACKUPS" -maxdepth 1 -type f -name 'pre-*.db' -printf '%T@ %p\n' | sort -rn | tail -n +$((KEEP_BACKUPS + 1)) |
    cut -d' ' -f2- | xargs -r -d '\n' rm -f
  git -C "$REPO" gc -q --prune=now || true
}

main() {
  mkdir -p "$STATE"
  exec 9>"$STATE/lock"
  flock -n 9 || exit 0

  [ -d "$REPO" ] || git init -q --bare "$REPO"
  local url fetched="" commit manifest want_sum env_sum tmp stamp started=$SECONDS
  for url in "${REMOTES[@]}"; do
    if git -C "$REPO" fetch -q --depth 1 "$url" +deploy:refs/heads/deploy 2>"$STATE/fetch.err"; then
      fetched=1
      break
    fi
  done
  [ -n "$fetched" ] || { log "fetch failed: $(tail -n 1 "$STATE/fetch.err")"; exit 1; }
  commit="$(git -C "$REPO" rev-parse FETCH_HEAD)"

  manifest="$(git -C "$REPO" show "$commit:manifest.json")"
  sha="$(printf '%s' "$manifest" | json_field sha)"
  short="$(printf '%s' "$manifest" | json_field short_sha)"
  want_sum="$(printf '%s' "$manifest" | json_field sha256)"
  env_sum="$(printf '%s' "$manifest" | json_field env_sha256)"
  if ! [[ "$sha" =~ ^[0-9a-f]{40}$ && "$short" =~ ^[0-9a-f]{7,40}$ && "$want_sum" =~ ^[0-9a-f]{64}$ ]] ||
    ! [[ -z "$env_sum" || "$env_sum" =~ ^[0-9a-f]{64}$ ]]; then
    log "manifest on the deploy branch is malformed (commit ${commit:0:12})"
    exit 1
  fi

  if [ -n "$env_sum" ]; then apply_env "$commit" "$env_sum" || true; fi

  if [ "$sha" = "$(cat "$STATE/current-sha" 2>/dev/null || true)" ]; then
    status unchanged "running $short"
    exit 0
  fi
  if grep -qxF "$sha" "$STATE/failed-shas" 2>/dev/null; then exit 0; fi

  log "deploying $short ($sha)"
  tmp="$(mktemp "$STATE/release.XXXXXX")"
  # Expanded now: `tmp` is local, and under `set -u` the EXIT trap runs after this function has returned.
  trap "rm -f '$tmp'" EXIT
  git -C "$REPO" cat-file blob "$commit:release.tgz" > "$tmp" || fail "release.tgz missing from the deploy branch"
  [ "$(sha256_of "$tmp")" = "$want_sum" ] || fail "release.tgz sha256 does not match the manifest"

  stamp="$(date -u +%Y%m%d-%H%M%S)"
  newdir="$RELEASES/$stamp-$short"
  mkdir -p "$newdir"
  tar -xzf "$tmp" -C "$newdir" --no-same-owner || fail "release.tgz does not extract"
  rm -f "$tmp"
  [ -f "$newdir/server.js" ] || fail "release has no server.js"
  chown -R sepordi:sepordi "$newdir" || abort "chown of $newdir failed"

  install -d -m 750 -o sepordi -g sepordi "$BACKUPS" || abort "cannot create $BACKUPS"
  if [ -f "$DB" ]; then
    backup_db "$BACKUPS/pre-$short-$stamp.db" || abort "database backup failed; nothing switched"
    log "backed up the database to $BACKUPS/pre-$short-$stamp.db"
  fi

  prev="$(readlink -f "$CURRENT" 2>/dev/null || true)"
  switched=1
  point "$newdir" || fail "cannot switch $CURRENT"
  systemctl restart "$SERVICE" || fail "systemctl restart $SERVICE failed"
  wait_healthy "$sha" || fail "health check did not report $short within ${HEALTH_TIMEOUT}s"

  echo "$sha" > "$STATE/current-sha"
  prune
  log "deployed $short as $(basename "$newdir") in $((SECONDS - started))s"
  status deployed "running $short"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
