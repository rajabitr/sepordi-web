#!/usr/bin/env bash
# Ship a release of sepordi-web to the VM (connection details from the git-ignored server.txt).
#   deploy/deploy.sh             build the committed tree, ship, restart, health check
#   deploy/deploy.sh --no-build  ship the existing .next/standalone as is
#   deploy/deploy.sh --rollback  point `current` at the previous release and restart
# The build runs here (the standalone output has no native modules); the VM never runs npm.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f server.txt ] || { echo "server.txt missing" >&2; exit 1; }
HOST="$(sed -n 's/^HOST=//p' server.txt)"
PORT="$(sed -n 's/^PORT=//p' server.txt)"
LOGIN="$(sed -n 's/^USER=//p' server.txt)"
SSHPASS="$(sed -n 's/^PASSWORD=//p' server.txt)"
export SSHPASS
remote() { sshpass -e ssh -p "$PORT" -o ConnectTimeout=15 "$LOGIN@$HOST" "$@"; }
remote_sudo() { printf '%s\n' "$SSHPASS" | remote "sudo -S -p '' $*"; }

health() {
  for _ in $(seq 1 30); do
    if remote "curl -fsS -m 3 http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
      echo "health: ok ($(remote 'readlink /opt/sepordi/current'))"; return 0
    fi
    sleep 1
  done
  echo "health: FAILED — last log lines:" >&2
  remote_sudo "journalctl -u sepordi-web --no-pager -n 30 -o cat" >&2 || true
  return 1
}

if [ "${1:-}" = "--rollback" ]; then
  prev="$(remote "ls -1dt /opt/sepordi/releases/* | sed -n 2p")"
  [ -n "$prev" ] || { echo "no previous release" >&2; exit 1; }
  remote "ln -sfn '$prev' /opt/sepordi/current"
  remote_sudo "systemctl restart sepordi-web"
  health; exit $?
fi

if [ "${1:-}" != "--no-build" ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "working tree has uncommitted changes; commit first" >&2; exit 1
  fi
  npm run build
fi
[ -f .next/standalone/server.js ] || { echo ".next/standalone/server.js missing" >&2; exit 1; }

REL="$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$STAGE.tgz"' EXIT
cp -R .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next"
cp -R .next/static "$STAGE/.next/static"
cp -R public "$STAGE/public"
# Output tracing may pull project files in; nothing secret or local may ride along.
find "$STAGE" \( -name 'server.txt' -o -name '.env' -o -name '.env.*' -o -name '*.db' -o -name '*.db-*' \) \
  ! -name '.env.example' -print -delete
rm -rf "$STAGE/data" "$STAGE/docs" "$STAGE/brand" "$STAGE/deploy"
if find "$STAGE" -name 'server.txt' | grep -q .; then echo "refusing: server.txt in release" >&2; exit 1; fi

COPYFILE_DISABLE=1 tar --no-xattrs -C "$STAGE" -czf "$STAGE.tgz" .
echo "release $REL ($(du -h "$STAGE.tgz" | cut -f1))"
sshpass -e scp -q -P "$PORT" "$STAGE.tgz" "$LOGIN@$HOST:/tmp/sepordi-$REL.tgz"
remote "set -e
  d=/opt/sepordi/releases/$REL
  mkdir -p \"\$d\" && tar -xzf /tmp/sepordi-$REL.tgz -C \"\$d\" && rm -f /tmp/sepordi-$REL.tgz
  ln -sfn \"\$d\" /opt/sepordi/current
  ls -1dt /opt/sepordi/releases/* | tail -n +4 | xargs -r rm -rf"
remote_sudo "systemctl restart sepordi-web"
health
