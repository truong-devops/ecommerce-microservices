#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[rollback] Reverting latest migration for user-service..."
npm run migration:revert --workspace services/user-service

echo "[rollback] Done."
echo "[rollback] If you only need to rollback Phase A once, stop here."
