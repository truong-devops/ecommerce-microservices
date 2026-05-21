# Checkout Saga Remaining Work

Status: remaining checkout saga production checks completed
Last updated: 2026-05-20

## 1. Current State

Đã triển khai MVP code wiring cho checkout saga:

- `order-service` tạo `order_saga_states` khi tạo order.
- `processed_events` đã có trong `order-service`, `inventory-service`, `payment-service`.
- Event publisher đã có `eventId`.
- `inventory-service` consume `order.created` để reserve stock.
- `inventory-service` publish `inventory.reserved` hoặc `inventory.reservation-failed`.
- `order-service` consume `inventory.events`.
- `order-service` consume `payment.events`.
- `inventory-service` consume `order.status-updated` để confirm/release reservation.
- `payment-service` vẫn mock-only, dùng `payment.captured` và `payment.failed`.
- `processed_events` đã scope theo `consumer_name` để nhiều service không chặn nhau khi dùng chung database local.
- Unit tests và service-level Go tests đã pass.

Đã làm thêm sau file này:

- Đã thêm 3 integration scripts:
  - `scripts/test-checkout-saga.sh`
  - `scripts/test-checkout-saga-inventory-failure.sh`
  - `scripts/test-checkout-saga-payment-failure.sh`
- Đã thêm pending saga timeout worker trong `order-service`.
- Đã thêm structured logs tối thiểu cho checkout saga consumers, state transitions và timeout.
- Đã thêm stuck-saga SQL query và manual recovery runbook trong file này.
- Đã thêm basic checkout saga metrics ở `order-service` qua `/metrics` và `/api/v1/metrics`.
- Đã thêm DB integration test có điều kiện bằng `CHECKOUT_SAGA_TEST_DATABASE_URL`.
- Đã chạy Docker/Kafka/Postgres E2E thật cho happy path, inventory failure path và payment failure path.
- Đã fix các vấn đề production phát hiện khi chạy E2E:
  - serialize shared Postgres migrations bằng advisory lock.
  - mở rộng enum `role` để shared DB có `SERVICE`.
  - scope `processed_events` theo `consumer_name`.
  - filter shared `outbox_events` theo event owner prefix.
  - giới hạn order/payment publisher về topic domain chính để tránh partial publish qua topic phụ.
- Đã thêm config timeout:
  - `CHECKOUT_SAGA_TIMEOUT_ENABLED`
  - `CHECKOUT_SAGA_TIMEOUT_INTERVAL_MS`
  - `CHECKOUT_SAGA_TIMEOUT_AFTER_MS`
  - `CHECKOUT_SAGA_TIMEOUT_BATCH_SIZE`

Vẫn chưa làm:

- Chưa có Prometheus client library/native histogram; hiện metrics là text endpoint format Prometheus tối thiểu.

## 2. Remaining Work Checklist

### 2.1 Integration Scripts

- [x] Add `scripts/test-checkout-saga.sh`.
- [x] Add `scripts/test-checkout-saga-inventory-failure.sh`.
- [x] Add `scripts/test-checkout-saga-payment-failure.sh`.
- [x] Make scripts print clear pass/fail steps.
- [x] Make scripts fail fast with useful response bodies.
- [x] Document required env variables at top of each script.

### 2.2 Docker/Kafka E2E Verification

- [x] Start full required stack.
- [x] Run happy path checkout saga.
- [x] Run inventory failure path.
- [x] Run payment failure path.
- [x] Check DB state after each scenario.
- [x] Check no stuck outbox events.
- [x] Check no stuck saga states.

### 2.3 Production Hardening

- [x] Add pending saga timeout policy.
- [x] Add stuck saga SQL query.
- [x] Add structured logs around saga transitions.
- [x] Add basic saga metrics.
- [x] Add manual recovery docs.

### 2.4 DB Integration Tests

- [x] Add repository/integration test setup for Postgres.
- [x] Test `order_saga_states`.
- [x] Test `processed_events`.
- [x] Test duplicate event behavior with real DB constraints.
- [x] Test saga timeout transition with real DB transaction.

### 2.5 Final Documentation Cleanup

- [x] Update `docs/development/checkout-saga-implementation-plan.md` status after E2E passes.
- [ ] Add commands and known caveats to local setup docs if needed.
- [ ] Add troubleshooting section for Kafka consumer lag/stuck outbox.

## 3. How To Implement Integration Scripts

### 3.1 Common Script Utilities

Create shared shell helpers inside each script first. Keep it simple; do not introduce a framework.

Suggested helpers:

```bash
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

call_api() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local token="${4:-}"
  local idempotency_key="${5:-}"
  # Use curl -sS -o tmp -w "%{http_code}"
}

json_field() {
  # Use python3 to read nested JSON fields.
}

wait_until() {
  # Retry command/check for N seconds.
}
```

Required tools:

```bash
curl
python3
docker
```

Recommended env variables:

