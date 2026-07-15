#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${CI_MERGE_REQUEST_DIFF_BASE_SHA:-${CI_COMMIT_BEFORE_SHA:-}}"
HEAD_SHA="${CI_COMMIT_SHA:-HEAD}"

if [[ -z "${BASE_SHA}" || "${BASE_SHA}" == "0000000000000000000000000000000000000000" ]]; then
  BASE_SHA="$(git rev-parse "${HEAD_SHA}~1" 2>/dev/null || git rev-list --max-parents=0 HEAD)"
fi

git diff --name-only "${BASE_SHA}" "${HEAD_SHA}" > changed-files.txt

services=()
while IFS= read -r file; do
  case "$file" in
    services/*/*)
      service="$(cut -d/ -f2 <<<"$file")"
      [[ -f "services/${service}/Dockerfile" ]] && services+=("services/${service}")
      ;;
    frontend/apps/*/*)
      app="$(cut -d/ -f3 <<<"$file")"
      [[ -f "frontend/apps/${app}/Dockerfile" ]] && services+=("frontend/apps/${app}")
      ;;
    shared/*|packages/*|frontend/packages/*|package.json|package-lock.json|turbo.json)
      while IFS= read -r dockerfile; do
        services+=("$(dirname "$dockerfile")")
      done < <(find services frontend/apps -maxdepth 2 -name Dockerfile | sort)
      ;;
    deploy/*|ci/*|.gitlab-ci.yml)
      while IFS= read -r dockerfile; do
        services+=("$(dirname "$dockerfile")")
      done < <(find services frontend/apps -maxdepth 2 -name Dockerfile | sort)
      ;;
  esac
done < changed-files.txt

if [[ ${#services[@]} -eq 0 ]]; then
  while IFS= read -r dockerfile; do
    services+=("$(dirname "$dockerfile")")
  done < <(find services frontend/apps -maxdepth 2 -name Dockerfile | sort)
fi

printf "%s\n" "${services[@]}" | sort -u > changed-targets.txt
{
  printf "CHANGED_TARGETS="
  paste -sd, changed-targets.txt
  printf "\n"
} > changed-targets.env

cat changed-targets.txt
