#!/usr/bin/env bash
set -euo pipefail

targets_file="${1:-changed-targets.txt}"

if [[ ! -f "$targets_file" ]]; then
  echo "Missing ${targets_file}; run detect-changed-targets first." >&2
  exit 1
fi

while IFS= read -r target; do
  [[ -z "$target" ]] && continue
  echo "==> Quality checks for ${target}"

  if [[ -f "${target}/go.mod" ]]; then
    (cd "$target" && go test ./...)
    (cd "$target" && go vet ./...)
    continue
  fi

  if [[ -f "${target}/package.json" ]]; then
    npm --workspace "$target" run lint --if-present
    npm --workspace "$target" run test --if-present
    npm --workspace "$target" run build --if-present
    continue
  fi

  echo "No known quality command for ${target}; skipped."
done < "$targets_file"
