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
- manual VietQR payout preparation with automatic SePay outgoing-transaction confirmation;
- optional automatic mock payout processing and reconciliation for tests;
- balanced success and failure ledger postings;
- Prometheus-compatible payout metrics at `/metrics`.
- administrator wallet overview, bank verification, wallet freezing, and audit logs.

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

Payout requests require an `ALLOWLISTED` bank account. Saving or changing an
account resets it to `UNVERIFIED` until an administrator verifies it.

Administrator endpoints (`ADMIN` or `SUPER_ADMIN`):

```text
GET   /api/v1/admin/wallets/summary
GET   /api/v1/admin/wallets
GET   /api/v1/admin/wallets/{walletID}
GET   /api/v1/admin/wallets/{walletID}/transactions
GET   /api/v1/admin/wallets/payouts
POST  /api/v1/admin/wallets/payouts/{payoutID}/prepare
PATCH /api/v1/admin/wallets/payouts/{payoutID}
GET   /api/v1/admin/wallets/audit-logs
PATCH /api/v1/admin/wallets/{walletID}/status
PATCH /api/v1/admin/wallets/{walletID}/bank-account/status
```

Public SePay callback (authenticated by API key or HMAC):

```text
POST /api/v1/wallets/webhooks/sepay/payouts
```

State-changing operations require a human-readable `reason` and are recorded
in `wallet_admin_audit_logs`. The Moderator frontend exposes these operations
at `/wallets` for administrators.

`PAYOUT_PROVIDER=manual_vietqr` keeps new requests in `REQUESTED` and moves
them to `PROCESSING` when an administrator opens the transfer dialog. The
generated QR includes a unique `EMALL...` transfer code. After the
administrator authorizes the transfer in a banking application, an
authenticated SePay webhook with `transferType=out` automatically marks the
payout `SUCCEEDED` only when source account, transfer code, amount, currency,
and state all match. Duplicate webhook deliveries are idempotent. Manual
confirmation remains available as a fallback; rejecting a request returns the
pending amount to the seller's available balance.

To enable automatic confirmation, create a SePay webhook filtered to outgoing
transactions with URL
`https://api.example.com/api/v1/wallets/webhooks/sepay/payouts`, configure its
HMAC-SHA256 secret, and set:

```text
SEPAY_PAYOUT_WEBHOOK_ENABLED=true
SEPAY_PAYOUT_SOURCE_ACCOUNT_NUMBER=<platform bank account>
SEPAY_PAYOUT_WEBHOOK_AUTH_MODE=hmac
SEPAY_PAYOUT_WEBHOOK_SECRET=<same random secret configured in SePay>
```

In SePay, configure payment-code prefix `EMALL` with a 12-character
alphanumeric suffix and select the outgoing-only event. Outgoing webhooks are
subject to SePay's supported-bank/account-mode requirements.

`PAYOUT_PROVIDER=mock` remains available for automated local tests. Bank
account numbers are encrypted with `BANK_ACCOUNT_ENCRYPTION_KEY`; never reuse
the development key in another environment.

Run tests:

```bash
go test ./...
```

Run locally with PostgreSQL and manual VietQR payouts:

```bash
docker compose -f docker-compose.dev.yml up --build
```

To run the old automatic mock flow instead:

```bash
WALLET_PAYOUT_PROVIDER=mock docker compose -f docker-compose.dev.yml up --build
```

