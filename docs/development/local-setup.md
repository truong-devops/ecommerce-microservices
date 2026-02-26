# Local setup and compose boundaries

## Compose ownership

- Root `docker-compose.yml`: minimal project-level bootstrap and local defaults.
- `infrastructure/docker/docker-compose.*.yml`: environment-specific infrastructure stack.
- `services/<name>/docker-compose*.yml`: service-local overrides for isolated development.

Use root compose as the default entrypoint to avoid drifting startup commands.

## Suggested flow

1. Start infra dependencies from `infrastructure/docker/docker-compose.dev.yml`.
2. Run service(s) you are actively developing from each service package.
3. Keep environment values in `.env.dev`, `.env.staging`, `.env.prod`.

## Monorepo task runner

This repository uses Turbo for build/test/lint orchestration.
