# Ecommerce Microservices Monorepo

This repository is a multi-domain skeleton for an ecommerce platform with microservices, shared contracts, frontend apps, and infrastructure-as-code.

## Current status

The project has a complete directory blueprint and initial runnable scaffold for `services/api-gateway`.
Most business modules are still placeholders and should be implemented incrementally.

## Repository layout

- `services/`: backend microservices and `services/shared` runtime library.
- `shared/`: cross-service contracts and schemas (proto, Kafka event contracts, shared types).
- `frontend/`: buyer/seller apps and reusable frontend packages.
- `infrastructure/`: Docker, K3s, Kafka, monitoring, logging, Terraform.
- `cicd/`: Jenkins pipelines and deployment scripts.
- `docs/`: architecture, API, deployment, operations, and development docs.
- `scripts/`: local automation scripts.

## Shared code boundaries

- `services/shared`: backend runtime helpers for NestJS services (guards, pipes, interceptors, config, DTOs).
- `shared`: neutral contracts to be consumed by backend, frontend, and tooling.

## Monorepo tooling

This repository standardizes on **Turbo** for task orchestration.
`nx.json` is intentionally unused and kept only as a migration note.

## Quick start

1. Install dependencies for the packages you are actively developing.
2. Start with `services/api-gateway` as the first executable service.
3. Extend one domain service at a time and wire contracts through `shared/`.

See `docs/development/local-setup.md` for environment and compose conventions.
