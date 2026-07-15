#!/usr/bin/env bash
set -euo pipefail

: "${GITOPS_VALUES_FILE:?GITOPS_VALUES_FILE is required}"

if [[ ! -f published-images.txt ]]; then
  echo "No published-images.txt artifact found." >&2
  exit 1
fi

while IFS= read -r image_ref; do
  [[ -z "$image_ref" ]] && continue
  image_without_digest="${image_ref%@*}"
  image_without_tag="${image_without_digest%:*}"
  service="$(basename "$image_without_tag")"

  yq -i ".services[\"${service}\"].image.repository = \"${image_without_tag}\"" "$GITOPS_VALUES_FILE"
  if [[ "$image_ref" == *@sha256:* ]]; then
    yq -i ".services[\"${service}\"].image.digest = \"${image_ref#*@}\"" "$GITOPS_VALUES_FILE"
    yq -i ".services[\"${service}\"].image.tag = \"\"" "$GITOPS_VALUES_FILE"
  else
    yq -i ".services[\"${service}\"].image.tag = \"${image_ref##*:}\"" "$GITOPS_VALUES_FILE"
  fi
done < published-images.txt

git add "$GITOPS_VALUES_FILE"
git commit -m "chore(gitops): deploy ${CI_ENVIRONMENT_NAME:-dev} ${CI_COMMIT_SHORT_SHA:-local}" || {
  echo "No GitOps changes to commit."
  exit 0
}

git push "https://oauth2:${GITOPS_PUSH_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git" "HEAD:${CI_COMMIT_BRANCH}"