```bash
API_BASE_URL="${API_BASE_URL:-http://localhost:12000/api/v1}"
ORDER_BASE_URL="${ORDER_BASE_URL:-http://localhost:12016/api/v1}"
INVENTORY_BASE_URL="${INVENTORY_BASE_URL:-http://localhost:12013/api/v1}"
PAYMENT_BASE_URL="${PAYMENT_BASE_URL:-http://localhost:12017/api/v1}"
JWT_SECRET="${JWT_SECRET:-dev-shared-jwt-access-secret-min-32-chars}"
CUSTOMER_ID="${CUSTOMER_ID:-11111111-1111-4111-8111-111111111111}"
ADMIN_ID="${ADMIN_ID:-22222222-2222-4222-8222-222222222222}"
SELLER_ID="${SELLER_ID:-33333333-3333-4333-8333-333333333333}"
TEST_SKU="${TEST_SKU:-SAGA-SKU-001}"
```

Use generated JWTs like existing service test scripts do.

Reference script patterns:

- `scripts/test-payment-service.sh`
- `scripts/test-inventory-service.sh`
- `scripts/test-order-service.sh`

## 4. Happy Path Script

File:

```txt
scripts/test-checkout-saga.sh
```

Goal:

```txt
order.created
-> inventory.reserved
-> payment.captured
-> order CONFIRMED
-> inventory.confirmed
```

Steps:

1. Check health:

```bash
curl -sS "$ORDER_BASE_URL/health"
curl -sS "$INVENTORY_BASE_URL/health"
curl -sS "$PAYMENT_BASE_URL/health"
```

2. Ensure stock exists.

Use inventory adjust endpoint. If current API requires auth, use admin/warehouse token.

Expected effect:

```txt
SKU exists
onHand >= requested quantity
reserved = 0 or available >= requested quantity
```

3. Create order.

Request should contain one item with `TEST_SKU`.

Important:

- Use `Idempotency-Key`.
- Use product id that product-service accepts.
- Ensure order payload creates `order.created` event with `items[].sku` and `items[].quantity`.

Expected:

```txt
HTTP 201
order.status = PENDING
order_saga_states row exists with:
  saga_status = PENDING
  inventory_status = PENDING
  payment_status = PENDING
```

4. Wait for inventory reservation.

Poll DB or inventory API.

Expected:

```txt
inventory_reservations.status = ACTIVE
order_saga_states.inventory_status = RESERVED
```

5. Create mock payment intent.

Request:

```json
{
  "orderId": "<order-id>",
  "currency": "USD",
  "amount": "<order-total>",
  "provider": "mock",
  "autoCapture": true
}
```

Expected:

```txt
payment.status = CAPTURED
payment.captured event published
```

6. Wait for order confirmed.

Expected:

```txt
orders.status = CONFIRMED
order_saga_states.saga_status = COMPLETED
order_saga_states.payment_status = CAPTURED
order_saga_states.inventory_status = RESERVED
```

7. Wait for inventory confirmation.

Expected:

```txt
inventory_reservations.status = CONFIRMED
inventory_items.reserved decreased
inventory_items.on_hand decreased by ordered quantity
```

8. Check outbox.

Expected:

```sql
SELECT COUNT(*)
FROM outbox_events
WHERE status IN ('PENDING', 'FAILED')
  AND created_at < now() - interval '30 seconds';
```

Should be `0` for the tested service databases, or documented if unrelated events exist.

## 5. Inventory Failure Script

File:

```txt
scripts/test-checkout-saga-inventory-failure.sh
```

Goal:

```txt
order.created
-> inventory.reservation-failed
-> order FAILED
```

Steps:

1. Set stock to unavailable.

Options:

- Use a SKU that does not exist.
- Or set stock lower than requested quantity.

2. Create order with that SKU.

Expected:

```txt
order.status starts as PENDING
```

3. Wait for `inventory.reservation-failed`.

Check `inventory-service` outbox or Kafka side effect.

Expected:

```txt
inventory.reservation-failed event exists
```

4. Wait for order failed.

Expected:

```txt
orders.status = FAILED
order_saga_states.saga_status = FAILED
order_saga_states.inventory_status = FAILED
```

5. Verify no active reservation.

Expected:

```sql
SELECT COUNT(*)
FROM inventory_reservations
WHERE order_id = '<order-id>' AND status = 'ACTIVE';
```

Result should be `0`.

6. Try payment intent.

Expected:

```txt
payment-service rejects payment intent because order is not payable
```

## 6. Payment Failure Script

File:

```txt
scripts/test-checkout-saga-payment-failure.sh
```

Goal:

```txt
order.created
-> inventory.reserved
-> payment.failed
-> order FAILED
-> inventory.released
```

Steps:

1. Ensure stock exists.

2. Create order.

Expected:

```txt
order.status = PENDING
```

3. Wait for active reservation.

Expected:

```txt
inventory_reservations.status = ACTIVE
order_saga_states.inventory_status = RESERVED
```

4. Create mock payment intent with failure.

Request:

```json
{
  "orderId": "<order-id>",
  "currency": "USD",
  "amount": "<order-total>",
  "provider": "mock",
  "simulatedStatus": "FAILED"
}
```

Expected:

