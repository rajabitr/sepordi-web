#!/usr/bin/env bash
# Set or update keys in the VM's /etc/sepordi/env without printing any value.
#   deploy/set-env.sh NAME=@/path/to/file   value read from a local file (trailing newline dropped)
#   deploy/set-env.sh NAME=@random           a fresh 48-byte random secret (kept if NAME already has a value)
#   deploy/set-env.sh NAME=value             a literal, non-secret value
#   deploy/set-env.sh --unset NAME
#   deploy/set-env.sh --names                list the names present (values hidden)
# Then restart: the service reads the file only at start.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f server.txt ] || { echo "server.txt missing" >&2; exit 1; }
HOST="$(sed -n 's/^HOST=//p' server.txt)"; PORT="$(sed -n 's/^PORT=//p' server.txt)"; LOGIN="$(sed -n 's/^USER=//p' server.txt)"
SSHPASS="$(sed -n 's/^PASSWORD=//p' server.txt)"; export SSHPASS

payload="$(python3 -I - "$@" <<'EOF'
import json, os, secrets, sys
ops = {"set": {}, "random": [], "unset": [], "names": False}
args = sys.argv[1:]
i = 0
while i < len(args):
    a = args[i]
    if a == "--names":
        ops["names"] = True
    elif a == "--unset":
        i += 1; ops["unset"].append(args[i])
    else:
        name, _, val = a.partition("=")
        if not name.isidentifier() or not name.isupper():
            sys.exit(f"bad name: {name}")
        if val == "@random":
            ops["random"].append(name)
            ops["set"][name] = secrets.token_urlsafe(48)
        elif val.startswith("@"):
            v = open(os.path.expanduser(val[1:])).read().rstrip("\n")
            if "\n" in v: sys.exit(f"{name}: value has a newline")
            ops["set"][name] = v
        else:
            ops["set"][name] = val
    i += 1
print(json.dumps(ops))
EOF
)"

remote_py='
import json, os, sys, tempfile
ops = json.loads(sys.stdin.read())
path = "/etc/sepordi/env"
lines = open(path).read().splitlines() if os.path.exists(path) else []
env = {}
order = []
for ln in lines:
    if "=" in ln and not ln.lstrip().startswith("#"):
        k, _, v = ln.partition("=")
        env[k] = v; order.append(k)
for k in ops["unset"]:
    env.pop(k, None)
for k, v in ops["set"].items():
    if k in ops["random"] and env.get(k):
        continue
    if k not in env: order.append(k)
    env[k] = v
if ops["set"] or ops["unset"]:
    fd, tmp = tempfile.mkstemp(dir="/etc/sepordi")
    with os.fdopen(fd, "w") as f:
        for k in order:
            if k in env: f.write(f"{k}={env[k]}\n")
    os.chown(tmp, 0, __import__("grp").getgrnam("sepordi").gr_gid)
    os.chmod(tmp, 0o640)
    os.replace(tmp, path)
print("names:", " ".join(k for k in order if k in env) or "(none)")
'
{ printf '%s\n' "$SSHPASS"; printf '%s' "$payload"; } |
  sshpass -e ssh -p "$PORT" -o ConnectTimeout=15 "$LOGIN@$HOST" "sudo -S -p '' python3 -c '$remote_py'"
