#!/usr/bin/env bash
# Seal env values for the VM into deploy/env.enc; commit it and push to main. CI ships it on the deploy branch,
# the VM decrypts it with its own key and merges it into /etc/sepordi/env, then restarts sepordi-web.
#   deploy/encrypt-env.sh NAME=value|NAME=@file ...    (@file: value read from a file, trailing newline dropped)
# Each run REPLACES env.enc with exactly the given set, so list every key the bundle should carry. Keys left
# out keep whatever value the VM already has; `NAME=` sets an empty value. Values are single lines.
# Needs only the public cert deploy/env-cert.pem; the plaintext is piped, never written to disk.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CERT="${SEPORDI_ENV_CERT:-$HERE/env-cert.pem}"
OUT="${SEPORDI_ENV_OUT:-$HERE/env.enc}"
# Keep in step with deploy/server/sepordi-pull-deploy.sh.
ALLOWED="KAVENEGAR_API_KEY KAVENEGAR_TEMPLATE ZARINPAL_MERCHANT_ID ZARINPAL_SANDBOX SEPORDI_ADMIN_PHONES BIZIN_PARTNER_KEY BIZIN_WEBHOOK_SECRETS PUBLIC_BASE_URL"

die() { echo "encrypt-env: $*" >&2; exit 1; }

[ $# -gt 0 ] || die "usage: deploy/encrypt-env.sh NAME=value|NAME=@file ... (allowed: $ALLOWED)"
[ -f "$CERT" ] || die "$CERT missing: commit the cert printed by deploy/server/install-pull-deploy.sh"
openssl cms -help >/dev/null 2>&1 || die "this openssl has no cms command (macOS: brew install openssl@3)"

plain="" names="" n=0
for arg in "$@"; do
  n=$((n + 1))
  case "$arg" in *=*) ;; *) die "argument $n is not NAME=value or NAME=@file" ;; esac
  name="${arg%%=*}"
  value="${arg#*=}"
  case " $ALLOWED " in *" $name "*) ;; *) die "${name:-argument $n} is not an allowed name (allowed: $ALLOWED)" ;; esac
  case " $names " in *" $name "*) die "$name is given twice" ;; esac
  if [ "${value#@}" != "$value" ]; then
    [ -f "${value#@}" ] || die "$name: file ${value#@} not found"
    value="$(cat "${value#@}")"
  fi
  case "$value" in *$'\n'* | *$'\r'*) die "$name: the value must be a single line" ;; esac
  plain="$plain$name=$value"$'\n'
  names="${names:+$names }$name"
done

tmp="$OUT.tmp.$$"
trap 'rm -f "$tmp"' EXIT
printf '%s' "$plain" | openssl cms -encrypt -aes256 -binary -outform DER -out "$tmp" -recip "$CERT"
mv -f "$tmp" "$OUT"
echo "wrote $OUT with: $names"
