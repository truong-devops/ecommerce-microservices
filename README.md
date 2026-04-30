<p align="center">
  <img src="https://img.shields.io/badge/Go-1.22-00ADD8?style=for-the-badge&logo=go&logoColor=white"/>
  <img src="https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/>
  <img src="https://img.shields.io/badge/Apache_Kafka-2.x-231F20?style=for-the-badge&logo=apachekafka&logoColor=white"/>
  <img src="https://img.shields.io/badge/Kubernetes-K3s-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white"/>
  <img src="https://img.shields.io/badge/Turborepo-Monorepo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white"/>
</p>

<h1 align="center">Ecommerce Microservices Platform</h1>

<p align="center">
  A production-grade, cloud-native ecommerce platform built on a <strong>polyglot microservices architecture</strong>.<br/>
  Designed for scale, resilience, and developer velocity — all within a single, disciplined monorepo.
</p>

---

## Architecture Overview

The system is composed of **12 independent microservices**, each owning its own data store, deployment lifecycle, and domain boundary. All external traffic enters through a high-performance **API Gateway written in Go**, which handles authentication, rate limiting, and intelligent reverse proxying to downstream NestJS services.

Communication between services is **dual-mode**:
- **Synchronous**: HTTP/REST with per-service timeout contracts enforced at the gateway layer
- **Asynchronous**: Apache Kafka for event-driven workflows (order processing, inventory reservation, notification dispatch, analytics ingestion)

gRPC **Protocol Buffer definitions** in `shared/proto` serve as the source of truth for cross-service data contracts, ensuring type safety across language boundaries.

```
                        ┌─────────────────────────────────────────────┐
                        │              Clients                        │
                        │   buyer-web · buyer(mobile) · seller · mod  │
                        └─────────────────┬───────────────────────────┘
                                          │ HTTPS
                               ┌──────────▼──────────┐
                               │     API Gateway      │  Go · chi · JWT
                               │   Rate Limit · CORS  │  Prometheus · Zap
                               └──────┬──────┬────────┘
                        REST (per-svc)│      │ JWT validation
              ┌───────────────────────┘      └──────────────────────────┐
              │                                                         │
   ┌──────────▼──────────────────────────────────────────────────────┐ │
   │                     NestJS Microservices                        │ │
   │  auth · user · product · cart · order · payment                 │ │
   │  inventory · shipping · review · notification · analytics       │ │
   └──────────────────────────────┬──────────────────────────────────┘ │
                                  │ Kafka Events                        │
                         ┌────────▼────────┐                           │
                         │  Apache Kafka   │◄──────────────────────────┘
                         └────────┬────────┘
                    ┌─────────────┴──────────────┐
             ┌──────▼──────┐            ┌────────▼────────┐
             │  PostgreSQL  │            │    MongoDB       │
             │  Redis       │            │    ClickHouse    │
             └─────────────┘            └─────────────────┘
```

---

## Technology Stack

### API Gateway — Go
The single ingress point for all client traffic, built in **Go 1.22** for maximum throughput and minimal latency.

| Concern | Library |
|---|---|
| HTTP Router | `go-chi/chi v5` |
| Authentication | `golang-jwt/jwt v5` |
| Rate Limiting | `golang.org/x/time/rate` (token bucket) |
| Observability | `prometheus/client_golang` + `uber-go/zap` |
| CORS | `go-chi/cors` |

Internal package layout follows Go idiomatic layering: `internal/auth`, `internal/config`, `internal/handlers`, `internal/middleware`, `internal/observability`, `internal/proxy`, `internal/router`.

### Domain Services — NestJS / TypeScript
All 11 domain services are built with **NestJS 10** on **TypeScript 5.6**. Each service applies the same structural discipline:
- Module-scoped dependency injection with `@nestjs/common`
- Schema-validated configuration via `@nestjs/config` + `Joi`
- Global JWT + RBAC guards registered at the application level
- Health-check endpoints via `@nestjs/terminus`
- Structured logging and graceful shutdown

### Polyglot Persistence

| Service | Store | Rationale |
|---|---|---|
| auth, user, order, payment, cart, inventory, shipping, notification | **PostgreSQL 16** | ACID transactions, relational integrity |
| product, review | **MongoDB 7** | Flexible document schema for catalog & UGC |
| auth, product, cart | **Redis 7** | Token blacklisting, session cache, hot-path reads |
| analytics | **ClickHouse 24.3** | Columnar OLAP for high-throughput event aggregation |

### Messaging — Apache Kafka
**Confluent Kafka 7.6.1** powers the event backbone. All event schemas are versioned in `shared/kafka/` and follow a `domain.entity.action` naming convention with version paths (`v1/`, `v2/`) to guarantee backward compatibility.

### Authentication & Security
- **JWT Access Tokens** — RS256 signed, validated at both gateway and service layers
- **TOTP / 2FA** — `speakeasy` library for HMAC-based one-time passwords
- **Password Hashing** — `bcryptjs` with adaptive work factor
- **Role-Based Access Control** — `JwtAuthGuard` + `RolesGuard` applied globally, overridable per route

---

## Monorepo Structure

