# Wallet Service Demo Runbook

Last updated: 2026-10-12

## Scope

This runbook demonstrates the safe mock flow implemented for the project:

```text
payment.captured -> HELD -> order.delivered -> AVAILABLE
-> payout REQUESTED/PROCESSING -> SUCCEEDED or FAILED
```

No real bank transfer is performed. Phase 3 keeps the application-level kill switch
`PAYOUT_ENABLED=false` by default. Root Docker Compose explicitly enables only the
mock provider for local demonstration.

## Prerequisites

- Docker and Docker Compose.
- A seller account and a valid seller access token.
- `jq` when using the command-line demo script.
- A fresh PostgreSQL volume, or an existing `ecommerce_wallet` database owned by
  `ewallet`. PostgreSQL init scripts run only when the volume is first created.

## Start the stack

```bash
docker compose up -d postgres kafka auth-service user-service order-service payment-service wallet-service api-gateway
docker compose ps
curl http://localhost:12024/api/v1/ready
```

For frontend development:

```bash
npm --workspace @frontend/seller run dev
```

The seller BFF uses `API_GATEWAY_BASE_URL` by default. Set
`WALLET_SERVICE_BASE_URL` only when intentionally bypassing the gateway during
local debugging.

## UI demo

1. Sign in as a seller and open `/finance/bank-account`.
2. Add a test bank account. Confirm the page displays only a masked number.
3. Complete a payment and delivery flow, then wait for the configured hold time.
4. Open `/finance/balance` and show the transitions from held to available.
5. Select **Yêu cầu rút tiền**, enter at least `10.000 ₫`, and confirm.
6. Show the recent payout changing automatically from received/processing to
   success. Confirm payout pending returns to zero.
7. Open `/finance/revenue` to show ledger-backed totals, payout history, and CSV
   export.

## Command-line payout demo

After the seller has available funds:

```bash
export SELLER_ACCESS_TOKEN='<seller-jwt>'
export DEMO_PAYOUT_AMOUNT=10000
./services/wallet-service/scripts/demo-payout.sh
```

The script never prints the bearer token or full bank account number. It creates a
unique idempotency key, polls the payout, and prints only masked/summarized results.

## Failure-path demo

Set the mock mode before recreating wallet-service:

```bash
MOCK_PAYOUT_MODE=failure docker compose up -d --force-recreate wallet-service
```

Create another payout. Expected result:

- payout becomes `FAILED`;
- `PAYOUT_PENDING` returns to zero;
- the amount is restored to `AVAILABLE`;
- ledger transactions remain balanced.

Restore the success mode afterward:

```bash
MOCK_PAYOUT_MODE=success docker compose up -d --force-recreate wallet-service
```

## Safety checks

- Stop new payout requests immediately with `PAYOUT_ENABLED=false`.
- Never put a production encryption key or provider credential in source control.
- Logs and UI must never contain a full bank account number.
- Real-money payout remains intentionally unavailable until a provider is selected,
  its sandbox contract is implemented, and allowlist/daily-limit controls are tested.

## Automated verification

```bash
cd services/wallet-service
WALLET_TEST_DATABASE_URL='postgresql://ewallet:ewallet@localhost:55435/ecommerce_wallet?sslmode=disable' go test ./internal/repository -count=1
WALLET_TEST_DATABASE_URL='postgresql://ewallet:ewallet@localhost:55435/ecommerce_wallet?sslmode=disable' go test ./internal/service -run TestPaymentToPayoutEndToEndIntegration -count=1
go test -race ./...
go vet ./...

cd ../api-gateway
go test ./...

cd ../../
npm --workspace @frontend/seller run build
docker compose config
```
