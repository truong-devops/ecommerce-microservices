#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f built-images.txt ]]; then
  echo "No built-images.txt artifact found." >&2
  exit 1
fi

for image_tar in image-tars/*.tar; do
  [[ -f "$image_tar" ]] || continue
  docker load -i "$image_tar"
done

: > published-images.txt

while IFS= read -r image; do
  [[ -z "$image" ]] && continue
  echo "==> Pushing ${image}"
  docker push "$image"

  digest="$(docker inspect --format='{{index .RepoDigests 0}}' "$image" 2>/dev/null || true)"
  if [[ -n "${COSIGN_PRIVATE_KEY:-}" ]] && command -v cosign >/dev/null 2>&1; then
    echo "==> Signing ${image}"
    cosign sign --yes --key env://COSIGN_PRIVATE_KEY "$image"
  else
    echo "Cosign not configured or not installed; skipping signing for ${image}"
  fi

  echo "${digest:-$image}" >> published-images.txt
done < built-images.txt
