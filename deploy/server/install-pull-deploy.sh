#!/usr/bin/env bash
# One-time (idempotent) setup of the pull-deploy on the VM. Run as root from a checkout or copy of deploy/server:
#   sudo bash install-pull-deploy.sh
# Prints the deploy public key (add it to the GitHub repo as a read-only deploy key), then the env cert
# (commit it as deploy/env-cert.pem). Private keys never leave this VM.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
for cmd in git openssl curl flock runuser sha256sum ssh-keygen; do
  command -v "$cmd" >/dev/null || { echo "missing: $cmd" >&2; exit 1; }
done
[ -x /opt/node/bin/node ] || { echo "missing /opt/node/bin/node (run deploy/provision.sh first)" >&2; exit 1; }

install -m 755 "$HERE/sepordi-pull-deploy.sh" /usr/local/sbin/sepordi-pull-deploy
install -m 644 "$HERE/sepordi-pull-deploy.service" /etc/systemd/system/sepordi-pull-deploy.service
install -m 644 "$HERE/sepordi-pull-deploy.timer" /etc/systemd/system/sepordi-pull-deploy.timer
install -d -m 700 /var/lib/sepordi-deploy

install -d -m 700 /root/.ssh
if [ ! -f /root/.ssh/sepordi_deploy ]; then
  ssh-keygen -q -t ed25519 -N '' -f /root/.ssh/sepordi_deploy -C sepordi-vm-deploy
fi

install -d -m 700 /root/.config /root/.config/sepordi
if [ ! -f /root/.config/sepordi/env-key.pem ]; then
  (umask 077 && openssl req -x509 -newkey rsa:4096 -nodes -days 3650 -subj /CN=sepordi-env \
    -keyout /root/.config/sepordi/env-key.pem -out /root/.config/sepordi/env-cert.pem 2>/dev/null)
fi
chmod 600 /root/.config/sepordi/env-key.pem

systemctl daemon-reload
systemctl enable --now sepordi-pull-deploy.timer >/dev/null 2>&1

echo "# deploy key (GitHub > Settings > Deploy keys, read-only):"
cat /root/.ssh/sepordi_deploy.pub
echo "# env cert (commit as deploy/env-cert.pem):"
cat /root/.config/sepordi/env-cert.pem
