<p align="center">
  <img src="https://img.shields.io/badge/Go-1.22_/_1.24-00ADD8?style=for-the-badge&logo=go&logoColor=white"/>
  <img src="https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/>
  <img src="https://img.shields.io/badge/Apache_Kafka-7.6-231F20?style=for-the-badge&logo=apachekafka&logoColor=white"/>
  <img src="https://img.shields.io/badge/Kubernetes-K3s-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white"/>
  <img src="https://img.shields.io/badge/Services_in_Go-13/14-00ADD8?style=for-the-badge&logo=go&logoColor=white"/>
</p>

<h1 align="center">Ecommerce Microservices Platform</h1>

<p align="center">
  A production-grade, cloud-native ecommerce platform built on a <strong>polyglot microservices architecture</strong>.<br/>
  Designed for scale, resilience, and developer velocity — all within a single, disciplined monorepo.
</p>

---

## Architecture Overview

The platform has **14 domain microservices** (each with its own data store and deployment lifecycle) plus an **API Gateway**. **13 of 14** domain services run on **Go**; only **`auth-service`** remains on **NestJS/TypeScript**. Catalog (`product-service`), fulfillment (`shipping-service`), engagement (`chat-service`, `live-service`), and the rest of the stack are Go in the default `docker-compose.yml` stack. All client traffic enters through the **Go API Gateway** (JWT, rate limiting, reverse proxy).

Communication between services is **dual-mode**:
- **Synchronous**: HTTP/REST with per-service timeout contracts enforced at the gateway layer
- **Asynchronous**: Apache Kafka for event-driven workflows (order processing, inventory reservation, payment capture, notification dispatch, analytics ingestion, chat events)

gRPC **Protocol Buffer definitions** in `shared/proto/` serve as the source of truth for cross-service data contracts, ensuring type safety across language boundaries.