```txt
payment.status = FAILED
payment.failed event published
```

5. Wait for order failed.

Expected:

```txt
orders.status = FAILED
order_saga_states.saga_status = FAILED
order_saga_states.payment_status = FAILED
```

6. Wait for inventory release.

Expected:

```txt
inventory_reservations.status = RELEASED
inventory_items.reserved restored/decreased
inventory_items.on_hand not decreased
```

## 7. Useful SQL Checks

Orders:

```sql
SELECT id, status, total_amount, created_at, updated_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;
```

Saga:

```sql
SELECT *
FROM order_saga_states
ORDER BY updated_at DESC
LIMIT 10;
```

Inventory:

```sql
SELECT order_id, sku, quantity, status, expires_at, created_at, updated_at
FROM inventory_reservations
ORDER BY created_at DESC
LIMIT 10;
```

Stock:

```sql
SELECT sku, on_hand, reserved, on_hand - reserved AS available, updated_at
FROM inventory_items
WHERE sku = '<sku>';
```

Payments:

```sql
SELECT order_id, status, amount, currency, provider, created_at, updated_at
FROM payments
ORDER BY created_at DESC
LIMIT 10;
```

Processed events:

```sql
SELECT event_id, event_type, topic, partition, offset_value, processed_at
FROM processed_events
ORDER BY processed_at DESC
LIMIT 20;
```

Outbox:

```sql
SELECT event_type, status, retry_count, created_at, published_at
FROM outbox_events
ORDER BY created_at DESC
LIMIT 20;
```

Stuck saga:

```sql
SELECT *
FROM order_saga_states
WHERE saga_status = 'PENDING'
  AND updated_at < now() - interval '15 minutes';
```

## 8. Production Hardening Details

### 8.1 Pending Saga Timeout

Add a background worker in `order-service`:

```txt
services/order-service/internal/service/saga_timeout_worker.go
```

Behavior:

- Every 30-60 seconds, find saga states:

```sql
SELECT order_id
FROM order_saga_states
WHERE saga_status = 'PENDING'
  AND updated_at < now() - interval '15 minutes'
LIMIT 100;
```

- For each order:
  - lock order and saga state.
  - if order is still `PENDING`, mark order `FAILED`.
  - set saga status `FAILED`.
  - set failure code `CHECKOUT_SAGA_TIMEOUT`.
  - write status history, audit log, outbox `order.status-updated`.

Unit tests:

- Pending stale saga becomes failed.
- Confirmed order is skipped.
- Duplicate timeout run does not duplicate status history.

### 8.2 Structured Logs

Add these fields to every saga transition log:

```txt
requestId
eventId
eventType
orderId
paymentId
sagaStatus
inventoryStatus
paymentStatus
fromStatus
toStatus
```

Minimum places:

- `order-service` saga consumer.
- `order-service` `OrderSagaService`.
- `inventory-service` order event consumer.
- `payment-service` order event consumer.

### 8.3 Metrics

Add Prometheus metrics if service metrics pattern already exists:

```txt
checkout_saga_started_total
checkout_saga_confirmed_total
checkout_saga_failed_total
checkout_saga_duplicate_event_total
checkout_saga_duration_seconds
checkout_saga_stuck_pending_total
```

If metrics abstraction is not ready, log counters first and add metrics later.

## 9. Manual Recovery Runbook

### Case 1: Order PENDING Too Long

Check:

```sql
SELECT *
FROM order_saga_states
WHERE order_id = '<order-id>';
```

Decision:

- If inventory is `PENDING` and no reservation exists: mark order `FAILED`.
- If inventory is `RESERVED` and payment is `PENDING`: wait until timeout or mark failed manually.
- If payment is `CAPTURED` but inventory is not reserved: manual review.

### Case 2: Payment CAPTURED But Inventory FAILED

Since payment is mock-only now:

- Keep order `FAILED`.
- Log/manual note for reconciliation.
- No real refund required.

When real payment is added later:

- Trigger refund saga.
- Do not confirm order without inventory.

### Case 3: Order CONFIRMED But Inventory Not CONFIRMED

Check active reservation:

```sql
SELECT *
FROM inventory_reservations
WHERE order_id = '<order-id>';
```

If reservation is still `ACTIVE`:

- Replay `order.status-updated CONFIRMED`.
- Or call internal/admin confirm endpoint if available.

If reservation is missing or released:

- Manual investigation.
- Do not manually decrement stock without inserting inventory movement.

## 10. Final Verification Before Marking Saga Done

- [x] `cd services/order-service && go test ./...`
- [x] `cd services/inventory-service && go test ./...`
- [x] `cd services/payment-service && go test ./...`
- [x] `npm --workspace shared run build`
- [x] `./scripts/test-checkout-saga.sh`
- [x] `./scripts/test-checkout-saga-inventory-failure.sh`
- [x] `./scripts/test-checkout-saga-payment-failure.sh`
- [x] No stuck saga states older than timeout.
- [x] No saga outbox events stuck in `FAILED` for the clean E2E run window.
- [x] Duplicate event replay does not duplicate reservation/payment/order status history.
