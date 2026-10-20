#!/usr/bin/env bash
# One-time (idempotent) server setup for sepordi-web. Run as root: sudo bash provision.sh
# TLS ends at the CDN ("flexible"): browser -https-> CDN -http-> this VM. The network admin forwards
# the public ports to the VM at layer 3, so the app listens on 0.0.0.0:3000 itself; no proxy here.
# Ports agreed with the owner: 3000 = front (this app), 8081 = backend (reserved), 8080 = free.
set -euo pipefail

NODE_V=v24.22.0
HERE="$(cd "$(dirname "$0")" && pwd)"

if ! /opt/node/bin/node -v 2>/dev/null | grep -qx "$NODE_V"; then
  cd /tmp
  curl -fsSLO "https://nodejs.org/dist/$NODE_V/node-$NODE_V-linux-x64.tar.xz"
  curl -fsSL "https://nodejs.org/dist/$NODE_V/SHASUMS256.txt" | grep " node-$NODE_V-linux-x64.tar.xz\$" | sha256sum -c -
  rm -rf /opt/node && mkdir -p /opt/node
  tar -xJf "node-$NODE_V-linux-x64.tar.xz" -C /opt/node --strip-components=1
  rm -f "node-$NODE_V-linux-x64.tar.xz"
  ln -sf /opt/node/bin/node /usr/local/bin/node
fi

# An earlier layout terminated TLS with Caddy on this VM; TLS now lives at the CDN.
if [ -f /etc/systemd/system/caddy.service ]; then
  systemctl disable --now caddy >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/caddy.service
fi

mkdir -p /etc/sepordi /opt/sepordi/releases /var/lib/sepordi
chown sepordi:sepordi /opt/sepordi /opt/sepordi/releases /var/lib/sepordi
chmod 750 /var/lib/sepordi
[ -f /etc/sepordi/env ] || install -m 640 -o root -g sepordi /dev/null /etc/sepordi/env

install -m 644 "$HERE/sepordi-web.service" /etc/systemd/system/sepordi-web.service
systemctl daemon-reload
systemctl enable sepordi-web >/dev/null 2>&1

echo "node $(/opt/node/bin/node -v) · caddy $(systemctl is-active caddy 2>/dev/null || true) · sepordi-web $(systemctl is-enabled sepordi-web)"
