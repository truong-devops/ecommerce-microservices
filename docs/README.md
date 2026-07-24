# Documentation Index

Last updated: 2026-05-18.

## Architecture

- [`architecture/system-design.md`](architecture/system-design.md) — **Canonical** platform overview (services, ports, Kafka, storage).
- [`architecture/data-flow.md`](architecture/data-flow.md) — Request and checkout flows.
- [`architecture/kafka-events.md`](architecture/kafka-events.md) — Event naming and topics.
- [`architecture/scalability.md`](architecture/scalability.md) — Scaling and performance.
- [`architecture/security.md`](architecture/security.md) — Auth, RBAC, validation.
- [`architecture/chat-realtime-design.md`](architecture/chat-realtime-design.md) — Buyer–seller chat.
- Live / video plans under `architecture/livestream-*`, `shoppable-video-*` (may include historical migration notes).

## Presentation Diagrams

- [`diagram/media-commerce-presentation-flows.md`](diagram/media-commerce-presentation-flows.md) — concise deployment, runtime, livestream, video, and chat flows with rendered PNG/SVG images.

## API

- [`api/`](api/) — Per-service API reference markdown.

## Deployment & operations

- [`devsecops/new-platform-design.md`](devsecops/new-platform-design.md) — Current GitLab CI pipeline and target DevSecOps platform.
- [`devsecops/rag-risk-gate-proposal.md`](devsecops/rag-risk-gate-proposal.md) — Proposed RAG-based DevSecOps risk gate research extension.
- [`development/local-setup.md`](development/local-setup.md) — Local development.
- [`operations/buyer-profile-phase-a-qa-checklist.md`](operations/buyer-profile-phase-a-qa-checklist.md) — Buyer profile QA checklist.

## Development

- [`development/code-standards.md`](development/code-standards.md) — Team coding rules.
- [`development/product-service-rewrite-plan.md`](development/product-service-rewrite-plan.md) — **Historical** Go migration plan (completed for default compose).
- [`db_mapping.md`](db_mapping.md) — Service-to-database map.

## Per-service guides

- [`docs-service/`](docs-service/) — Short onboarding guides per microservice.

## Domain & use cases

- [`actor_classification.md`](actor_classification.md), [`actor_usecases.md`](actor_usecases.md)
- [`img-uc/`](img-uc/) — Use-case and architecture diagrams

When docs disagree with code, prefer **`docker-compose.yml`**, service `internal/config`, and [`architecture/system-design.md`](architecture/system-design.md).
