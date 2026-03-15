# Team Engineering Rules

Last updated: 2026-03-09
Applies to: all backend services, frontend apps, shared packages in this monorepo.

## 1. Purpose

This document defines one coding style and one project organization style so the whole team can build features consistently.

## 2. Rule Levels

- MUST: mandatory, no exception unless team lead approves.
- SHOULD: strongly recommended, exception must be explained in PR.
- MAY: optional, use when beneficial.

## 3. Monorepo Boundaries

- MUST keep backend runtime code inside `services/*`.
- MUST keep cross-platform contracts inside `shared/*`.
- MUST keep backend shared runtime helpers inside `services/shared/*`.
- MUST NOT import runtime code directly from another service.
- MUST communicate across services only via REST/gRPC/Kafka.

## 4. Naming Conventions

- MUST use English for code symbols and comments.
- MUST use `camelCase` for variables/functions/methods.
- MUST use `PascalCase` for class/type/interface/enum.
- MUST use `UPPER_SNAKE_CASE` for global constants.
- MUST use `kebab-case` for file names and folder names.
- SHOULD name booleans with `is/has/can/should` prefix.
- SHOULD use explicit names, avoid unclear abbreviations.

## 5. Backend Folder Structure (NestJS)

Each service SHOULD follow this layout:

```txt
services/<service-name>/
  src/
    main.ts
    app.module.ts
    config/
    common/
      constants/
      utils/
      types/
    modules/
      <domain>/
        controllers/
        services/
        repositories/
        entities/            # use entities OR models, choose one style per repo
        dto/
        <domain>.module.ts
```

- MUST keep feature code by domain (`modules/<domain>`).
- MUST keep controller thin; business logic goes to service layer.
- MUST keep DB access in repository layer (or equivalent abstraction).
- MAY add `routes/` only for non-Nest explicit router needs.

NestJS file suffix MUST follow:
- `*.module.ts`
- `*.controller.ts`
- `*.service.ts`
- `*.repository.ts`
- `*.dto.ts`
- `*.entity.ts`
- `*.guard.ts`, `*.filter.ts`, `*.interceptor.ts`, `*.pipe.ts`

## 6. Frontend Folder Structure

Each app SHOULD follow this layout:

```txt
frontend/apps/<app-name>/
  src/
    pages/ or app/          # choose one primary router style
    components/
    services/
    hooks/
    stores/
    types/
    constants/
    utils/
    styles/
```

- MUST choose one main routing strategy (`pages` or `app`) per app.
- MUST keep API calls in `services/`, not in page/component body.
- SHOULD organize components by feature for medium/large modules.

## 7. API and Service Communication Rules

Use this decision table:

- REST: MUST for client-facing APIs (web/mobile/3rd-party) via API Gateway.
- gRPC: SHOULD for internal synchronous service-to-service calls needing strong contract and low latency.
- Kafka: SHOULD for asynchronous workflows, domain events, fan-out integration.

Contract location:

- MUST keep gRPC contracts in `shared/proto/*`.
- MUST keep Kafka topics/events in `shared/kafka/*`.
- MUST keep shared TS contracts in `shared/contracts/*` and `shared/types/*`.

## 8. REST API Standards

- MUST use prefix `/api/v1`.
- MUST use plural resource nouns and `kebab-case` in path.
- MUST NOT use verbs in endpoint path (bad: `/getOrders`).
- MUST map HTTP methods correctly (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).

Standard success response:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "...",
    "timestamp": "2026-03-09T10:30:00.000Z"
  }
}
```

Standard error response:

```json
{
  "success": false,
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Order not found",
    "details": {}
  },
  "meta": {
    "requestId": "...",
    "timestamp": "2026-03-09T10:30:00.000Z"
  }
}
```

Status code MUST follow:
- `200`, `201`, `204` success
- `400` bad request
- `401` unauthorized
- `403` forbidden
- `404` not found
- `409` conflict
- `422` business validation failed
- `500` internal error

Pagination SHOULD use:
- request: `page`, `pageSize`, `sortBy`, `sortOrder`, `search`
- response: `meta.pagination` with `page`, `pageSize`, `totalItems`, `totalPages`

## 9. Error Handling Rules

- MUST handle exceptions through global exception filter.
- MUST define and reuse business error codes from `shared/constants/error-codes.ts`.
- MUST NOT return stack trace to clients in production.
- MUST log at least: `requestId`, `service`, `path`, `method`, `statusCode`, `durationMs`.
- SHOULD add retry/circuit-breaker for external dependency failures.

## 10. Validation Rules

Backend:

- MUST validate all input DTOs using `class-validator`.
- MUST use global `ValidationPipe` with:
  - `transform: true`
  - `whitelist: true`
  - `forbidNonWhitelisted: true`
- MUST validate at boundary (controller/message handler), not deep inside service only.
- SHOULD validate environment variables at startup using Joi/Zod.

Frontend:

- SHOULD validate forms before submit (Zod/Yup or equivalent).
- SHOULD validate minimum response shape in API client layer.
- MUST treat frontend validation as convenience only; backend is source of truth.

## 11. Testing Rules

- MUST include test for happy path.
- MUST include test for validation failure.
- MUST include test for permission/auth failure (if endpoint is protected).
- MUST include test for not-found/conflict where relevant.
- SHOULD add integration tests for critical cross-service flows.

## 12. PR Checklist (Required)

Every PR MUST satisfy:

- Naming and file structure follow this document.
- API contract changes are reflected in `shared/*` if shared.
- Error handling and validation follow standards.
- Tests are added/updated.
- Backward compatibility impact is stated in PR description.

## 13. AI Code Generation Prompt Block

Use this block when prompting AI tools:

```txt
Generate code for this monorepo following docs/development/code-standards.md strictly.
Use TypeScript and existing project architecture.
Keep backend runtime code inside services/*, shared contracts in shared/*.
Use REST for client-facing APIs, gRPC for internal sync calls, Kafka for async events.
Follow naming: camelCase, PascalCase, UPPER_SNAKE_CASE, kebab-case file/folder.
Use DTO validation + standard response/error envelope.
Return complete file-level patches (no pseudo-code) and include tests.
If assumptions are needed, list them explicitly before code.
```

## 14. Governance

- Changes to this file MUST be reviewed by at least 1 backend and 1 frontend maintainer.
- If a rule conflicts with a delivery constraint, document exception in PR and create follow-up task.
