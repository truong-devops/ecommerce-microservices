<p align="center">
  <img src="https://img.shields.io/badge/Go-1.22_/_1.24-00ADD8?style=for-the-badge&logo=go&logoColor=white"/>
  <img src="https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/>
  <img src="https://img.shields.io/badge/Apache_Kafka-7.6-231F20?style=for-the-badge&logo=apachekafka&logoColor=white"/>
  <img src="https://img.shields.io/badge/Kubernetes-K3s-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white"/>
  <img src="https://img.shields.io/badge/Services_in_Go-14/15-00ADD8?style=for-the-badge&logo=go&logoColor=white"/>
</p>

<h1 align="center">Ecommerce Microservices Platform</h1>

<p align="center">
  A production-grade, cloud-native ecommerce platform built on a <strong>polyglot microservices architecture</strong>.<br/>
  Designed for scale, resilience, and developer velocity — all within a single, disciplined monorepo.
</p>

---

## Architecture Overview

The platform has **14 active domain microservices** (each with its own data store and deployment lifecycle) plus an **API Gateway**. **14 of 15** active services run on **Go** (using Go 1.22 and Go 1.24); only the **`auth-service`** is implemented in **NestJS/TypeScript**. All client traffic enters through the **Go API Gateway**, which handles JWT validation, token blacklisting, rate limiting, CORS, and reverse proxying.

Communication between services is **dual-mode**:
- **Synchronous**: HTTP/REST with per-service timeout contracts enforced at the gateway layer.
- **Asynchronous**: Apache Kafka for event-driven workflows (order processing, inventory reservation, payment capture, notification dispatch, analytics ingestion, chat events).

gRPC **Protocol Buffer definitions** in `shared/proto/` serve as the source of truth for cross-service RPC contracts, ensuring type safety across language boundaries.

