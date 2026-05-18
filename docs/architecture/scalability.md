# Scalability & Performance

Last updated: 2026-05-18. See also [`system-design.md`](system-design.md).

## 1. Application Layer Scaling

- **Stateless services**: Session and ephemeral state live in Redis; business data in PostgreSQL, MongoDB, or MinIO. Any service pod can be scaled horizontally behind Kubernetes Deployments and Services.
- **API Gateway (Go)**: Single ingress with token-bucket rate limiting, connection-friendly proxying, and Prometheus metrics. Suitable for high connection counts when sized appropriately (see load-test notes in development docs).
- **Go-first backend**: **13 of 14** domain microservices run on Go (goroutines, low memory per request). Only `auth-service` remains NestJS.

## 2. Database Scaling

- **Connection pooling**: `pgx` (Go) and TypeORM (auth-service) cap open connections per instance.
- **Read scaling**: MongoDB replica sets for catalog/chat/live; PostgreSQL read replicas where configured in production overlays.
- **Analytics**: `analytics-service` stores events in **PostgreSQL** (`analytics_events_raw`, rollups). Heavy OLAP with ClickHouse is optional/future — not required in default `docker-compose.yml`.

## 3. Caching Strategy

- **Redis**: Token revocation (gateway, auth), cart hot path, product/video feed caches, idempotency keys, rate limits.
- **Cart**: Redis-primary with optional Postgres persistence (`CART_PERSISTENCE_ENABLED`).
- **Gateway / CDN**: Public catalog and static media URLs can be cached at the edge in production.

## 4. Asynchronous Processing

- **Kafka buffering**: Order, payment, shipping, chat, live, and notification flows use topics (`order.events`, `payment.events`, `chat.events`, `live.events`, etc.) to absorb traffic spikes.
- **Outbox dispatchers**: Background workers in Go services publish from `outbox_events` after the DB transaction commits.
- **Background jobs**: Reservation expiry (inventory), notification retries, and similar work run outside the HTTP request path.

## 5. Real-time & Live

- **Chat / live WebSocket**: Proxied through the gateway with extended timeouts; scale chat/live pods independently of REST handlers.
- **MediaMTX**: Dedicated media engine for live ingest (WHIP) and playback (WebRTC) — scale separately from application pods.
