# SePay Online Payment Runbook

## Scope

Runbook nay dung cho flow buyer chon `Thanh toan online`, quet VietQR cua SePay, payment-service nhan webhook/doi soat va cap nhat payment thanh `CAPTURED`.

## Config bat buoc truoc staging

Local/root Docker Compose doc cau hinh SePay tu:

```txt
services/payment-service/.env
```

Day la file env duy nhat cho payment-service. Service cung tu load file nay khi chay binary tu repo root hoac tu thu muc `services/payment-service`.

- `PAYMENT_GATEWAY=sepay`
- `SEPAY_ENVIRONMENT=test`
- `SEPAY_BANK_CODE`
- `SEPAY_BANK_ACCOUNT_NUMBER`
- `SEPAY_BANK_ACCOUNT_NAME`
- `SEPAY_ALLOWED_ACCOUNT_NUMBERS`
- `SEPAY_PAYMENT_CODE_PREFIX`
- `SEPAY_WEBHOOK_AUTH_MODE=hmac`
- `SEPAY_WEBHOOK_SECRET`
- `SEPAY_API_BASE_URL` dung endpoint Test Mode cua SePay neu account co endpoint rieng.
- `SEPAY_API_TOKEN` la token Test Mode neu bat doi soat.
- `SEPAY_RECONCILE_ENABLED=true` chi bat sau khi token/API URL dung.
- `BUYER_ONLINE_PAYMENT_ENABLED=true` cho buyer-web runtime config.

Khong commit secret vao repo. Dung secret manager/Kubernetes Secret/.env local.

Kubernetes production dung Secret `payment-service-sepay-secret`:

```bash
kubectl -n ecommerce-dev create secret generic payment-service-sepay-secret \
  --from-literal=bank-code='TPB' \
  --from-literal=bank-account-number='10004262634' \
  --from-literal=bank-account-name='TRAN VAN TRUONG' \
  --from-literal=allowed-account-numbers='10004262634' \
  --from-literal=webhook-secret='replace_with_webhook_hmac_secret' \
  --from-literal=api-token='replace_with_sepay_api_token'
```

Manifest Kubernetes da bat san:

```txt
PAYMENT_GATEWAY=sepay
SEPAY_RECONCILE_ENABLED=true
BUYER_ONLINE_PAYMENT_ENABLED=true
```

Neu Secret `payment-service-sepay-secret` chua ton tai hoac thieu key bat buoc, payment-service pod se khong start. Day la hanh vi mong muon de tranh production fallback sai sang mock/khong co bao mat webhook.

## Webhook

Public callback URL:

```txt
https://{public-domain}/api/v1/payments/webhooks/sepay
```

Expected success response:

```json
{"success": true}
```

Payment-service se:

- Verify HMAC/API key theo config.
- Deduplicate theo SePay event id.
- Luu raw payload vao `payment_provider_events`.
- Match `code`, `accountNumber`, `transferAmount`, `currency`.
- Cap nhat payment `PENDING -> CAPTURED` neu khop 100%.

## Doi soat

Worker doi soat goi:

```txt
GET {SEPAY_API_BASE_URL}/transactions/list?account_number=...&since_id=...&limit=...
Authorization: Bearer {SEPAY_API_TOKEN}
```

Cursor nam o `payment_reconciliation_cursors`.

Neu SePay transaction chua co trong `payment_provider_events`, worker convert transaction thanh payload noi bo va xu ly nhu webhook voi source `reconciliation`.

## Manual review

Kiem tra mismatch:

```sql
SELECT provider_event_id, provider_payment_id, payment_id, process_status,
       failure_code, failure_reason, received_at, processed_at
FROM payment_provider_events
WHERE provider = 'sepay'
  AND process_status IN ('FAILED','IGNORED','RECEIVED')
ORDER BY received_at DESC
LIMIT 50;
```

Common failure:

- `UNKNOWN_PAYMENT_CODE`: noi dung chuyen khoan khong co payment code dung prefix.
- `AMOUNT_MISMATCH`: so tien khong khop payment amount.
- `ACCOUNT_MISMATCH`: tien vao tai khoan khong nam trong allowlist.
- `EXPIRED_PAYMENT`: tien vao sau han QR.
- `ORDER_NOT_PAYABLE`: payment/order da het trang thai co the thanh toan.

Khong sua truc tiep `payments` neu chua doi soat voi sao ke/SePay dashboard. Neu can xu ly tien that da vao nhung order khong capture, tao ticket support/refund/manual adjustment rieng.

## Sandbox UAT

1. Bat Test Mode trong SePay dashboard.
2. Tao bank account/test token/test webhook rieng.
3. Expose local API Gateway bang ngrok/cloudflared:

```txt
https://{ngrok-domain}/api/v1/payments/webhooks/sepay
```

4. Dat env payment-service:

```txt
PAYMENT_GATEWAY=sepay
SEPAY_ENVIRONMENT=test
SEPAY_WEBHOOK_AUTH_MODE=hmac
SEPAY_RECONCILE_ENABLED=true
```

5. Dat `BUYER_ONLINE_PAYMENT_ENABLED=true`.
6. Tao checkout online tren buyer-web.
7. Gia lap giao dich trong Test Mode voi dung amount va transfer content.
8. Verify:

```sql
SELECT status, provider, provider_payment_id, expires_at, captured_at
FROM payments
WHERE order_id = '{order_id}';

SELECT process_status, failure_code, failure_reason
FROM payment_provider_events
WHERE provider_payment_id = '{payment_code}';
```

## Production rollout

1. Deploy backend voi `PAYMENT_GATEWAY=mock` de schema/code san sang truoc.
2. Cau hinh production secret va public webhook HTTPS.
3. Bat `PAYMENT_GATEWAY=sepay` tren staging, chay sandbox/live small transfer.
4. Bat buyer flag cho noi bo:

```txt
BUYER_ONLINE_PAYMENT_ENABLED=true
```

5. Theo doi 24-48h:
   - webhook invalid signature
   - provider events `FAILED`
   - pending payments qua han
   - reconciliation imported count > 0
   - outbox payment events lag
6. Khi on dinh, bat flag cho full buyer traffic.

Rollback:

- Tat buyer flag truoc de an lua chon online payment.
- Giu webhook endpoint va payment-service SePay config hoat dong den khi xu ly het payment pending/tien vao tre.
- Khong doi production sang mock khi da co tien that dang cho xu ly.
