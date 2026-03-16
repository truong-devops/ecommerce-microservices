#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if command -v npm >/dev/null 2>&1; then
  NPM_BIN="npm"
elif command -v npm.cmd >/dev/null 2>&1; then
  NPM_BIN="npm.cmd"
else
  echo "Missing npm executable (npm or npm.cmd)." >&2
  exit 1
fi

cd "$REPO_ROOT"

if [[ $# -gt 0 ]]; then
  "$NPM_BIN" run test:e2e --workspace services/user-service -- "$@"
else
  "$NPM_BIN" run test:e2e --workspace services/user-service
fi
