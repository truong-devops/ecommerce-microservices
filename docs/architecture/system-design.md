# System Design

Last updated: 2026-05-18  
Source of truth for runtime layout: root `docker-compose.yml`, `services/api-gateway/internal/config/config.go`, and per-service `internal/config`.

This document describes the **current** e-commerce microservices platform. Older docs may still mention NestJS `product-service` or `shipping-service`; both runtimes are **Go** in the default compose stack. `product-service-nest` remains in the repo for migration reference only and is **not** started by `docker compose up`.

---

## 1. Architectural Style

The platform uses a **microservices architecture** inside a single monorepo. Business capabilities are split into independently deployable services, each with its own data store (where applicable), container image, and configuration.

| Layer | Count | Notes |
|---|---|---|
| **Edge** | 1 | `api-gateway` (Go) — single HTTP entry for clients |
| **Domain microservices** | 14 | Auth, commerce, fulfillment, engagement, analytics |
| **Total backend processes (compose)** | 15 | 14 domain services + gateway |

### Language split (default stack)

| Runtime | Services |
|---|---|
| **Go** (13) | `api-gateway`, `user-service`, `product-service`, `media-service`, `cart-service`, `order-service`, `payment-service`, `inventory-service`, `shipping-service`, `review-service`, `notification-service`, `chat-service`, `live-service`, `analytics-service` |
| **NestJS / TypeScript** (1) | `auth-service` only |

Go services use **chi**, **pgx** (PostgreSQL), **mongo-driver** (MongoDB), **kafka-go**, **zap**, and **JWT** middleware in `internal/`. NestJS `auth-service` uses Passport, TypeORM, and `@nestjs/config`.

### Clients

Four frontend apps under `frontend/apps/`:

- `buyer` — mobile buyer
- `buyer-web` — web buyer
- `seller` — seller dashboard
- `moderator` — moderation panel

All call the platform through the API gateway (local default: `http://localhost:12000`).

---

## 2. High-Level Diagram

```
                    ┌──────────────────────────────────────────────┐
                    │  buyer · buyer-web · seller · moderator      │
                    └─────────────────────┬────────────────────────┘
                                          │ HTTPS
                              ┌───────────▼───────────┐
                              │     api-gateway       │  Go · JWT · rate limit
                              │  /health · /metrics   │  Redis token revocation
                              └───────────┬───────────┘
          ┌────────────────────────────────┼────────────────────────────────┐
          │ REST proxy                   │                                │
   ┌──────▼──────┐  ┌─────────────┐  ┌───▼────┐  ┌─────────┐  ┌──────────▼────────┐
   │ auth (Nest) │  │ product (Go)│  │ cart   │  │ order   │  │ chat · live (Go)  │
   │ user (Go)   │  │ media (Go)  │  │ payment│  │ shipping│  │ WS via gateway    │
   └──────┬──────┘  └──────┬──────┘  └───┬────┘  └────┬────┘  └──────────┬────────┘
          │                │             │            │                     │
          └────────────────┴─────────────┴────────────┴─────────────────────┘
                                          │
                    ┌─────────────────────▼─────────────────────┐
                    │  Kafka 7.6 (Confluent) · domain topics    │
                    └─────────────────────┬─────────────────────┘
          ┌───────────────────────────────┼───────────────────────────────┐
   ┌──────▼──────┐  ┌──────────┐  ┌────────▼────────┐  ┌────────┐  ┌──────────┐
   │ PostgreSQL  │  │ MongoDB  │  │ Redis           │  │ MinIO  │  │ MediaMTX │
   │ 16          │  │ 7        │  │ 7               │  │        │  │ (live)   │
   └─────────────┘  └──────────┘  └─────────────────┘  └────────┘  └──────────┘
```

---

## 3. Component Layout

### 3.1 Edge layer — API Gateway

- **Role**: Reverse proxy, JWT validation, rate limiting (`golang.org/x/time/rate`), CORS, request ID, Prometheus metrics (`/metrics`).
- **Downstream routes** (14 services): `auth`, `user`, `product`, `media`, `cart`, `order`, `payment`, `inventory`, `shipping`, `review`, `notification`, `analytics`, `chat`, `live`.
- **Public routes** (no JWT): auth login/register/OAuth, product catalog browse, shop/video feeds, review listing, chat WebSocket, live session browse/WebSocket, selected analytics-style public events on product/live.
- **Protected routes**: JWT middleware + Redis-backed revocation when `REDIS_ENABLED=true`.
- **Long timeouts**: `chat` and `live` use extended proxy timeouts (24h) for WebSocket.

Implementation: `services/api-gateway/internal/router/router.go`.

### 3.2 Domain services (by capability)

