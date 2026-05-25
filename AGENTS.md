# Repository Guidelines

## Project Structure & Module Organization

This monorepo contains an ecommerce microservices platform. Backend runtime code lives in `services/*`: most services are Go (`api-gateway`, `user-service`, `product-service`, etc.), while `services/auth-service` is NestJS/TypeScript. Cross-service contracts live in `shared/*`, including proto, Kafka, contracts, and shared types. NestJS runtime helpers belong in `packages/backend-shared/*`. Frontend apps are under `frontend/apps/*`; reusable UI/client packages are under `frontend/packages/*`. Infrastructure, deployment, and observability assets are in `infrastructure/`, `cicd/`, and `docs/`.

## Build, Test, and Development Commands

- `npm run dev`: run workspace dev tasks in parallel through Turbo.
- `npm run build`: build all configured workspaces.
- `npm run test`: run the monorepo test pipeline.
- `npm run lint`: run workspace lint tasks.
- `npm run format`: run configured formatters.
- `cd services/<go-service> && go test ./...`: test one Go service.
- `npm --workspace services/auth-service run test`: test the NestJS auth service.
- `docker compose up`: start the default local stack.

Prefer service-scoped commands before broad monorepo commands.

## Coding Style & Naming Conventions

Follow `docs/development/code-standards.md`. Use English names and comments. Use `camelCase` for variables/functions, `PascalCase` for types/classes/interfaces/enums, `UPPER_SNAKE_CASE` for global constants, and `kebab-case` for files and folders. Keep Go handlers thin, business logic in `internal/service`, and data access in `internal/repository`. Keep NestJS controllers thin, domain logic in services, DTO validation at boundaries, and suffixes such as `*.service.ts`, `*.controller.ts`, and `*.dto.ts`.

## Testing Guidelines

Add or update tests for changed behavior, including happy and relevant failure paths. For Go services, place tests next to the package under test and run `go test ./...` from that service directory. For TypeScript workspaces, use the workspace test script. Escalate to integration scripts or `npm run test` only when API contracts, Kafka events, shared packages, or cross-service behavior changes.

## Commit & Pull Request Guidelines

Use Conventional Commits:

```txt
<type>(<scope>): <imperative subject>
```

Examples: `fix(payment): deduplicate webhook events`, `docs(infra): add deployment runbook`. Branches should follow `<type>/<scope>-<short-desc>`, such as `feature/order-checkout-saga`. Pull requests should include a clear summary, affected services/packages, linked issues when applicable, screenshots for UI changes, and the exact validation commands run. Shared contract changes must call out producer and consumer impact.

## Security & Configuration Tips

Do not commit secrets, local credentials, or generated environment files. Validate environment variables at service startup. Public APIs should route through `api-gateway`; services should communicate through REST, gRPC contracts in `shared/proto`, or Kafka contracts in `shared/kafka`.
