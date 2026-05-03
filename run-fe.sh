#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APPS=(
  "frontend/apps/buyer-web"
  "frontend/apps/seller"
  "frontend/apps/moderator"
)

for app in "${APPS[@]}"; do
  if [[ ! -d "$REPO_ROOT/$app" ]]; then
    echo "Khong tim thay thu muc: $REPO_ROOT/$app" >&2
    exit 1
  fi
done

for app in "${APPS[@]}"; do
  cmd="cd \"$REPO_ROOT/$app\" && npm run dev"

  osascript - "$cmd" <<'APPLESCRIPT'
on run argv
  set cmdText to item 1 of argv

  tell application "System Events"
    if not (exists process "Code") then
      error "VS Code (process 'Code') chua mo. Hay mo VS Code truoc khi chay script."
    end if

    tell process "Code"
      set frontmost to true
      keystroke "`" using {control down, shift down}
      delay 0.2
      keystroke cmdText
      key code 36
    end tell
  end tell
end run
APPLESCRIPT

  sleep 0.2
done

echo "Da mo 3 tab terminal va chay npm run dev cho buyer-web, seller, moderator."