| Group | Services |
|---|---|
| **Identity** | `auth-service`, `user-service` |
| **Catalog & media** | `product-service` (catalog, shops, shoppable video), `media-service` (MinIO presigned URLs) |
| **Commerce** | `cart-service`, `inventory-service`, `order-service`, `payment-service` |
| **Fulfillment** | `shipping-service` |
| **Engagement** | `review-service`, `chat-service`, `live-service` |
| **Platform** | `notification-service`, `analytics-service` |

### 3.3 Service inventory (docker-compose defaults)

| Service | Language | Host port | Primary stores | Kafka (compose default) |
|---|---|---:|---|---|
| `api-gateway` | Go 1.22 | 12000 | Redis | — |
| `auth-service` | NestJS 10 | 12010 | PostgreSQL, Redis | broker wired |
| `user-service` | Go 1.24 | 12011 | PostgreSQL, Redis | off (`KAFKA_ENABLED=false`) |
| `product-service` | Go 1.24 | 12012 | MongoDB, Redis | off |
| `inventory-service` | Go 1.24 | 12013 | PostgreSQL | off (outbox dispatcher still configured) |
| `review-service` | Go 1.24 | 12014 | MongoDB, Redis | — |
| `cart-service` | Go 1.24 | 12015 | PostgreSQL, Redis | off |
| `order-service` | Go 1.24 | 12016 | PostgreSQL, Redis | **on** |
| `payment-service` | Go 1.24 | 12017 | PostgreSQL, Redis | consumes `order.events` |
| `shipping-service` | Go 1.24 | 12018 | PostgreSQL, Redis | **on** |
| `notification-service` | Go 1.24 | 12019 | PostgreSQL, Redis | **on** |
| `chat-service` | Go 1.24 | 12020 | MongoDB, Redis | **on** |
| `analytics-service` | Go 1.24 | 12021 | PostgreSQL, Redis | off |
| `media-service` | Go 1.22 | 12022 | MinIO | — |
| `live-service` | Go 1.24 | 12023 | MongoDB, Redis | **on** |

**Infrastructure ports (compose):** MinIO API `12030`, console `12031`; MediaMTX ingest/playback `12089` (and related UDP/WebRTC ports).

`SEARCH_ENABLED=false` on `product-service` in compose — OpenSearch/Elasticsearch is optional and not required for the default stack.

### 3.4 Legacy / not in default compose

| Path | Status |
|---|---|
| `services/product-service-nest/` | NestJS catalog implementation kept for shadow/compare scripts; **not** deployed by root `docker-compose.yml` |
| ClickHouse for `analytics-service` | Documented in some service guides; **current Go service uses PostgreSQL** via `DATABASE_URL` (see `services/analytics-service/internal/config/config.go`) |

---

## 4. Data Layer (Polyglot Persistence)

| Store | Used by (default stack) | Purpose |
|---|---|---|
| **PostgreSQL 16** | `auth`, `user`, `cart`, `order`, `payment`, `inventory`, `shipping`, `notification`, `analytics` | ACID transactions, relational domains |
| **MongoDB 7** | `product`, `review`, `chat`, `live` | Flexible catalog, UGC, conversations, live sessions |
| **Redis 7** | Gateway, auth, user, product, cart, order, payment, shipping, review, chat, live, notification, analytics | Sessions, revocation, caches, idempotency, rate limits |
| **MinIO** | `media-service` | S3-compatible object storage |
| **MediaMTX** | `live-service` | WHIP ingest / WebRTC playback for live commerce |

Database-per-service: each microservice owns its schema/database name; Postgres uses multiple DBs via `infrastructure/docker/postgres/init-multiple-dbs.sql`.

Detailed mapping: [`docs/db_mapping.md`](../db_mapping.md) (update that file separately if you need parity with `live-service` / analytics storage).

---

## 5. Messaging — Apache Kafka

- **Broker**: Confluent Kafka `7.6.1` in compose (`kafka:29092` internal, `localhost:9092` host).
- **Contracts**: `shared/kafka/` — topic names follow `domain.entity.action` where applicable; aggregate topics such as `order.events`, `payment.events`, `chat.events`, `live.events`, `analytics.events`.
- **Delivery**: At-least-once; consumers use idempotency records where implemented.
- **Outbox pattern**: `order-service`, `inventory-service`, `payment-service`, `shipping-service`, `chat-service` (and similar) write to `outbox_events` in the same DB transaction; background dispatchers publish to Kafka.

Key flows (see also [`kafka-events.md`](kafka-events.md)):

| Flow | Producer | Consumer(s) |
|---|---|---|
| Checkout / order lifecycle | `order-service` → `order.events` | `payment-service`, `shipping-service`, `notification-service`, analytics hooks |
| Payment outcome | `payment-service` → `payment.events` | `order-service` (status), downstream notification/analytics |
| Inventory reservation | `inventory-service` → `inventory.events` | `order-service`, `payment-service` paths (when Kafka enabled) |
| Chat | `chat-service` → `chat.events` | `notification-service`, analytics |
| Live commerce | `live-service` → `live.events` | analytics / audit topics |
| User registration | `user-service` → `user.registered` | When `KAFKA_ENABLED=true` |

