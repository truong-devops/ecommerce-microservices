# Data Flow

This document details how data moves through the e-commerce system during key business operations.

## 1. General Request Flow

1. **Client Request**: A buyer or seller interacts with the web/mobile client.
2. **Gateway Processing**: The request hits the API Gateway. The Gateway extracts the JWT, verifies its signature against the auth-service's public key (or cached secret), enforces rate limits, and proxies the request to the appropriate downstream service.
3. **Service Processing**: The target microservice receives the request (with injected `X-User-Id` and role headers).
4. **Validation & Business Logic**: The service validates the input and executes domain logic.
5. **Database Interaction**: The service reads from or writes to its dedicated database (PostgreSQL, MongoDB).
6. **Response**: A standardized envelope (`success`, `data`, `meta`) is returned to the client.

## 2. Order Checkout Flow (Saga / Event-Driven)

The checkout process is the most complex data flow, spanning multiple services:

1. **Cart Submission**: `order-service` receives a checkout request. It synchronously calls `cart-service` to get the current cart snapshot and `product-service` to verify prices.
2. **Order Creation**: `order-service` creates a `PENDING` order in PostgreSQL and writes an `order.created` event to its local outbox table in the same transaction.
3. **Event Dispatch**: The `outbox_dispatcher` picks up the outbox record and publishes `order.created` to Kafka.
4. **Inventory Reservation**: `inventory-service` consumes `order.created`, reserves the stock in its database, and publishes `inventory.reserved` (or `inventory.failed`).
5. **Payment Authorization**: `payment-service` consumes `inventory.reserved`, interacts with the external payment gateway, and publishes `payment.authorized`.
6. **Order Confirmation**: `order-service` consumes `payment.authorized` and updates the order status to `CONFIRMED`.
7. **Notification**: `notification-service` consumes `order.status_updated` and emails the customer.

## 3. Data Consistency

Because each microservice has its own database, we rely on **Eventual Consistency**.

- **Transactional Outbox**: Used by Go services (`pgx` transaction + `internal/events` dispatcher) and `auth-service` (TypeORM) so domain writes and outbox rows commit atomically before Kafka publish.
- **Idempotency**: Consumers maintain an `idempotency_records` table to ensure that processing the same Kafka event twice (at-least-once delivery) does not result in duplicate business actions.
