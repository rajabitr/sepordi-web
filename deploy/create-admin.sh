#!/usr/bin/env bash
# Create (or reset) a sepordi admin on the VM: a random password goes ONLY into a local 0600 file, the server
# stores only its scrypt hash (the app's own format, see src/server/auth/password.ts).
#   deploy/create-admin.sh 09xxxxxxxxx
set -euo pipefail
cd "$(dirname "$0")/.."
PHONE="${1:?usage: deploy/create-admin.sh 09xxxxxxxxx}"
[[ $PHONE =~ ^09[0-9]{9}$ ]] || { echo "mobile must be 11 digits starting with 09" >&2; exit 1; }
[ -f server.txt ] || { echo "server.txt missing" >&2; exit 1; }
HOST="$(sed -n 's/^HOST=//p' server.txt)"; PORT="$(sed -n 's/^PORT=//p' server.txt)"; LOGIN="$(sed -n 's/^USER=//p' server.txt)"
SSHPASS="$(sed -n 's/^PASSWORD=//p' server.txt)"; export SSHPASS
OUT="admin-login.secret.txt"

HASH="$(python3 -I - "$PHONE" "$OUT" <<'EOF'
import base64, hashlib, os, secrets, sys, unicodedata
phone, out = sys.argv[1], sys.argv[2]
alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
pw = "".join(secrets.choice(alphabet) for _ in range(20))
salt = secrets.token_bytes(16)
key = hashlib.scrypt(unicodedata.normalize("NFC", pw).encode(), salt=salt, n=16384, r=8, p=1, dklen=32, maxmem=64 * 1024 * 1024)
b64 = lambda x: base64.urlsafe_b64encode(x).decode().rstrip("=")
fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    f.write(f"sepordi.ir admin\nURL: https://sepordi.ir/login  ->  /admin\nMobile: {phone}\nPassword: {pw}\n")
print("$".join(["scrypt", "16384", "8", "1", b64(salt), b64(key)]))
EOF
)"

printf '%s' "$HASH" | sshpass -e ssh -p "$PORT" -o ConnectTimeout=15 "$LOGIN@$HOST" "cd /tmp && PHONE=$PHONE /opt/node/bin/node --no-warnings -e '
const { DatabaseSync } = require(\"node:sqlite\");
const { randomUUID } = require(\"node:crypto\");
const hash = require(\"fs\").readFileSync(0, \"utf8\").trim();
const db = new DatabaseSync(\"/var/lib/sepordi/sepordi.db\");
const phone = process.env.PHONE;
const row = db.prepare(\"SELECT id FROM users WHERE phone = ?\").get(phone);
if (row) db.prepare(\"UPDATE users SET role = ?, password_hash = ? WHERE id = ?\").run(\"admin\", hash, row.id);
else db.prepare(\"INSERT INTO users (id, phone, email, display_name, password_hash, role, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)\")
  .run(randomUUID(), phone, \"مدیر سپردی\", hash, \"admin\", new Date().toISOString());
console.log(\"admin ready:\", phone);
'"
echo "password saved in $(pwd)/$OUT (0600, git-ignored)"