Compose defaults disable Kafka on several services to simplify local dev; enable per-service via `KAFKA_ENABLED` env vars when testing full event paths.

---

## 6. Communication Patterns

### 6.1 Synchronous (HTTP/REST)

- Client → **api-gateway** → service (`/api/v1/...` prefixes).
- Service-to-service: HTTP with configurable timeouts (e.g. cart → product/inventory, order → cart/product, live → product, payment → order via gateway URL in compose).
- **gRPC / Protocol Buffers**: contract definitions in `shared/proto/` (`auth`, `common`, `order`, `product`). Primary client traffic remains REST through the gateway.

### 6.2 Asynchronous (Kafka)

- Domain events and aggregate topics decouple producers from notification, shipping, payment, and analytics side effects.
- Prefer outbox dispatch over direct “dual write” to Kafka from handlers.

### 6.3 Real-time

- **Chat**: WebSocket at `/api/v1/chat/ws` (proxied to `chat-service`).
- **Live**: WebSocket at `/api/v1/live/ws`; media path uses MediaMTX (WHIP/WebRTC) with env `LIVE_MEDIA_*`.

---

## 7. Security Model

- **JWT access tokens** (shared secret in dev; RS256-capable in auth-service) validated at gateway and service middleware.
- **Refresh tokens, TOTP/2FA, OAuth (Google)** — `auth-service`.
- **Token revocation** — Redis blacklist checked in gateway when enabled.
- **RBAC** — role claims in JWT; per-service middleware/guards.
- **Idempotency** — Redis + DB records on critical writes (orders, payments, webhooks).

Details: [`security.md`](security.md).

---

## 8. Order Processing (reference flow)

Event-driven checkout (simplified):

1. Client submits checkout → `order-service` creates `PENDING` order (Postgres) + outbox row.
2. Dispatcher publishes to `order.events`.
3. `inventory-service` reserves stock → `inventory.events`.
4. `payment-service` authorizes/captures (mock gateway in dev) → `payment.events`.
5. `order-service` updates state machine (`PENDING` → `CONFIRMED` → …).
6. `shipping-service` reacts to order events; `notification-service` sends email/push.

Order service features: idempotency locks, explicit status transitions, audit trail, RBAC on order APIs.

Data-flow narrative: [`data-flow.md`](data-flow.md).

---

## 9. Monorepo Boundaries

| Path | Responsibility |
|---|---|
| `services/*` | Runtime code — **no direct imports across services** |
| `shared/*` | Proto, Kafka schemas, TS contracts/types/constants |
| `packages/backend-shared/*` | NestJS helpers — **auth-service only** in current stack |
| `frontend/*` | Apps + shared UI/API packages (Turborepo workspaces) |
| `infrastructure/*` | Docker, K3s/Kustomize, Kafka topics, monitoring, Terraform |
| `scripts/*` | Integration tests and bench/compare scripts |

Go services do **not** import `packages/backend-shared`; they implement `internal/auth`, `internal/httpx`, etc. locally.

Coding rules: [`docs/development/code-standards.md`](../development/code-standards.md).

---

## 10. Deployment Architecture

### Local development

```bash
docker compose up -d    # full stack: 15 services + kafka, postgres, mongo, redis, minio, mediamtx
```

Lightweight variant: `docker-compose.local.yml`.

### Kubernetes

Manifests under `infrastructure/k3s/` (Kustomize base + overlays, HPA, PDB, NetworkPolicy, ingress). Intended runtime: **K3s** or compatible Kubernetes.

### CI/CD

- `cicd/` — Jenkins pipelines
- `.github/workflows/` — GitHub Actions

---

## 11. Observability

- **Metrics**: Prometheus scrapes service `/metrics` (gateway exposes `prometheus/client_golang`).
- **Logs**: Structured JSON (zap in Go services).
- **Correlation**: `X-Request-ID` propagated from gateway middleware.
- **Stack configs**: `infrastructure/monitoring/` (Prometheus, Grafana, Thanos), `infrastructure/logging/` (ELK-oriented).

Scalability notes: [`scalability.md`](scalability.md) (section on “9 of 12 Go services” is outdated — prefer this document for service counts).

---

## 12. Related Documentation

| Topic | Document |
|---|---|
| Kafka catalog | [`kafka-events.md`](kafka-events.md) |
| Request/order flows | [`data-flow.md`](data-flow.md) |
| Security | [`security.md`](security.md) |
| DB mapping | [`db_mapping.md`](../db_mapping.md) |
| Local setup | [`development/local-setup.md`](../development/local-setup.md) |
| Per-service API | [`docs/api/`](../api/) |
| Per-service guides | [`docs/docs-service/`](../docs-service/) |
| Repository overview | root [`README.md`](../../README.md) |

When README root and this file disagree on service language or count, **trust `docker-compose.yml` and service source** and treat README as pending update.
