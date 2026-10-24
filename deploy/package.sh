#!/usr/bin/env bash
# Package a built .next/standalone into dist/release.tgz + dist/manifest.json (run after `npm run build`).
# A sealed env bundle (ENV_ENC, default deploy/env.enc) rides along as dist/env.enc when present.
# The archive carries manifest.json at its root too (without sha256, which cannot describe its own archive):
# the standalone server's cwd is the release root, and /api/health reports that sha as its version.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .next/standalone/server.js ] || { echo ".next/standalone/server.js missing; run npm run build first" >&2; exit 1; }

SHA="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short=7 HEAD)"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
NODE_VERSION="$(node -v)"
RUN_ID="${GITHUB_RUN_ID:-local}"
ENV_ENC="${ENV_ENC:-deploy/env.enc}"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next"
cp -R .next/static "$STAGE/.next/static"
cp -R public "$STAGE/public"
# Output tracing may pull project files in; nothing secret or local may ride along.
find "$STAGE" \( -name 'server.txt' -o -name '.env' -o -name '.env.*' -o -name '*.db' -o -name '*.db-*' \) \
  ! -name '.env.example' -print -delete
rm -rf "$STAGE/data" "$STAGE/docs" "$STAGE/brand" "$STAGE/deploy" "$STAGE/dist"
if find "$STAGE" -name 'server.txt' | grep -q .; then echo "refusing: server.txt in release" >&2; exit 1; fi

manifest() { # $1 = sha256 of the archive, $2 = sha256 of env.enc; both empty for the copy inside the archive
  SHA="$SHA" SHORT="$SHORT" BUILT_AT="$BUILT_AT" NODE_VERSION="$NODE_VERSION" RUN_ID="$RUN_ID" SUM="$1" ENV_SUM="$2" \
    node -e '
    const e = process.env;
    const m = { sha: e.SHA, short_sha: e.SHORT, built_at: e.BUILT_AT };
    if (e.SUM) Object.assign(m, { sha256: e.SUM, env_sha256: e.ENV_SUM || null });
    Object.assign(m, { node_version: e.NODE_VERSION, run_id: e.RUN_ID });
    process.stdout.write(JSON.stringify(m, null, 2) + "\n");'
}
manifest "" "" > "$STAGE/manifest.json"

rm -rf dist && mkdir -p dist
# macOS bsdtar would otherwise add AppleDouble ._* files and xattrs; GNU tar on the runners takes the flag too.
if tar --no-xattrs -cf /dev/null -T /dev/null 2>/dev/null; then
  COPYFILE_DISABLE=1 tar --no-xattrs -C "$STAGE" -czf dist/release.tgz .
else
  tar -C "$STAGE" -czf dist/release.tgz .
fi
sha256_of() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}
SUM="$(sha256_of dist/release.tgz)"
ENV_SUM=""
if [ -f "$ENV_ENC" ]; then
  cp "$ENV_ENC" dist/env.enc
  ENV_SUM="$(sha256_of dist/env.enc)"
fi
manifest "$SUM" "$ENV_SUM" > dist/manifest.json
echo "packaged $SHORT ($(du -h dist/release.tgz | cut -f1)) sha256=$SUM env=${ENV_SUM:-none}"