```
                        ┌─────────────────────────────────────────────────────┐
                        │                     Clients                         │
                        │   buyer-web · buyer (mobile) · seller · moderator   │
                        └────────────────────────┬────────────────────────────┘
                                                 │ HTTPS
                                    ┌────────────▼─────────────┐
                                    │       API Gateway        │  Go 1.22 · chi · JWT
                                    │  Rate Limit · CORS · WS  │  Prometheus · Zap · Redis
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

### API Gateway — Go 1.22
The single ingress point for all client traffic, built in **Go 1.22** for maximum throughput and minimal latency.
* **HTTP Router**: `go-chi/chi/v5`
* **Authentication**: `golang-jwt/jwt/v5` (custom verification + header propagation)
* **Rate Limiting**: `golang.org/x/time/rate` (token bucket)
* **Observability**: `prometheus/client_golang` + `uber-go/zap`
* **CORS**: `go-chi/cors`
* **Token Revocation**: `redis/go-redis/v9` (checks token blacklist on every request)
* **WebSocket Proxying**: Native WebSocket upgrades and routing to `chat-service` and `live-service`.

### Domain Services — Go (13 Active Services)
Services are written in either **Go 1.22** or **Go 1.24** depending on performance requirements.
* **Go 1.24**: `product-service`, `shipping-service`, `live-service`
* **Go 1.22**: `user-service`, `media-service`, `inventory-service`, `cart-service`, `order-service`, `payment-service`, `review-service`, `notification-service`, `chat-service`, `analytics-service`
* **Clean Architecture**: Standard Go structure (`cmd/server/`, `internal/domain`, `internal/repository`, `internal/service`, `internal/handler`, `internal/events`).
* **Key Libraries**: `jackc/pgx/v5` (PostgreSQL), `go.mongodb.org/mongo-driver/v2` (MongoDB), `redis/go-redis/v9` (Caching/Distributed Locks), `segmentio/kafka-go` (Messaging), `gorilla/websocket` (Realtime).

### Domain Services — NestJS / TypeScript (1 Active Service)
* **`auth-service`** on **NestJS 10** / **TypeScript 5.6**:
  * JWT (RS256 key pair), TOTP/2FA (`speakeasy`), Session caching (`ioredis`), Google OAuth (`passport-google-oauth20`).
  * Structured configuration validation (`joi`), health endpoints (`@nestjs/terminus`), and Kafka event publishing (`kafkajs`).
* **`product-service-nest`** (**DEPRECATED/LEGACY**): NestJS version kept solely for shadow/comparison scripts. It is **not** active in production or started via `docker-compose.yml`.

### Polyglot Persistence

| Store | Services | Rationale |
|---|---|---|
| **PostgreSQL 16** | `auth`, `user`, `cart`, `order`, `payment`, `inventory`, `shipping`, `notification`, `analytics` | ACID transactions, strict schemas, relational integrity |
| **MongoDB 7** | `product`, `review`, `chat`, `live` | Dynamic document structure for products, user reviews, messages, and live sessions |
| **Redis 7** | `api-gateway`, `auth`, `user`, `product`, `cart`, `order`, `payment`, `shipping`, `review`, `notification`, `chat`, `live`, `analytics` | Session state, token blacklist, rate limit storage, cache lookup, distributed locks |
| **MinIO** | `media` | S3-compatible object storage for product images and media files |

---

## Monorepo Structure

The project is structured as a Turborepo monorepo, organizing all services, packages, infrastructure, and frontend apps in one repository:

```
ecommerce-microservices/
├── services/                         # 14 Active Domain Services + 1 API Gateway + 1 Legacy
│   ├── api-gateway/                  # Go 1.22 — Gateway, reverse proxy, JWT validation, rate limiting
│   ├── auth-service/                 # NestJS 10 — Authentication, OAuth, 2FA, session management
│   ├── user-service/                 # Go 1.22 — User profile and address management
│   ├── product-service/              # Go 1.24 — Product catalog, shops, and shoppable video (MongoDB)
│   ├── media-service/                # Go 1.22 — MinIO S3 upload, presigned URLs
│   ├── inventory-service/            # Go 1.22 — Stock levels, reservation with TTL, outbox publisher
│   ├── cart-service/                 # Go 1.22 — Cart CRUD, price snapshotting, TTL expiry
│   ├── order-service/                # Go 1.22 — Order state machine, idempotency, outbox pattern
│   ├── payment-service/              # Go 1.22 — Payment gateway integration mock, capture, outbox
│   ├── shipping-service/             # Go 1.24 — Carrier integration, tracking webhook idempotency
│   ├── review-service/               # Go 1.22 — Ratings, text reviews, UGC moderation (MongoDB)
│   ├── notification-service/         # Go 1.22 — Multi-channel notification dispatcher (Email, push, in-app)
│   ├── chat-service/                 # Go 1.22 — Buyer-seller WebSocket chat (MongoDB)
│   ├── live-service/                 # Go 1.24 — Live commerce WebSocket, MediaMTX video integration
│   ├── analytics-service/            # Go 1.22 — Event ingestion, OLTP postgres reporting
│   └── product-service-nest/         # NestJS — [LEGACY] Kept for shadow compare scripts only
│
├── frontend/                         # Frontend Applications & Shared Client Packages
│   ├── apps/
│   │   ├── buyer/                    # React Native / Expo 52 — Mobile client
│   │   ├── buyer-web/                # React 19 + Vite 6 + TailwindCSS 4 — Web client
│   │   ├── seller/                   # React 19 + Vite 6 + TailwindCSS 4 — Seller dashboard
│   │   └── moderator/                # React 19 + Vite 6 + TailwindCSS 4 — Admin moderation panel
│   └── packages/
│       ├── api-client/               # Type-safe Axios client layer using Zod DTO validations
│       ├── ui/                       # Shared React components design system (Framer Motion 12)
│       ├── hooks/                    # Shared React Query hooks & WebSocket connection hooks
│       ├── stores/                   # Global state management using Zustand 5
│       ├── types/                    # Shared TypeScript domain entity type definitions
│       ├── constants/                # Shared frontend routes, statuses, error maps
│       └── utils/                    # Common formatting, validation, storage utilities
│
├── packages/
│   └── backend-shared/               # NestJS shared helpers (guards, interceptors, pipes, DTOs)
│
├── shared/                           # Framework-agnostic contracts & shared schemas
│   ├── proto/                        # gRPC Protobuf definitions (auth, order, product, common)
│   ├── kafka/                        # Kafka topic registry & domain event type schemas
│   ├── contracts/                    # Request/Response contract shapes for REST API
│   ├── types/                        # Neutral cross-cutting TypeScript types
│   ├── constants/                    # Endpoints, roles, service names, Kafka group constants
│   └── utils/                        # Neutral helper libraries (validation, logger, crypto)
│
├── infrastructure/                   # Infrastructure configuration
│   ├── docker/                       # Dockerfiles and SQL DB init scripts (10 postgres databases)
│   ├── k3s/                          # Kubernetes manifests (Kustomize overlays, HPA, NetworkPolicies)
│   ├── kafka/                        # Kafka topic definitions with partition/retention config
│   ├── monitoring/                   # Prometheus configuration, Thanos dashboards, Grafana dashboards
│   ├── logging/                      # Fluent Bit configs, Elasticsearch and Kibana setup
│   ├── terraform/                    # AWS Terraform modules (EKS, RDS, ElastiCache, MSK)
│   └── emall-proxy-nginx/            # Nginx SSL reverse-proxy configurations
│
├── cicd/                             # Pipeline Automation
│   ├── Jenkinsfile                   # Declarative multi-stage Jenkins pipeline
│   ├── pipelines/                    # Dedicated Jenkins fragments per microservice
│   └── scripts/                      # Selective build, docker build, and deployment scripts
│
└── scripts/                          # 36 developer test, benchmark, and migrations scripts
```

---

## Architectural Deep Dive

### Choreography-Based Saga (Order Checkout)
The system leverages event-driven choreography through Kafka to execute checkout transactions across inventory, payment, and order services:

```
[order-service]                  [inventory-service]                [payment-service]               [notification-service]
       │                                  │                                 │                                 │
