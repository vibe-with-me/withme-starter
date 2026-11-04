#!/usr/bin/env bash
# Keeps a public demo fresh (go-live, "A public demo"): reseeds the hosted
# project from the go-live keys file, so whatever visitors did as Ada or Lin
# is wiped and the seeded state comes back. Each reseed recreates the demo
# users, which signs out anyone signed in as them.
#
#   bash scripts/demo-reseed.sh            # reseed once
#   bash scripts/demo-reseed.sh install    # reseed hourly with launchd (macOS)
#   bash scripts/demo-reseed.sh status     # is the job loaded, last log lines
#   bash scripts/demo-reseed.sh uninstall  # stop the hourly reseed
#
# The keys file is $HOME/.config/<name>/demo-seed.env (go-live section 1),
# <name> being package.json's name; DEMO_SEED_ENV points elsewhere. Copy the
# existing file to a new machine rather than writing a fresh one: go-live's
# command draws a new SEED_DEMO_PASSWORD, and the next reseed would then
# change the demo login the landing page shows. DEMO_RESEED_INTERVAL sets the
# job's period in seconds (default 3600).
#
# launchd runs the job only while you are logged in, and not while the Mac
# sleeps (a missed run happens on wake). On an always-on Mac, keep it logged
# in and turn system sleep off.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
name=$(sed -n 's/^  "name": "\(.*\)",$/\1/p' "$root/package.json")
keys=${DEMO_SEED_ENV:-$HOME/.config/$name/demo-seed.env}
label="local.$name.demo-reseed"
plist="$HOME/Library/LaunchAgents/$label.plist"
log="$HOME/Library/Logs/$name-demo-reseed.log"

reseed() {
  [ -r "$keys" ] || { echo "No keys file at $keys (go-live section 1)." >&2; exit 1; }
  echo "== $(date '+%Y-%m-%d %H:%M:%S') reseeding from $keys"
  # A subshell, so the service-role key never stays exported (go-live).
  (
    set -a
    # shellcheck disable=SC1090
    source "$keys"
    set +a
    : "${SUPABASE_URL:?missing from the keys file}"
    : "${SUPABASE_SERVICE_ROLE_KEY:?missing from the keys file}"
    cd "$root"
    SEED_ALLOW_REMOTE=1 bun run db:seed
  )
}

install_job() {
  [ "$(uname)" = Darwin ] || { echo "install uses launchd, which is macOS only." >&2; exit 1; }
  [ -r "$keys" ] || { echo "No keys file at $keys (go-live section 1)." >&2; exit 1; }
  bun=$(command -v bun) || { echo "bun is not on PATH." >&2; exit 1; }
  mkdir -p "$(dirname "$plist")" "$(dirname "$log")"
  # The seed prints the demo login, so the log is yours alone.
  touch "$log"
  chmod 600 "$log"
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$root/scripts/demo-reseed.sh</string></array>
  <key>WorkingDirectory</key><string>$root</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$bun"):/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>DEMO_SEED_ENV</key><string>$keys</string>
  </dict>
  <key>StartInterval</key><integer>${DEMO_RESEED_INTERVAL:-3600}</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$log</string>
  <key>StandardErrorPath</key><string>$log</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  echo "Installed $label: reseeds now, then every ${DEMO_RESEED_INTERVAL:-3600}s. Log: $log"
}

uninstall_job() {
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  rm -f "$plist"
  echo "Removed $label."
}

status_job() {
  if launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; then
    launchctl print "gui/$(id -u)/$label" | grep -E $'^\t(state|last exit code|run interval) ='
  else
    echo "$label is not loaded."
  fi
  [ -f "$log" ] && tail -n 12 "$log"
}

case "${1:-run}" in
  run) reseed ;;
  install) install_job ;;
  uninstall) uninstall_job ;;
  status) status_job ;;
  *) echo "usage: $0 [run|install|status|uninstall]" >&2; exit 2 ;;
esac
