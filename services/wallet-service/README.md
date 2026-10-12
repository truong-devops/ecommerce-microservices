# Wallet Service

Wallet and settlement ledger for seller funds.

The service currently supports:

- creating held funds from `payment.captured` events;
- recording delivery signals from `order.delivered` events;
- releasing eligible funds from held to available;
- reversing funds for refund and chargeback events;
- seller balance and ledger transaction read APIs.
- encrypted seller bank account storage with masked API responses;
- idempotent payout requests with wallet-level database locking;
- automatic mock payout processing and reconciliation;
- balanced success and failure ledger postings;
- Prometheus-compatible payout metrics at `/metrics`.

Seller endpoints:

```text
GET  /api/v1/wallets/me
GET  /api/v1/wallets/me/transactions
GET  /api/v1/wallets/me/bank-account
PUT  /api/v1/wallets/me/bank-account
POST /api/v1/payouts                 # requires Idempotency-Key
GET  /api/v1/payouts
GET  /api/v1/payouts/{payoutID}
```

Phase 2 only implements `PAYOUT_PROVIDER=mock`. `PAYOUT_ENABLED` defaults to
`false` in application configuration and must be deliberately enabled. Bank
account numbers are encrypted with `BANK_ACCOUNT_ENCRYPTION_KEY`; never reuse
the development key in another environment.

Run tests:

```bash
go test ./...
```

Run locally with PostgreSQL and automatic mock payouts:

```bash
docker compose -f docker-compose.dev.yml up --build
```

