#!/usr/bin/env bash
set -euo pipefail

targets_file="${1:-changed-targets.txt}"
: "${HARBOR_REGISTRY:?HARBOR_REGISTRY is required}"
: "${HARBOR_PROJECT:?HARBOR_PROJECT is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"

if [[ ! -f "$targets_file" ]]; then
  echo "Missing ${targets_file}; run detect-changed-targets first." >&2
  exit 1
fi

: > build-images.env
: > built-images.txt
mkdir -p image-tars

while IFS= read -r target; do
  [[ -z "$target" ]] && continue
  [[ -f "${target}/Dockerfile" ]] || continue

  image_name="$(basename "$target")"
  image="${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${image_name}:${IMAGE_TAG}"

  echo "==> Building ${image} from ${target}"
  docker build -t "$image" "$target"
  echo "$image" >> built-images.txt
  tar_name="image-tars/${image_name}.tar"
  docker save "$image" -o "$tar_name"
done < "$targets_file"

printf "BUILT_IMAGES=" >> build-images.env
paste -sd, built-images.txt >> build-images.env
