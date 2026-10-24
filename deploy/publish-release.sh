#!/usr/bin/env bash
# Fallback for when GitHub Actions cannot run (e.g. account billing): build the committed tree here and
# publish it to the `deploy` branch exactly like the workflow does. The VM still pulls from GitHub; this
# never connects to the VM. Usage: deploy/publish-release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "working tree has uncommitted changes; commit (and push main) first" >&2; exit 1
fi
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "HEAD is not origin/main; push main first" >&2; exit 1; }

npx tsc --noEmit --incremental false
npx eslint . --max-warnings=0
npx vitest run
npm run build
GITHUB_SHA="$(git rev-parse HEAD)" GITHUB_RUN_ID="mac-$(date -u +%Y%m%d%H%M%S)" bash deploy/package.sh

idx="$(mktemp)"; rm -f "$idx"
export GIT_INDEX_FILE="$idx"
git update-index --add --cacheinfo "100644,$(git hash-object -w dist/release.tgz),release.tgz"
git update-index --add --cacheinfo "100644,$(git hash-object -w dist/manifest.json),manifest.json"
if [ -f dist/env.enc ]; then
  git update-index --add --cacheinfo "100644,$(git hash-object -w dist/env.enc),env.enc"
fi
tree="$(git write-tree)"
unset GIT_INDEX_FILE; rm -f "$idx"
commit="$(git commit-tree "$tree" -m "release $(git rev-parse --short HEAD) (published from a laptop)")"
git push -q --force origin "${commit}:refs/heads/deploy"
echo "published $(git rev-parse --short HEAD) to the deploy branch; the VM picks it up within a minute."
echo "check: curl -s https://sepordi.ir/api/health"
