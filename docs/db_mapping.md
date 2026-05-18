# E-commerce Microservices - Database Mapping

Last updated: 2026-05-18. Runtime defaults: root `docker-compose.yml`.

## 1. Service → Database

| Service | Database / store | Notes |
|---|---|---|
| API Gateway | Redis | Token revocation, rate-limit state when enabled |
| Auth Service | PostgreSQL, Redis | `auth_db`; sessions / revocation |
| User Service | PostgreSQL, Redis | `ecommerce_user` |
| Product Service | MongoDB, Redis | `ecommerce_product`; OpenSearch optional (`SEARCH_ENABLED`) |
| Media Service | MinIO | S3-compatible object storage |
| Cart Service | Redis, PostgreSQL (optional) | Redis-primary; Postgres when persistence enabled |
| Order Service | PostgreSQL, Redis | Shared `ecommerce` DB + migrations |
| Payment Service | PostgreSQL, Redis | Shared `ecommerce` DB |
| Inventory Service | PostgreSQL | Reservations, stock, outbox |
| Shipping Service | PostgreSQL, Redis | Shipments, tracking, outbox |
| Review Service | MongoDB, Redis | `ecommerce_review` |
| Chat Service | MongoDB, Redis | `ecommerce_chat` |
| Live Service | MongoDB, Redis | `ecommerce_live`; MediaMTX for media path |
| Notification Service | PostgreSQL, Redis | Templates, dispatch queue |
| Analytics Service | PostgreSQL, Redis (optional) | `analytics_events_raw`, `seller_daily_metrics` |

**Not in default compose:** `services/product-service-nest/` (legacy NestJS catalog for shadow tests).

## 2. Infrastructure (compose)

| Component | Image / role |
|---|---|
| PostgreSQL 16 | OLTP for auth, user, cart, order, payment, inventory, shipping, notification, analytics |
| MongoDB 7 | product, review, chat, live |
| Redis 7 | Cache, sessions, idempotency |
| MinIO | Media objects |
| Kafka 7.6 | Domain and aggregate event topics |
| MediaMTX | Live stream ingest/playback |

## 3. Elasticsearch / OpenSearch

- Optional search index for **product-service** when `SEARCH_ENABLED=true`.
- Source of truth remains **MongoDB**; search engine holds denormalized indexes for full-text and faceted queries.
- OpenSearch is API-compatible with Elasticsearch for most catalog search use cases.

## 4. Legacy note on ClickHouse

Some older docs refer to ClickHouse for analytics. The **current Go `analytics-service`** uses **PostgreSQL** (see `services/analytics-service/migrations/0001_init_analytics_service.sql`). Treat ClickHouse as a possible future migration path, not the default stack.