```
                        ┌─────────────────────────────────────────────────────┐
                        │                     Clients                         │
                        │   buyer-web · buyer (mobile) · seller · moderator   │
                        └────────────────────────┬────────────────────────────┘
                                                 │ HTTPS
                                    ┌────────────▼─────────────┐
                                    │       API Gateway        │  Go · chi · JWT
                                    │  Rate Limit · CORS · WS  │  Prometheus · Zap
                                    └─────┬──────────────┬─────┘
                            REST (per-svc)│              │ JWT validation
              ┌───────────────────────────┘              └────────────────────────────────┐
              │                                                                           │
   ┌──────────▼───────────────────────────────────────────────────────────────────────┐   │
   │                       Go Microservices (chi · pgx · zap)                         │   │
   │   user · product · cart · order · payment · inventory · shipping                 │   │
   │   notification · review · analytics · chat · media · live                        │   │
   ├──────────────────────────────────────────────────────────────────────────────────┤   │
   │                      NestJS (TypeScript) — auth only                             │   │
   │   auth-service                                                                   │   │
   └──────────────────────────────────┬───────────────────────────────────────────────┘   │
                                      │ Kafka Events                                      │
                             ┌────────▼────────┐                                          │
                             │  Apache Kafka   │◄─────────────────────────────────────────┘
                             └────────┬────────┘
                        ┌─────────────┴──────────────┐
                 ┌──────▼──────┐            ┌────────▼────────┐
                 │  PostgreSQL │            │    MongoDB      │
                 │  Redis      │            │    MinIO        │
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
| Token Revocation | `redis/go-redis v9` |

The gateway routes to **14 downstream services** (`auth`, `user`, `product`, `media`, `cart`, `order`, `payment`, `inventory`, `shipping`, `review`, `notification`, `analytics`, `chat`, `live`), each with its own configurable timeout. Public endpoints (login, register, catalog browse, review listing, WebSocket chat/live) are accessible without authentication; all other routes pass through JWT validation middleware.

Internal package layout: `internal/auth`, `internal/config`, `internal/handlers`, `internal/middleware`, `internal/observability`, `internal/proxy`, `internal/router`.

### Domain Services — Go (13 services)

13 of 14 domain microservices are written in Go (plus the Go API Gateway). Each follows a clean architecture with idiomatic package layout:

| Concern | Library / Pattern |
|---|---|
| HTTP Router | `go-chi/chi v5` |
| Database (PostgreSQL) | `jackc/pgx v5` |
| Database (MongoDB) | `go.mongodb.org/mongo-driver` |
| Object Storage | MinIO SDK |
| JWT Auth | `golang-jwt/jwt v5` |
| Logging | `uber-go/zap` |
| Kafka | `segmentio/kafka-go` |
| Caching | `redis/go-redis v9` |
| Configuration | Environment variables with startup validation |

Internal package layout per Go service: `cmd/server` (entrypoint), `internal/auth`, `internal/config`, `internal/domain`, `internal/handler`, `internal/httpx`, `internal/middleware`, `internal/repository`, `internal/router`, `internal/service`, `internal/events`.

**Go services:** `api-gateway` · `user` · `product` · `cart` · `order` · `payment` · `inventory` · `shipping` · `notification` · `review` · `analytics` · `chat` · `media` · `live`

Legacy NestJS catalog code remains in `services/product-service-nest/` for shadow/compare scripts only; it is **not** started by root `docker compose up`.

### Domain Services — NestJS / TypeScript (1 service)

**`auth-service`** on **NestJS 10** / **TypeScript 5.6**:
- JWT (RS256), TOTP/2FA (speakeasy), session management, token revocation, password hashing (bcryptjs), Passport strategies, Google OAuth

The auth service applies:
- Module-scoped dependency injection with `@nestjs/common`
- Schema-validated configuration via `@nestjs/config` + `Joi`
- Global JWT + RBAC guards registered at the application level
- Health-check endpoints via `@nestjs/terminus`
- Structured logging and graceful shutdown

### Polyglot Persistence

| Store | Services | Rationale |
|---|---|---|
| **PostgreSQL 16** | auth, user, order, payment, cart, inventory, shipping, notification, analytics | ACID transactions, relational integrity |
| **MongoDB 7** | product, review, chat, live | Flexible document schema for catalog, UGC, conversations, live sessions |
| **Redis 7** | auth, product, cart, order, payment, review, chat, api-gateway | Token blacklisting, session cache, rate-limit state, idempotency locks |
| **MinIO** | media | S3-compatible object storage for product images and media assets |

### Messaging — Apache Kafka

**Confluent Kafka 7.6.1** powers the event backbone. All event schemas are versioned in `shared/kafka/` and follow a `domain.entity.action` naming convention.

**Key event flows:**

| Event | Producers | Consumers |
|---|---|---|
| `order.created` | order-service | inventory-service (reserve stock) |
| `order.cancelled` | order-service | inventory-service (release stock) |
| `order.status-updated` | order-service | notification-service, analytics-service |
| `inventory.reserved` | inventory-service | payment-service, order-service |
| `inventory.reservation-failed` | inventory-service | order-service (transition → FAILED) |
| `payment.authorized` / `payment.captured` | payment-service | order-service |
| `payment.failed` | payment-service | order-service, inventory-service |
| `chat.message.created` / `chat.message.read` | chat-service | notification-service, analytics-service |
| `live.events` | live-service | analytics-service, audit flows |
| `user.registered` | user-service | notification-service, analytics-service |

All services implement the **Outbox Pattern** — events are written to an `outbox_events` table within the same database transaction, then published to Kafka by a background dispatcher. This guarantees zero message loss even during broker downtime.

### Authentication & Security

- **JWT Access Tokens** — validated at both the API Gateway and individual service layers
- **TOTP / 2FA** — `speakeasy` library for HMAC-based one-time passwords (auth-service)
- **Password Hashing** — `bcryptjs` with adaptive work factor (auth-service)
- **Token Revocation** — Redis-backed blacklist checked at gateway middleware
- **Role-Based Access Control** — JWT middleware + role checks applied globally in each service (Go: custom middleware, NestJS: `JwtAuthGuard` + `RolesGuard`)
- **Idempotency** — Redis-backed distributed locks for critical write operations (order creation, payment processing)

---

## Monorepo Structure

```
ecommerce-microservices/
│
├── services/                         # 14 domain microservices + legacy product-service-nest
│   ├── api-gateway/                  # Go — reverse proxy, auth, rate limiting, CORS
│   ├── auth-service/                 # NestJS — JWT, TOTP, OAuth, session management
│   ├── user-service/                 # Go — profile, address management
│   ├── product-service/              # Go — catalog, shops, shoppable video (MongoDB)