1. Create Order (PENDING)                 │                                 │                                 │
       ├─► order.created ────────────────►│                                 │                                 │
       │                                  │                                 │                                 │
       │                         2. Reserve Stock                           │                                 │
       │                                  ├─► inventory.reserved ──────────►│                                 │
       │                                  │                                 │                                 │
       │                                  │                        3. Capture Payment                         │
       │                                  │                                 ├─► payment.captured ────────────►│
       │                                  │                                 │ (Send Email/SMS notification)   │
       │                                  │                                 ├─► payment.captured ──┐          │
       │◄───────────────────────────────────────────────────────────────────┘                      │          │
4. Update Order (CONFIRMED)               │                                                        │          │
       │                                  │                                                        │          │
       │◄─────────────────────────────────┴────────────────────────────────────────────────────────┘          │
       │                                                                                                      │
```
* **Compensation Flow**: If `payment.failed` is produced, `inventory-service` consumes it and releases the reserved stock (producing `inventory.released`), while `order-service` transitions the order to `FAILED`.

### The Transactional Outbox Pattern
To prevent distributed transaction failures and avoid dual-write inconsistencies, services writing to Kafka implement the **Outbox Pattern**:
1. Within a database transaction, business data is written alongside an event message into an `outbox_events` table.
2. A background Go daemon (`OutboxDispatcher`) polls the `outbox_events` table every 100ms.
3. The event is successfully published to Kafka.
4. The event is marked as dispatched (`dispatched_at`) or deleted, preventing message loss even during Kafka broker outages.

### Security and Identity Propagation
* **JWT Access**: Issued by `auth-service` using an RS256 private key.
* **Gateway Decryption**: `api-gateway` validates the JWT token signature using the public key and checks a Redis-backed blacklist for revoked sessions.
* **Header Propagation**: Once authenticated, the gateway injects downstream headers:
  * `X-User-ID`
  * `X-User-Role` (e.g., `buyer`, `seller`, `moderator`, `admin`)
  * `X-User-Email`
* Downstream Go services check these headers directly, ensuring high throughput by skipping token parsing.

---

## Kafka Topic & Event Registry

All events follow a `domain.entity.action` naming standard and are registered in `shared/kafka/src/topics.ts`.

| Topic Name | Partitions | Key Events | Producers | Consumers |
|---|---|---|---|---|
| `order.events` | 6 | `order.created`, `order.cancelled`, `order.status_updated` | `order-service` | `inventory-service`, `shipping-service`, `notification-service`, `analytics-service` |
| `inventory.events` | 3 | `inventory.reserved`, `inventory.reservation_failed`, `inventory.released` | `inventory-service` | `payment-service`, `order-service` |
| `payment.events` | 3 | `payment.captured`, `payment.failed` | `payment-service` | `order-service`, `inventory-service`, `notification-service` |
| `user.events` | 3 | `user.registered`, `user.profile_updated` | `user-service`, `auth-service` | `notification-service`, `analytics-service` |
| `chat.events` | 3 | `chat.message.created`, `chat.message.read` | `chat-service` | `notification-service`, `analytics-service` |
| `live.events` | 3 | `live.session_started`, `live.session_ended` | `live-service` | `analytics-service` |
| `shipping.events` | 3 | `shipping.shipment_created`, `shipping.status_updated` | `shipping-service` | `order-service`, `notification-service` |
| `analytics.events` | 6 | Ingestion of raw business events | All services | `analytics-service` |

---

## Port Registry

| Component | Host Port | Description |
|---|---|---|
| **`api-gateway`** | `12000` | Ingress gateway (Go) |
| **`auth-service`** | `12010` | Auth & Session controller (NestJS) |
| **`user-service`** | `12011` | Profiles & Addresses (Go) |
| **`product-service`** | `12012` | MongoDB Product Catalog (Go) |
| **`inventory-service`** | `12013` | Stock reservation Engine (Go) |
| **`review-service`** | `12014` | Ratings & Reviews database (Go) |
| **`cart-service`** | `12015` | Shopping Cart store (Go) |
| **`order-service`** | `12016` | Order checkout orchestrator (Go) |
| **`payment-service`** | `12017` | Mock Payment processor (Go) |
| **`shipping-service`** | `12018` | Shipments & tracking webhook handler (Go) |
| **`notification-service`** | `12019` | Email & push dispatcher (Go) |
| **`chat-service`** | `12020` | WebSocket direct chat broker (Go) |
| **`analytics-service`** | `12021` | Ingest aggregations processor (Go) |
| **`media-service`** | `12022` | MinIO file upload controller (Go) |
| **`live-service`** | `12023` | WebSocket livestream interactions (Go) |
| **MinIO Console** | `12031` | MinIO administration UI (API: `12030`) |
| **PostgreSQL 16** | `12032` | Relational database instance |
| **MongoDB 7** | `12033` | Document store database instance |
| **Redis 7** | `12034` | Caching & lock instance |
| **Kafka UI** | `12080` | Confluent Kafka Web Panel |
| **Schema Registry** | `12081` | Protobuf/JSON schema registry |
| **MediaMTX** | `12089` | RTMP/WebRTC Livestream server |
| **Kafka Broker** | `12092` | Event bus broker |

---

## Local Development Quickstart

### Prerequisites
* **Docker & Docker Compose**
* **Go 1.22+ / 1.24+** (for local service runs)
* **Node.js 20+** & **npm 10** (for NestJS and React workspaces)

### 1. Launching the Infrastructure & Services
You can boot the entire stack (services, databases, brokers, and web UIs) directly:
```bash
# Clone the repository and navigate to root
cd ecommerce-microservices

