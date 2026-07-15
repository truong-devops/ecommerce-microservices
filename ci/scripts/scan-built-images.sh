#!/usr/bin/env sh
set -eu

if [ ! -d image-tars ]; then
  echo "No image-tars artifact directory found." >&2
  exit 1
fi

for image_tar in image-tars/*.tar; do
  [ -f "$image_tar" ] || continue
  name="$(basename "$image_tar" .tar)"
  trivy image --input "$image_tar" --cache-dir "${TRIVY_CACHE_DIR:-.trivycache}" --severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed
  trivy image --input "$image_tar" --format cyclonedx --output "sbom-${name}.json"
done
