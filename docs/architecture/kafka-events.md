# Kafka Events

Apache Kafka is the backbone of asynchronous communication in this platform.

## Event Standards

- **Naming Convention**: `domain.entity.action` (e.g., `order.created`, `payment.failed`).
- **Format**: JSON payloads.
- **Versioning**: Breaking changes require a new topic or a versioned envelope (`v2.order.created`).
- **At-Least-Once Delivery**: Producers and consumers are configured for at-least-once delivery. Idempotency is handled at the application layer.

## Key Topics & Contracts

All contracts are strictly defined in `shared/kafka/`.

### 1. User Events
- `user.registered`: Fired when a new user signs up. Consumed by `notification-service` (welcome email) and `analytics-service`.
- `user.updated`: Fired when profile changes.

### 2. Order Events
- `order.created`: Initial order state. Consumed by `inventory-service` to reserve stock.
- `order.status-updated`: Fired on status changes (CONFIRMED, SHIPPED, DELIVERED). Consumed by `notification` and `analytics`.
- `order.cancelled`: Fired on cancellation. Consumed by `inventory-service` to release reserved stock.

### 3. Inventory Events
- `inventory.reserved`: Stock successfully held for an order. Consumed by `payment-service` or `order-service` to proceed.
- `inventory.reservation-failed`: Out of stock. Consumed by `order-service` to transition order to `FAILED`.

### 4. Payment Events
- `payment.authorized`: Payment secured. Consumed by `order-service`.
- `payment.captured`: Funds captured.
- `payment.failed`: Payment rejected. Consumed by `order-service` to transition to `FAILED` and `inventory-service` to release stock.

### 5. Notification & Analytics
- `notification.events`: Topic for queuing raw dispatch requests.
- `analytics.events`: Firehose topic. All services can publish here for the `analytics-service` to ingest into ClickHouse.

### 6. Chat Events
- `chat.conversation.created`: Conversation lifecycle event.
- `chat.message.created`: Fired whenever a new buyer/seller message is stored.
- `chat.message.read`: Fired when participant marks conversation as read.
- `chat.events`: Aggregated chat topic consumed by notification/analytics flows.

## The Outbox Pattern
Services do not write to Kafka directly from business logic. They write to an `outbox_events` table in the same database transaction as the business entity. A separate asynchronous worker (`outbox_dispatcher.go` or NestJS equivalent) polls the outbox and publishes to Kafka, ensuring zero data loss if Kafka is temporarily down.
