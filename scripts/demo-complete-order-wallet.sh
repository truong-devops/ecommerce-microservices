#!/usr/bin/env bash
set -Eeuo pipefail

# Demo-only helper: mark one online order as paid and delivered, then wait for
# wallet-service to release the seller's held funds. This intentionally writes
# directly to service databases and must never be used in production.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-120}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-2}"

print_step() {
  echo
  echo "==> $1"
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/demo-complete-order-wallet.sh <ORDER_ID>
  ./scripts/demo-complete-order-wallet.sh

Environment variables:
  WAIT_TIMEOUT_SECONDS   Maximum time to wait for wallet release (default: 120)
  POLL_INTERVAL_SECONDS  Polling interval in seconds (default: 2)

This script is for local/demo environments only. It directly updates the
payment and order databases and creates outbox events for wallet-service.
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

psql_value() {
  local database_user="$1"
  local database_name="$2"
  local sql="$3"

  docker compose exec -T postgres \
    psql -X -v ON_ERROR_STOP=1 -qAt -F $'\t' \
    -U "$database_user" -d "$database_name" -c "$sql"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 1
fi

ORDER_ID="${1:-}"
if [[ -z "$ORDER_ID" ]]; then
  read -r -p "Paste order ID: " ORDER_ID
fi
ORDER_ID="${ORDER_ID//[[:space:]]/}"

UUID_PATTERN='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
[[ "$ORDER_ID" =~ $UUID_PATTERN ]] || fail "ORDER_ID is not a valid UUID: $ORDER_ID"
[[ "$WAIT_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || fail "WAIT_TIMEOUT_SECONDS must be a positive integer"
[[ "$POLL_INTERVAL_SECONDS" =~ ^[1-9][0-9]*$ ]] || fail "POLL_INTERVAL_SECONDS must be a positive integer"

require_command docker
cd "$REPO_ROOT"

POSTGRES_CONTAINER="$(docker compose ps -q postgres)"
[[ -n "$POSTGRES_CONTAINER" ]] || fail "The postgres Compose service is not running"

print_step "Load order"
ORDER_INFO="$(psql_value eorder ecommerce_order "
SELECT
  id::text,
  order_number,
  status::text,
  payment_method,
  seller_id::text,
  total_amount::text,
  currency::text
FROM orders
WHERE id = '$ORDER_ID'::uuid;
")"
[[ -n "$ORDER_INFO" ]] || fail "Order not found: $ORDER_ID"

IFS=$'\t' read -r \
  FOUND_ORDER_ID ORDER_NUMBER ORDER_STATUS PAYMENT_METHOD SELLER_ID ORDER_AMOUNT ORDER_CURRENCY \
  <<< "$ORDER_INFO"

[[ -n "$SELLER_ID" ]] || fail "Order does not have a seller_id"
NORMALIZED_PAYMENT_METHOD="$(printf '%s' "$PAYMENT_METHOD" | tr '[:lower:]' '[:upper:]')"
[[ "$NORMALIZED_PAYMENT_METHOD" == "ONLINE" ]] || fail "Order payment_method is $PAYMENT_METHOD; choose an ONLINE order"

printf 'Order:   %s (%s)\n' "$ORDER_NUMBER" "$FOUND_ORDER_ID"
printf 'Status:  %s\n' "$ORDER_STATUS"
printf 'Seller:  %s\n' "$SELLER_ID"
printf 'Amount:  %s %s\n' "$ORDER_AMOUNT" "$ORDER_CURRENCY"

print_step "Validate payment"
PAYMENT_INFO="$(psql_value epayment ecommerce_payment "
SELECT
  id::text,
  status::text,
  seller_id::text,
  amount::text,
  currency::text
FROM payments
WHERE order_id = '$ORDER_ID'::uuid;
")"
[[ -n "$PAYMENT_INFO" ]] || fail "No payment exists for order $ORDER_ID"

IFS=$'\t' read -r PAYMENT_ID PAYMENT_STATUS PAYMENT_SELLER_ID PAYMENT_AMOUNT PAYMENT_CURRENCY \
  <<< "$PAYMENT_INFO"

[[ -n "$PAYMENT_SELLER_ID" ]] || fail "Payment does not have a seller_id"
[[ "$PAYMENT_SELLER_ID" == "$SELLER_ID" ]] || fail "Order/payment seller mismatch"
[[ "$PAYMENT_CURRENCY" == "$ORDER_CURRENCY" ]] || fail "Order/payment currency mismatch"

AMOUNT_MATCH="$(psql_value epayment ecommerce_payment "
SELECT (amount = '$ORDER_AMOUNT'::numeric)::text
FROM payments
WHERE id = '$PAYMENT_ID'::uuid;
")"
[[ "$AMOUNT_MATCH" == "true" ]] || fail "Order/payment amount mismatch: order=$ORDER_AMOUNT payment=$PAYMENT_AMOUNT"

case "$PAYMENT_STATUS" in
  PENDING|REQUIRES_ACTION|AUTHORIZED|FAILED|CAPTURED)
    ;;
  *)
    fail "Payment status $PAYMENT_STATUS is unsafe to convert to CAPTURED"
    ;;
esac

printf 'Payment: %s\n' "$PAYMENT_ID"
printf 'Status:  %s -> CAPTURED\n' "$PAYMENT_STATUS"

EXISTING_HOLD="$(psql_value ewallet ecommerce_wallet "
SELECT
  payment_id::text,
  order_id::text,
  seller_id::text,
  captured_amount_minor::text,
  currency,
  status
FROM fund_holds
WHERE payment_id = '$PAYMENT_ID'::uuid;
")"

if [[ -n "$EXISTING_HOLD" ]]; then
  IFS=$'\t' read -r \
    HOLD_PAYMENT_ID HOLD_ORDER_ID HOLD_SELLER_ID HOLD_AMOUNT HOLD_CURRENCY HOLD_STATUS \
    <<< "$EXISTING_HOLD"
  [[ "$HOLD_ORDER_ID" == "$ORDER_ID" ]] || fail "Existing wallet hold belongs to another order"
  [[ "$HOLD_SELLER_ID" == "$SELLER_ID" ]] || fail "Existing wallet hold belongs to another seller"
  [[ "$HOLD_CURRENCY" == "$ORDER_CURRENCY" ]] || fail "Existing wallet hold has another currency"
  HOLD_AMOUNT_MATCH="$(psql_value ewallet ecommerce_wallet "
SELECT (captured_amount_minor = ROUND('$PAYMENT_AMOUNT'::numeric)::bigint)::text
FROM fund_holds
WHERE payment_id = '$PAYMENT_ID'::uuid;
")"
  [[ "$HOLD_AMOUNT_MATCH" == "true" ]] || fail "Existing wallet hold amount does not match payment amount"
  echo "Existing wallet hold found ($HOLD_STATUS); payment capture will not be emitted again."
else
  print_step "Mark payment as captured and enqueue payment.captured"
  docker compose exec -T postgres \
    psql -X -v ON_ERROR_STOP=1 -U epayment -d ecommerce_payment <<SQL
BEGIN;

INSERT INTO payment_status_histories (
  payment_id, from_status, to_status, changed_by, changed_by_role, reason
)
SELECT
  id,
  status,
  'CAPTURED',
  '00000000-0000-0000-0000-000000000000',
  'SUPPORT',
  'Demo: payment captured directly from database'
FROM payments
WHERE order_id = '$ORDER_ID'::uuid
  AND status <> 'CAPTURED';

UPDATE payments
SET status = 'CAPTURED',
    captured_at = COALESCE(captured_at, NOW()),
    updated_at = NOW()
WHERE order_id = '$ORDER_ID'::uuid;

INSERT INTO payment_transactions (
  payment_id, transaction_type, gateway_transaction_id, amount,
  currency, status, request_id, raw_payload
)
SELECT
  p.id,
  'CAPTURED',
  'demo-db-' || p.id::text,
  p.amount,
  p.currency,
  'CAPTURED',
  'demo-db-$ORDER_ID',
  jsonb_build_object('source', 'manual-demo', 'orderId', p.order_id)
FROM payments p
WHERE p.order_id = '$ORDER_ID'::uuid
  AND NOT EXISTS (
    SELECT 1
    FROM payment_transactions pt
    WHERE pt.gateway_transaction_id = 'demo-db-' || p.id::text
  );

INSERT INTO payment_audit_logs (
  payment_id, action, actor_id, actor_role, request_id, metadata
)
SELECT
  p.id,
  'DEMO_PAYMENT_CAPTURED',
  '00000000-0000-0000-0000-000000000000',
  'SUPPORT',
  'demo-db-$ORDER_ID',
  jsonb_build_object('source', 'manual-demo')
FROM payments p
WHERE p.order_id = '$ORDER_ID'::uuid
  AND NOT EXISTS (
    SELECT 1
    FROM payment_audit_logs a
    WHERE a.payment_id = p.id
      AND a.action = 'DEMO_PAYMENT_CAPTURED'
  );

INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
SELECT
  'payment',
  p.id,
  'payment.captured',
  jsonb_build_object(
    'paymentId', p.id,
    'orderId', p.order_id,
    'userId', p.user_id,
    'sellerId', p.seller_id,
    'provider', p.provider,
    'providerPaymentId', p.provider_payment_id,
    'status', p.status,
    'amount', p.amount,
    'refundedAmount', p.refunded_amount,
    'currency', p.currency,
    'metadata', jsonb_build_object(
      'requestId', 'demo-db-$ORDER_ID',
      'occurredAt', NOW(),
      'actorId', '00000000-0000-0000-0000-000000000000',
      'actorRole', 'SUPPORT'
    )
  )
FROM payments p
WHERE p.order_id = '$ORDER_ID'::uuid
  AND NOT EXISTS (
    SELECT 1
    FROM outbox_events oe
    WHERE oe.aggregate_id = p.id
      AND oe.event_type = 'payment.captured'
      AND oe.status = 'PENDING'
  );

COMMIT;
SQL
fi

print_step "Mark order as delivered and enqueue order.delivered"
docker compose exec -T postgres \
  psql -X -v ON_ERROR_STOP=1 -U eorder -d ecommerce_order <<SQL
BEGIN;

INSERT INTO order_status_histories (
  order_id, from_status, to_status, changed_by, changed_by_role, reason
)
SELECT
  id,
  status,
  'DELIVERED',
  '00000000-0000-0000-0000-000000000000',
  'SUPER_ADMIN',
  'Demo: order delivered directly from database'
FROM orders
WHERE id = '$ORDER_ID'::uuid
  AND status <> 'DELIVERED';

UPDATE orders
SET status = 'DELIVERED',
    updated_at = NOW()
WHERE id = '$ORDER_ID'::uuid;

INSERT INTO order_saga_states (
  order_id, saga_status, inventory_status, payment_status,
  inventory_event_id, payment_event_id
)
VALUES (
  '$ORDER_ID'::uuid,
  'COMPLETED',
  'RESERVED',
  'CAPTURED',
  'demo-inventory-$ORDER_ID',
  'demo-payment-$ORDER_ID'
)
ON CONFLICT (order_id) DO UPDATE SET
  saga_status = 'COMPLETED',
  inventory_status = 'RESERVED',
  payment_status = 'CAPTURED',
  failure_code = NULL,
  failure_reason = NULL,
  updated_at = NOW();

INSERT INTO order_audit_logs (
  order_id, action, actor_id, actor_role, request_id, metadata
)
SELECT
  o.id,
  'DEMO_ORDER_DELIVERED',
  '00000000-0000-0000-0000-000000000000',
  'SUPER_ADMIN',
  'demo-db-$ORDER_ID',
  jsonb_build_object('toStatus', 'DELIVERED', 'source', 'manual-demo')
FROM orders o
WHERE o.id = '$ORDER_ID'::uuid
  AND NOT EXISTS (
    SELECT 1
    FROM order_audit_logs a
    WHERE a.order_id = o.id
      AND a.action = 'DEMO_ORDER_DELIVERED'
  );

INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
SELECT
  'order',
  o.id,
  'order.delivered',
  jsonb_build_object(
    'orderId', o.id,
    'orderNumber', o.order_number,
    'userId', o.user_id,
    'sellerId', o.seller_id,
    'status', o.status,
    'paymentMethod', o.payment_method,
    'totalAmount', o.total_amount,
    'currency', o.currency,
    'metadata', jsonb_build_object(
      'requestId', 'demo-db-$ORDER_ID',
      'occurredAt', NOW(),
      'actorId', '00000000-0000-0000-0000-000000000000',
      'actorRole', 'SUPER_ADMIN'
    )
  )
FROM orders o
WHERE o.id = '$ORDER_ID'::uuid
  AND NOT EXISTS (
    SELECT 1
    FROM outbox_events oe
    WHERE oe.aggregate_id = o.id
      AND oe.event_type = 'order.delivered'
      AND oe.status = 'PENDING'
  );

COMMIT;
SQL

print_step "Wait for wallet release"
DEADLINE=$((SECONDS + WAIT_TIMEOUT_SECONDS))
LAST_HOLD_STATE=""

while (( SECONDS < DEADLINE )); do
  LAST_HOLD_STATE="$(psql_value ewallet ecommerce_wallet "
SELECT
  status,
  captured_amount_minor::text,
  released_amount_minor::text,
  COALESCE(release_at::text, '')
FROM fund_holds
WHERE payment_id = '$PAYMENT_ID'::uuid;
")"

  if [[ -n "$LAST_HOLD_STATE" ]]; then
    IFS=$'\t' read -r CURRENT_HOLD_STATUS CAPTURED_MINOR RELEASED_MINOR RELEASE_AT \
      <<< "$LAST_HOLD_STATE"
    printf '\rHold: %-20s captured=%s released=%s' \
      "$CURRENT_HOLD_STATUS" "$CAPTURED_MINOR" "$RELEASED_MINOR"
    if [[ "$CURRENT_HOLD_STATUS" == "RELEASED" ]]; then
      echo
      break
    fi
  else
    printf '\rWaiting for payment.captured event...'
  fi

  sleep "$POLL_INTERVAL_SECONDS"
done

if [[ -z "$LAST_HOLD_STATE" || "${CURRENT_HOLD_STATUS:-}" != "RELEASED" ]]; then
  echo
  echo "Wallet release did not finish within ${WAIT_TIMEOUT_SECONDS}s." >&2
  echo "Inspect logs with:" >&2
  echo "  docker compose logs --since=5m --no-color payment-service order-service wallet-service" >&2
  exit 1
fi

print_step "Wallet result"
docker compose exec -T postgres \
  psql -X -v ON_ERROR_STOP=1 -U ewallet -d ecommerce_wallet -c "
SELECT
  payment_id,
  order_id,
  seller_id,
  captured_amount_minor,
  released_amount_minor,
  status,
  delivered_at,
  release_at
FROM fund_holds
WHERE payment_id = '$PAYMENT_ID'::uuid;
"

docker compose exec -T postgres \
  psql -X -v ON_ERROR_STOP=1 -U ewallet -d ecommerce_wallet -c "
SELECT
  a.account_type,
  COALESCE(SUM(e.amount_minor), 0) AS balance_vnd
FROM wallets w
JOIN ledger_accounts a ON a.wallet_id = w.id
LEFT JOIN ledger_entries e ON e.account_id = a.id
WHERE w.seller_id = '$SELLER_ID'::uuid
GROUP BY a.account_type
ORDER BY a.account_type;
"

echo
echo "Done. Order $ORDER_NUMBER is DELIVERED and its funds are available to seller $SELLER_ID."
