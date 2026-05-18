# Shipping Service Parity Checklist

## API Endpoints
- [x] `GET /api/v1/health`
- [x] `GET /api/v1/ready`
- [x] `GET /api/v1/live`
- [x] `POST /api/v1/shipments`
- [x] `GET /api/v1/shipments`
- [x] `GET /api/v1/shipments/order/:orderId`
- [x] `GET /api/v1/shipments/:id`
- [x] `PATCH /api/v1/shipments/:id/status`
- [x] `POST /api/v1/shipments/:id/tracking-events`
- [x] `GET /api/v1/shipments/:id/tracking-events`
- [x] `POST /api/v1/shipments/webhooks/:provider`

## Auth / RBAC
- [x] JWT required for all non-public endpoints
- [x] Webhook endpoint is public
- [x] Role matrix aligned with NestJS shipping-service
- [x] Customer read-scope restricted by `buyerId`

## Core Business Rules
- [x] Shipment unique by `order_id`
- [x] Status transition validation
- [x] Tracking-event append + optional status update
- [x] Audit log + status history persistence

## Idempotency / Reliability
- [x] Webhook idempotency (`provider`, `providerEventId`)
- [x] Payload hash conflict detection
- [x] Cached webhook response replay
- [x] Outbox table write in same DB transaction
- [x] Outbox dispatcher with exponential backoff retry

## Event Flow
- [x] Publish to `shipping.events`
- [x] Publish to `notification.events`
- [x] Publish to `analytics.events`
- [x] Consume `order.events` -> `order.created` auto-create shipment

## Delivery / Runtime
- [x] Go module and Dockerfile ready
- [x] `docker-compose.dev.yml` for standalone service test
- [x] Root `docker-compose.yml` routes `shipping-service` to Go implementation
- [x] `go test ./...` compile pass

## Cutover status

- [x] Root `docker-compose.yml` and API gateway use **Go** `shipping-service`
- [ ] Optional: re-run Nest vs Go compare scripts if legacy Nest image is still available
- [ ] Optional: extended soak tests for outbox + duplicate Kafka delivery
