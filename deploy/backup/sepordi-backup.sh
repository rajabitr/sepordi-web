#!/usr/bin/env bash
# Daily consistent copy of the SQLite DB (VACUUM INTO works on a live WAL database). Keeps the newest 14.
# Runs as user sepordi from sepordi-backup.timer. Media under /var/lib/sepordi/media is not copied here.
set -euo pipefail
dir=/var/lib/sepordi/backups
mkdir -p "$dir"
out="$dir/daily-$(date -u +%Y%m%d-%H%M%S).db"
/opt/node/bin/node --no-warnings -e '
const { DatabaseSync } = require("node:sqlite");
new DatabaseSync("/var/lib/sepordi/sepordi.db").prepare("VACUUM INTO ?").run(process.argv[1]);
' "$out"
chmod 640 "$out"
ls -1t "$dir"/daily-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "backup written: $out ($(stat -c %s "$out") bytes)"