│   ├── media-service/                # Go — S3/MinIO upload, pre-signed URLs
│   ├── inventory-service/            # Go — stock reservation, low-stock alerts
│   ├── cart-service/                 # Go — shopping cart, price snapshot, TTL
│   ├── order-service/                # Go — checkout, order lifecycle, idempotency
│   ├── payment-service/              # Go — payment gateway integration, webhooks
│   ├── shipping-service/             # Go — carrier integration, tracking, webhooks
│   ├── review-service/               # Go — ratings, UGC moderation (MongoDB)
│   ├── notification-service/         # Go — email, push, in-app notifications
│   ├── chat-service/                 # Go — real-time buyer↔seller chat (WebSocket)
│   ├── live-service/                 # Go — live commerce, WebSocket, MediaMTX
│   └── analytics-service/            # Go — event ingestion, aggregations (PostgreSQL)
│
├── packages/
│   └── backend-shared/               # NestJS runtime library (shared guards,
│                                     #   interceptors, pipes, decorators, DTOs)
│                                     #   Used by auth-service only
│
├── shared/                           # Language-neutral cross-service contracts
│   ├── proto/                        # gRPC Protocol Buffer definitions
│   │   ├── auth.proto
│   │   ├── common.proto
│   │   ├── order.proto
│   │   └── product.proto
│   ├── kafka/                        # Kafka event schemas & topic registry
│   ├── contracts/                    # TypeScript API shape contracts
│   ├── types/                        # Shared TypeScript types
│   ├── constants/                    # Cross-service constants
│   └── utils/                        # Shared utility functions
│
├── frontend/
│   ├── apps/
│   │   ├── buyer/                    # Mobile buyer application
│   │   ├── buyer-web/                # Web buyer application
│   │   ├── seller/                   # Seller dashboard
│   │   └── moderator/                # Admin / moderation panel
│   └── packages/                     # 7 shared frontend packages
│       ├── api-client/               # Type-safe API client layer
│       ├── ui/                       # Design system components
│       ├── hooks/                    # Shared React hooks
│       ├── stores/                   # State management
│       ├── types/                    # Frontend type definitions
│       ├── constants/                # UI constants
│       └── utils/                    # Frontend utilities
│
├── infrastructure/
│   ├── docker/                       # Docker base images & init scripts
│   ├── k3s/                          # Kubernetes manifests (Kustomize)
│   │   ├── base/                     # Base Kustomize resources
│   │   ├── overlays/                 # Environment overlays (dev/staging/prod)
│   │   ├── namespaces/               # Namespace definitions
│   │   ├── ingress/                  # Ingress controller config
│   │   ├── hpa/                      # Horizontal Pod Autoscaler specs
│   │   ├── pdb/                      # Pod Disruption Budgets
│   │   └── networkpolicy/            # Zero-trust network policies
│   ├── kafka/                        # Kafka topic definitions
│   ├── monitoring/                   # Prometheus · Grafana · Thanos
│   ├── logging/                      # Log aggregation (Fluent Bit / ELK)
│   ├── terraform/                    # Infrastructure as Code
│   └── emall-proxy-nginx/            # Nginx reverse proxy configuration
│
├── cicd/
│   ├── Jenkinsfile                   # Declarative pipeline
│   ├── pipelines/                    # Per-service pipeline definitions
│   └── scripts/                      # CI/CD helper scripts
│
├── scripts/                          # Test & benchmark scripts (36 scripts)
│
├── docs/                             # Architecture, API, ops documentation
│   ├── architecture/                 # System design, data flow, security,
│   │                                 #   scalability, Kafka event catalog
│   ├── docs-service/                 # Per-service detailed documentation
│   ├── api/                          # API reference docs
│   ├── deployment/                   # Deployment runbooks
│   ├── development/                  # Code standards
│   └── operations/                   # Incident response, scaling playbooks
│
├── .github/
│   ├── workflows/                    # GitHub Actions CI
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE/
│
├── turbo.json                        # Turborepo task pipeline
├── docker-compose.yml                # Full stack (14 domain services + gateway + infra)
└── docker-compose.local.yml          # Lightweight local development
```

---

## Key Architectural Highlights

### Service Inventory

| # | Service | Language | Database | Kafka | Key Capabilities |
|---|---|---|---|---|---|
| 1 | `api-gateway` | Go 1.22 | Redis | — | Reverse proxy, JWT validation, rate limiting, CORS, Prometheus metrics |
| 2 | `auth-service` | NestJS 10 | PostgreSQL + Redis | ✓ | JWT issuance, TOTP/2FA, OAuth, token revocation, password hashing |
| 3 | `user-service` | Go | PostgreSQL + Redis | ✓ | User profiles, address management, account settings |
| 4 | `product-service` | Go 1.24 | MongoDB + Redis | optional | Catalog, shops, shoppable video; OpenSearch optional |
| 5 | `media-service` | Go | MinIO | — | Presigned upload/download, bucket management |
| 6 | `inventory-service` | Go | PostgreSQL | ✓ | Stock levels, reservation with TTL, low-stock alerts, outbox dispatcher |
| 7 | `cart-service` | Go | PostgreSQL + Redis | ✓ | Cart CRUD, price snapshots, TTL expiry, external validation |
| 8 | `order-service` | Go | PostgreSQL + Redis | ✓ | Order lifecycle, state machine, idempotency, outbox, audit log |
| 9 | `payment-service` | Go | PostgreSQL + Redis | ✓ | Payment gateway (mock), authorization, capture, webhooks |
| 10 | `shipping-service` | Go 1.24 | PostgreSQL + Redis | ✓ | Carrier integration, shipment tracking, webhook idempotency |
| 11 | `review-service` | Go | MongoDB + Redis | — | Ratings, text reviews, UGC moderation |
| 12 | `notification-service` | Go | PostgreSQL + Redis | ✓ | Email, push, in-app, dispatch with retry |
| 13 | `chat-service` | Go | MongoDB + Redis | ✓ | Real-time WebSocket chat, rate limiting, conversation management |
| 14 | `live-service` | Go 1.24 | MongoDB + Redis | ✓ | Live sessions, WebSocket, WHIP/WebRTC via MediaMTX |
| 15 | `analytics-service` | Go | PostgreSQL + Redis | optional | Event ingest, reporting (PostgreSQL OLTP store) |

### Layered Shared Code Boundary

The project enforces a strict **two-tier sharing model**:

- **`packages/backend-shared`** — NestJS-specific runtime library. Imported only by **`auth-service`**.
- **`shared/`** — Neutral, framework-agnostic contracts. Consumed by all backend services (Go and NestJS), frontend apps, and tooling alike. This layer has zero framework dependencies.

Go services implement their own middleware, auth, and response envelope logic in `internal/` packages, following Go idiomatic patterns rather than importing from `packages/backend-shared`.

### Order Processing Pipeline

The order service implements a production-grade order lifecycle with:

1. **Idempotency** — Redis distributed locks + persistent records prevent duplicate order creation
2. **State Machine** — Explicit `OrderStatusTransitions` map enforces valid transitions (PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED)
3. **Outbox Pattern** — Events are written atomically with business data, then published asynchronously by a background dispatcher
4. **Audit Trail** — Every status change is recorded with actor, role, request ID, timestamp, and metadata
5. **RBAC Enforcement** — Customers can only view/cancel their own orders; staff roles have elevated access

### Kubernetes-Native Deployment

Kubernetes manifests are structured with **Kustomize overlays**, separating base resources from environment-specific configuration. Includes:
- **Namespaces** for logical isolation
- **HPA** for CPU/memory-driven autoscaling per service
- **PodDisruptionBudgets** for zero-downtime rolling updates
- **NetworkPolicies** for micro-segmentation (zero-trust between namespaces)
- **Ingress** with TLS termination

### Observability Stack

- **Metrics**: Prometheus scrapes exposed `/metrics` endpoints; long-term retention via **Thanos**
- **Dashboards**: Grafana with pre-built service dashboards
- **Logs**: Fluent Bit ships structured JSON logs to the ELK stack
- **Tracing**: Correlation IDs (`X-Request-ID`) propagated via HTTP headers at the gateway layer

### Monorepo Tooling

Task orchestration is handled by **Turborepo** (`turbo.json`), providing:
- Parallel execution of build/test/lint tasks with dependency awareness
- Remote caching for drastically reduced CI times
- Scoped execution: build only what changed

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Go 1.22+ (for Go service development)
- Node.js 20+ & npm 10 (for NestJS services and frontend)

### Start All Services

```bash
# Start the full stack (14 domain services + api-gateway + infrastructure)
docker compose up -d

