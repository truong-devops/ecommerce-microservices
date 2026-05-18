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

## API

- [`api/`](api/) — Per-service API reference markdown.

## Deployment & operations

- [`deployment/on-prem-3vm-utm-k3s-deployment.md`](deployment/on-prem-3vm-utm-k3s-deployment.md) — On-prem K3s lab (UTM).
- [`development/on-prem-devops-lab-plan.md`](development/on-prem-devops-lab-plan.md) — DevOps lab planning.
- [`development/local-setup.md`](development/local-setup.md) — Local development.
- [`operations/`](operations/) — Runbooks and QA checklists.

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