```
ecommerce-microservices/
│
├── services/                     # 12 independently deployable microservices
│   ├── api-gateway/              # Go — reverse proxy, auth, rate limiting
│   ├── auth-service/             # NestJS — JWT, TOTP, OAuth
│   ├── user-service/             # NestJS — profile, address management
│   ├── product-service/          # NestJS — catalog, search, media
│   ├── inventory-service/        # NestJS — stock reservation, alerts
│   ├── cart-service/             # NestJS — shopping cart, price snapshot
│   ├── order-service/            # NestJS — checkout saga, order lifecycle
│   ├── payment-service/          # NestJS — payment gateway, webhooks
│   ├── shipping-service/         # NestJS — carrier integration, tracking
│   ├── review-service/           # NestJS — ratings, UGC moderation
│   ├── notification-service/     # NestJS — email, push, in-app
│   └── analytics-service/        # NestJS — event ingestion, ClickHouse OLAP
│
├── packages/
│   └── backend-shared/           # NestJS runtime library (shared guards,
│                                 #   interceptors, pipes, decorators, DTOs)
│
├── shared/                       # Language-neutral cross-service contracts
│   ├── proto/                    # gRPC Protocol Buffer definitions
│   │   ├── auth.proto
│   │   ├── common.proto
│   │   ├── order.proto
│   │   └── product.proto
│   ├── kafka/                    # Kafka event schemas (versioned)
│   ├── contracts/                # TypeScript API shape contracts
│   ├── types/                    # Shared TypeScript types
│   ├── constants/                # Cross-service constants
│   └── utils/                    # Shared utility functions
│
├── frontend/
│   ├── apps/
│   │   ├── buyer/                # Mobile buyer application
│   │   ├── buyer-web/            # Web buyer application
│   │   ├── seller/               # Seller dashboard
│   │   └── moderator/            # Admin / moderation panel
│   └── packages/                 # 7 shared frontend packages
│       ├── api-client/           # Type-safe API client layer
│       ├── ui/                   # Design system components
│       ├── hooks/                # Shared React hooks
│       ├── stores/               # State management
│       ├── types/                # Frontend type definitions
│       ├── constants/            # UI constants
│       └── utils/                # Frontend utilities
│
├── infrastructure/
│   ├── docker/                   # Docker base images & init scripts
│   ├── k3s/                      # Kubernetes manifests (Kustomize)
│   │   ├── base/                 # Base Kustomize resources
│   │   ├── overlays/             # Environment overlays (dev/staging/prod)
│   │   ├── ingress/              # Ingress controller config
│   │   ├── hpa/                  # Horizontal Pod Autoscaler specs
│   │   ├── pdb/                  # Pod Disruption Budgets
│   │   └── networkpolicy/        # Zero-trust network policies
│   ├── kafka/                    # Kafka topic definitions
│   ├── monitoring/               # Prometheus · Grafana · Thanos
│   ├── logging/                  # Log aggregation (Fluent Bit / ELK)
│   └── terraform/                # Infrastructure as Code
│
├── cicd/
│   ├── Jenkinsfile               # Declarative pipeline
│   └── pipelines/                # Per-service pipeline definitions
│
├── docs/                         # Architecture, API, ops documentation
│   ├── architecture/             # System design, data flow, security
│   ├── api/                      # API reference docs
│   ├── deployment/               # Deployment runbooks
│   └── operations/               # Incident response, scaling playbooks
│
├── .github/
│   ├── workflows/                # GitHub Actions CI
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE/
│
├── turbo.json                    # Turborepo task pipeline
└── docker-compose.dev.yml        # Full local development stack
```

---

## Key Architectural Highlights

### Layered Shared Code Boundary
The project enforces a strict **two-tier sharing model**:

- **`packages/backend-shared`** — NestJS-specific runtime library. Contains production-ready guards, interceptors, pipes, decorators, DTOs, and database helpers. Imported only by NestJS services.
- **`shared/`** — Neutral, framework-agnostic contracts. Consumed by backend services, frontend apps, and tooling alike. This layer has zero NestJS or framework dependencies.

This boundary ensures the neutral contracts remain portable and the NestJS-specific optimizations stay out of frontend bundles.

### Kubernetes-Native Deployment
Kubernetes manifests are structured with **Kustomize overlays**, separating base resources from environment-specific configuration. Includes:
- **HPA** for CPU/memory-driven autoscaling per service
- **PodDisruptionBudgets** for zero-downtime rolling updates
- **NetworkPolicies** for micro-segmentation (zero-trust between namespaces)
- **Ingress** with TLS termination

### Observability Stack
- **Metrics**: Prometheus scrapes exposed endpoints; long-term retention via **Thanos**
- **Dashboards**: Grafana with pre-built service dashboards
- **Logs**: Fluent Bit ships structured JSON logs to the ELK stack
- **Tracing**: Correlation IDs propagated via HTTP headers at the gateway layer

### Monorepo Tooling
Task orchestration is handled by **Turborepo** (`turbo.json`), providing:
- Parallel execution of build/test/lint tasks with dependency awareness
- Remote caching for drastically reduced CI times
- Scoped execution: build only what changed

---

## Repository Stats

| Category | Count |
|---|---|
| Backend Microservices | 12 |
| Frontend Applications | 4 |
| Shared Frontend Packages | 7 |
| gRPC Proto Definitions | 4 |
| Infrastructure Components | 6 |
| Supported Databases | 4 (PG · Mongo · Redis · ClickHouse) |

---

## Documentation

Detailed documentation lives in the [`docs/`](./docs/) directory:

- [`docs/architecture/`](./docs/architecture/) — System design, data flow diagrams, security model, Kafka event catalog
- [`docs/actor_classification.md`](./docs/actor_classification.md) — Actor roles and permission matrix
- [`docs/db_mapping.md`](./docs/db_mapping.md) — Service-to-database ownership map
- [`docs/deployment/`](./docs/deployment/) — Kubernetes deployment runbooks
- [`docs/operations/`](./docs/operations/) — Incident response and operational playbooks

---

## License

[MIT](./LICENSE) © 2026 ecommerce-microservices contributors