# View logs
docker compose logs -f api-gateway order-service

# API Gateway is available at http://localhost:12000
```

### Service Ports

| Service | Port |
|---|---|
| API Gateway | `12000` |
| auth-service | `12010` |
| user-service | `12011` |
| product-service | `12012` |
| inventory-service | `12013` |
| review-service | `12014` |
| cart-service | `12015` |
| order-service | `12016` |
| payment-service | `12017` |
| shipping-service | `12018` |
| notification-service | `12019` |
| chat-service | `12020` |
| analytics-service | `12021` |
| media-service | `12022` |
| live-service | `12023` |
| MinIO API | `12030` |
| MinIO Console | `12031` |
| MediaMTX (live ingest/playback) | `12089` |

---

## Repository Stats

| Category | Count |
|---|---|
| Domain microservices | 14 (13 Go + 1 NestJS) + API Gateway (Go) |
| Frontend Applications | 4 |
| Shared Frontend Packages | 7 |
| gRPC Proto Definitions | 4 |
| Infrastructure Components | 7 |
| Test & Benchmark Scripts | 36 |
| Supported Data Stores | 4 (PostgreSQL · MongoDB · Redis · MinIO) |

---

## Documentation

Detailed documentation lives in the [`docs/`](./docs/) directory:

- [`docs/architecture/`](./docs/architecture/) — System design, data flow diagrams, security model, scalability, Kafka event catalog
- [`docs/docs-service/`](./docs/docs-service/) — Per-service onboarding guides
- [`docs/actor_classification.md`](./docs/actor_classification.md) — Actor roles and permission matrix
- [`docs/db_mapping.md`](./docs/db_mapping.md) — Service-to-database ownership map
- [`docs/development/`](./docs/development/) — Code standards and conventions
- [`docs/deployment/`](./docs/deployment/) — Kubernetes deployment runbooks
- [`docs/operations/`](./docs/operations/) — Incident response and operational playbooks

---

## Contributing

Please read our [Contributing Guide](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md) before submitting pull requests.

## License

[MIT](./LICENSE) © 2026 ecommerce-microservices contributors