# Boot the backend stack
docker compose up -d

# Verify all services are healthy
docker compose ps
```

### 2. Monorepo Scripts
Run commands from the root directory to orchestrate dependencies via Turborepo:
```bash
# Install all node packages (nest backend, shared contracts, react frontends)
npm install

# Build all workspace assets
npm run build

# Start local development watch mode in parallel
npm run dev

# Run all test pipelines
npm run test

# Run code formatters
npm run format
```

### 3. Service Runner Helpers
For running services locally outside Docker for rapid debugging:
```bash
# Launch a backend Go service locally with correct env vars
./start-service.sh order-service

# Run a frontend client app locally
./run-fe.sh buyer-web
```

---

## Operations & Observability

### Kubernetes Setup
Deployments are defined in `infrastructure/k3s/` using **Kustomize** overlays (`overlays/dev/`, `overlays/prod/`):
* **Autoscaling**: Horizontal Pod Autoscaler (HPA) configured for resource spikes.
* **Fault Tolerance**: Pod Disruption Budgets (PDB) ensure minimal available replicas during rollouts.
* **Security**: NetworkPolicies strictly isolate inter-service communications (default-deny egress/ingress model).

### Monitoring Stack
* **Prometheus**: Scrapes `/metrics` endpoints across all Go services.
* **Thanos**: Handles long-term metric storage and clustering.
* **Grafana**: Visualizes metrics through pre-configured telemetry dashboards.
* **ELK Stack**: Fluent Bit streams JSON container logs to Elasticsearch for indexing and Kibana dashboard analysis.

---

## Contributors & License

* Detailed contributing guidelines can be found in [CONTRIBUTING.md](./CONTRIBUTING.md).
* Code of Conduct guidelines are located in [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

Licensed under the [MIT License](./LICENSE) © 2026 ecommerce-microservices contributors.
