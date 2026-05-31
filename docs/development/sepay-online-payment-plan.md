# Ke hoach phat trien thanh toan online bang SePay QR

Ngay lap plan: 2026-05-31

## 1. Muc tieu

Xay dung luong "Thanh toan online" cho buyer web:

1. Khach hang chon `Thanh toan online` tai trang checkout.
2. He thong tao don hang nhu hien tai, tao payment intent voi provider `sepay`.
3. Buyer thay ma QR VietQR kem so tien, noi dung chuyen khoan va dem nguoc.
4. Khach quet QR bang app ngan hang va chuyen khoan.
5. SePay gui webhook giao dich tien vao.
6. `payment-service` xac thuc webhook, doi soat payment code, so tien, tai khoan nhan, roi cap nhat payment thanh `CAPTURED`.
7. `payment-service` phat Kafka event `payment.captured`.
8. `order-service` nhan event, cap nhat checkout saga payment status thanh `CAPTURED`; khi inventory da reserved thi saga completed va seller co the xac nhan don theo rule hien tai.
9. Frontend poll payment status, thay `CAPTURED` thi hien thi "Da thanh toan" va dieu huong ve chi tiet don hang.

## 2. Nguon SePay da doi chieu

- SePay QR + webhook flow: https://developer.sepay.vn/vi/sepay-webhooks/tao-qr-va-form-thanh-toan
- Tao QR VietQR dong: https://developer.sepay.vn/vi/tien-ich-khac/tao-qr-code
- Webhook payload, response va idempotency: https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook
- Xac thuc webhook HMAC-SHA256/API key: https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc
- Bao mat webhook: https://developer.sepay.vn/vi/sepay-webhooks/bao-mat
- Doi soat giao dich: https://developer.sepay.vn/vi/sepay-webhooks/doi-soat-giao-dich

Nhung diem can bam theo tai lieu:

- QR image co dang `https://qr.sepay.vn/img?acc={SO_TK}&bank={NGAN_HANG}&amount={TIEN}&des={NOI_DUNG}`.
- `amount` la so tien VND, nen voi SePay QR can gioi han payment currency la `VND` va amount la so nguyen VND.
- Webhook giao dich SePay co cac truong chinh: `id`, `gateway`, `transactionDate`, `accountNumber`, `subAccount`, `code`, `content`, `transferType`, `description`, `transferAmount`, `accumulated`, `referenceCode`.
- `id` cua webhook SePay co the dung lam dedup key vi giu nguyen qua retry/replay.
- Endpoint webhook phai tra HTTP 200 va body `{"success": true}` nhanh, xu ly nang nen day vao queue hoac worker.
- Production nen dung HTTPS, HMAC-SHA256, timestamp replay protection, whitelist IP, validate amount/account/code va doi soat dinh ky.
- SePay retry webhook toi da 7 lan trong khoang 33 phut neu endpoint loi.
- Doi soat nen goi `GET https://userapi.sepay.vn/v2/transactions` voi `Authorization: Bearer ...`, phan trang toi da 100 item va ton trong rate limit 3 request/giay.

## 3. Pham vi MVP de phu hop code hien tai

### Trong scope

- Tich hop SePay QR bank transfer cho buyer web.
- Mot payment ung voi mot order, vi `payments.order_id` dang unique va checkout hien tao moi cart line thanh mot order.
- Mot tai khoan ngan hang nhan tien cua platform cho MVP.
- Tu dong capture payment khi webhook SePay hop le va khop 100%.
- Polling payment status tren frontend moi 3 giay trong luc cho thanh toan.
- Het han sau 15 phut, dong bo voi `CHECKOUT_SAGA_TIMEOUT_AFTER_MS=900000` cua `order-service`.
- Luu raw webhook payload va idempotency de debug, audit, replay.
- Cron/worker doi soat SePay de bo sung giao dich mat webhook.

### Ngoai scope MVP

- Mot QR duy nhat cho nhieu order/seller trong cung cart. Muon lam viec nay can them `checkout_session` hoac `payment_group` de map 1 payment voi nhieu order.
- Per-seller bank account va split settlement tu dong. MVP nhan tien vao tai khoan platform, settlement seller se xu ly o luong tai chinh rieng.
- Hoan tien tu dong qua SePay API. MVP co the flag manual refund cho late/mismatch payment.
- Thanh toan the, NAPAS gateway, hosted payment page cua SePay Payment Gateway.

## 4. Trang thai hien tai cua repo

### Frontend buyer

- Checkout page: `frontend/apps/buyer-web/src/app/checkout/page.tsx`
  - Da co radio `Thanh toán khi nhận hàng (COD)` va `Thanh toán online`.
  - Khi online, code hien tai tao order xong goi `createBuyerPaymentIntent`, sau do clear cart va day buyer sang `/orders`.
  - Checkout hien lap qua tung cart item va tao moi item thanh mot order rieng.

- API client:
  - `frontend/apps/buyer-web/src/lib/api/payments.ts`
  - `POST /api/buyer/payments/intents`
  - `GET /api/buyer/payments/order/{orderId}`

- Type:
  - `frontend/apps/buyer-web/src/lib/api/types.ts`
  - `Payment` hien co `status`, `provider`, `requiresActionUrl`, `metadata`.

### payment-service

- Router: `services/payment-service/internal/router/router.go`
  - Da co public route `POST /api/v1/payments/webhooks/{provider}`.
  - Da co JWT route `POST /api/v1/payments/intents`.

- Service: `services/payment-service/internal/service/payment_service.go`
  - Da co payment lifecycle, status, idempotency, webhook idempotency, outbox event.
  - Dang dung `PaymentGateway` interface va `MockPaymentGateway`.
  - `CreatePaymentIntent` dang validate order ownership, amount, currency voi `order-service`.
  - `HandleProviderWebhook` hien nhan payload internal generic, chua doc raw body cho HMAC va chua parse payload SePay native.

- DB: `services/payment-service/migrations/0001_init_payment_service.sql`
  - Da co `payments`, `payment_transactions`, `payment_status_histories`, `payment_audit_logs`, `webhook_idempotency_records`, `outbox_events`.
  - `payments.order_id` unique, nen mot order chi co mot payment.
  - `payments.provider_payment_id` unique, co the dung lam SePay payment code.

- Config: `services/payment-service/internal/config/config.go`
  - `PAYMENT_GATEWAY` chi cho `mock` hoac `vnpay`, can them `sepay`.

### order-service

- `order-service` da co checkout saga:
  - `order.created` -> inventory reserve va payment auto-created.
  - `payment.captured` -> saga payment captured.
  - `checkoutPrerequisitesSatisfied`: COD chi can inventory reserved; ONLINE can inventory reserved va payment captured.
  - Seller confirm order chi duoc khi saga completed.

- Timeout:
  - `CHECKOUT_SAGA_TIMEOUT_AFTER_MS=900000` trong `docker-compose.yml`, tuong duong 15 phut.

### api-gateway

- `services/api-gateway/internal/router/router.go`
  - Payment routes hien dang nam trong private JWT group.
  - Public webhook hien chi co shipping Nexus: `/api/v1/shipments/webhooks/nexus`.
  - Can mount public route cho SePay webhook neu public domain di qua API Gateway.

## 5. Kien truc de xuat

### Chon huong tich hop

Chon "Self-built SePay QR + bank webhook", khong chon hosted Payment Gateway trong MVP.

Ly do:

- Buyer co the quet QR/chuyen khoan ngay trong checkout.
- Code hien co da co payment lifecycle va payment webhook endpoint.
- SePay QR endpoint va webhook bank balance phu hop voi custom checkout.
- Khong can redirect sang hosted payment page.

### Sequence chinh

```txt
Buyer checkout
  -> buyer-web POST /api/buyer/orders
  -> api-gateway/order-service POST /api/v1/orders
  -> order-service stores PENDING order, emits order.created
  -> payment-service consumes order.created, auto-creates PENDING payment

Buyer checkout
  -> buyer-web POST /api/buyer/payments/intents
  -> payment-service validates order, attaches SePay payment code, returns QR instructions
  -> buyer-web redirects to QR waiting page

Buyer bank app
  -> transfer to platform bank account with SePay payment code in memo
  -> SePay POST /api/v1/payments/webhooks/sepay
  -> api-gateway public proxy
  -> payment-service verifies HMAC/IP/timestamp, dedups, validates code/account/amount
  -> payment-service updates payment CAPTURED and emits payment.captured
  -> order-service consumes payment.captured and updates saga
  -> buyer-web polling sees CAPTURED and shows success
```

### Multi-order checkout trong MVP

Vi checkout hien tai tao 1 order moi cart line:

- Neu cart co 1 item: redirect den `/checkout/payment/{orderId}`.
- Neu cart co nhieu item: redirect den `/checkout/payment?orderIds=...`, hien danh sach payment cards, moi card co QR rieng.
- Khong gom tong tien vao mot QR cho nhieu order trong MVP, vi lam vay can model `payment_group` va thay doi contract order/payment.

## 6. Thiet ke payment code va QR

### Payment code

Dung `payments.provider_payment_id` lam SePay payment code.

De xuat format:

```txt
EMX{12 uppercase alnum chars}
```

Nguon sinh code:

- Uu tien sinh tu payment UUID sau khi payment ton tai, vi unique va khong phu thuoc order display code.
- Vi payment auto-created tu `order.created`, khi attach SePay intent co the set `provider_payment_id = paymentCode`.
- Luu them `metadata.sepay.paymentCode = paymentCode`.

Luu y:

- Khong nen chi dung `orderCode` display `EMX1234567` vi co nguy co collision do format rut gon.
- Prefix `EMX` phai trung voi cau hinh "Cau truc ma thanh toan" tren dashboard SePay de SePay boc tach field `code`.

### Noi dung chuyen khoan

Default:

```txt
{paymentCode} thanh toan don {orderCode}
```

Can ho tro config de phu hop rule ngan hang:

- VietinBank ca nhan/ho kinh doanh can `SEVQR` trong `des`.
- VA theo noi dung chuyen khoan can `TKP{maVA}` trong `des`.
- Mot so ngan hang bat buoc VA.

De xuat config:

```env
PAYMENT_GATEWAY=sepay
SEPAY_BANK_CODE=Vietcombank
SEPAY_BANK_ACCOUNT_NUMBER=0010000000355
SEPAY_BANK_ACCOUNT_NAME=EMALL COMPANY
SEPAY_PAYMENT_CODE_PREFIX=EMX
SEPAY_TRANSFER_DESCRIPTION_TEMPLATE="{paymentCode} thanh toan don {orderCode}"
SEPAY_QR_TEMPLATE=compact
SEPAY_PAYMENT_EXPIRES_MINUTES=15

# Neu ngan hang yeu cau
SEPAY_DESCRIPTION_REQUIRED_PREFIX=
SEPAY_VA_MODE=none
SEPAY_VA_CODE=
```

Vi du QR URL server tra ve:

```txt
https://qr.sepay.vn/img?acc=0010000000355&bank=Vietcombank&amount=235000&des=EMXABC123DEF456%20thanh%20toan%20don%20EMX1234567&template=compact
```

### Payment instructions response

Mo rong response cua `Payment`:

```json
{
  "id": "payment-uuid",
  "orderId": "order-uuid",
  "provider": "sepay",
  "providerPaymentId": "EMXABC123DEF456",
  "status": "PENDING",
  "currency": "VND",
  "amount": 235000,
  "paymentInstructions": {
    "type": "VIETQR",
    "paymentCode": "EMXABC123DEF456",
    "qrImageUrl": "https://qr.sepay.vn/img?...",
    "bankCode": "Vietcombank",
    "accountNumber": "0010000000355",
    "accountName": "EMALL COMPANY",
    "amount": 235000,
    "currency": "VND",
    "transferDescription": "EMXABC123DEF456 thanh toan don EMX1234567",
    "expiresAt": "2026-05-31T10:15:00Z"
  }
}
```

Co the van luu data trong `payments.metadata`, nhung response nen co field typed `paymentInstructions` de frontend khong phai parse metadata tuy tien.

## 7. Thay doi backend chi tiet

### 7.1. Config payment-service

File: `services/payment-service/internal/config/config.go`

Them config:

```go
type SePayConfig struct {
    BankCode string
    BankAccountNumber string
    BankAccountName string
    PaymentCodePrefix string
    TransferDescriptionTemplate string
    QRTemplate string
    PaymentExpiresMinutes int
    WebhookSecret string
    WebhookAPIKey string
    WebhookAuthMode string
    TimestampToleranceSeconds int
    AllowedAccountNumbers []string
    APIBaseURL string
    APIToken string
    ReconcileEnabled bool
    ReconcileInterval time.Duration
}
```

Validation:

- `PAYMENT_GATEWAY` cho phep `mock`, `vnpay`, `sepay`.
- Khi `PAYMENT_GATEWAY=sepay`, bat buoc:
  - `SEPAY_BANK_CODE`
  - `SEPAY_BANK_ACCOUNT_NUMBER`
  - `SEPAY_PAYMENT_CODE_PREFIX`
  - `SEPAY_WEBHOOK_SECRET` trong production neu auth mode la `hmac`.
- `SEPAY_PAYMENT_EXPIRES_MINUTES >= 1`, default 15.
- `SEPAY_TIMESTAMP_TOLERANCE_SECONDS`, default 300.

Cap nhat:

- `docker-compose.yml`
- `services/payment-service/docker-compose.dev.yml`
- `infrastructure/kubernetes/base/app-payment-service.yaml`
- secret templates neu repo co.

### 7.2. SePay gateway adapter

Them file:

- `services/payment-service/internal/service/sepay_gateway.go`

Trach nhiem:

- `CreatePaymentIntent`
  - Chi chap nhan `Currency == "VND"`.
  - Chi chap nhan amount la so nguyen VND.
  - Tao hoac nhan `paymentCode`.
  - Tao `transferDescription`.
  - Tao `qrImageUrl` bang `qr.sepay.vn/img`.
  - Tra ve:
    - `ProviderPaymentID = paymentCode`
    - `Status = PENDING`
    - `RawPayload` chua QR URL, bank info, expiresAt.

- `ParseWebhook`
  - Chuyen payload SePay native thanh payment status:
    - `transferType == "in"` va matched -> `CAPTURED`.
    - `transferType == "out"` -> ignore/store, khong capture.
  - Map:
    - `ProviderEventID = strconv.FormatInt(payload.ID, 10)` hoac fallback `referenceCode`.
    - `ProviderPaymentID = payload.Code`.
    - `GatewayTransactionID = payload.ReferenceCode`.
    - `Amount = payload.TransferAmount`.
    - `Currency = "VND"`.
  - Validate signature o tang handler/service bang raw body truoc khi parse business payload.

Can cap nhat interface `PaymentGateway` hoac them struct output:

```go
type PaymentInstructions struct {
    Type string
    PaymentCode string
    QRImageURL string
    BankCode string
    AccountNumber string
    AccountName string
    Amount float64
    Currency string
    TransferDescription string
    ExpiresAt time.Time
}
```

`CreatePaymentIntentGatewayOutput` nen co `Instructions *PaymentInstructions`.

### 7.3. Webhook handler doc raw body

File: `services/payment-service/internal/handler/payment_handler.go`

Hien tai `HandleProviderWebhook` dung `httpx.DecodeJSONStrict`, khong phu hop HMAC vi SePay ky raw body.

Can sua:

- Doc raw body voi size limit, vi du max 1MB.
- Neu provider la `sepay`:
  - Lay headers:
    - `X-SePay-Signature`
    - `X-SePay-Timestamp`
    - `Authorization` neu auth mode API Key.
  - Goi service method moi:
    - `HandleSePayWebhook(ctx, requestID, rawBody, headers, remoteIP)`.
  - Response thanh cong nen la body `{"success": true}` de dung contract SePay.
- Neu provider khac/mock:
  - Co the giu generic flow hien tai de khong pha test cu.

Can dung constant-time compare cho HMAC/API key.

### 7.4. Provider webhook event table

Them migration moi, khong sua destructive migration cu neu repo da co DB:

```sql
CREATE TABLE IF NOT EXISTS payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(64) NOT NULL,
  provider_event_id varchar(128) NOT NULL,
  gateway_transaction_id varchar(128),
  provider_payment_id varchar(128),
  payment_id uuid,
  event_type varchar(128) NOT NULL,
  process_status varchar(32) NOT NULL DEFAULT 'RECEIVED',
  failure_code varchar(128),
  failure_reason varchar(500),
  raw_payload jsonb NOT NULL,
  raw_body text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_provider_events_payment_id ON payment_provider_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_provider_events_status ON payment_provider_events(process_status);
CREATE INDEX IF NOT EXISTS idx_payment_provider_events_provider_payment_id ON payment_provider_events(provider, provider_payment_id);
```

Ly do:

- Luu duoc ca event unmatched/mismatch/late payment.
- Tach audit raw webhook khoi `payment_transactions`, vi `payment_transactions` can `payment_id`.
- Ho tro replay va doi soat.

Co the tiep tuc dung `webhook_idempotency_records` de replay HTTP response, nhung `payment_provider_events` la audit source of truth.

### 7.5. Payment expiry

Them column de query de dang:

```sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS captured_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_payments_expires_at ON payments(expires_at);
```

Trong `CreatePaymentIntent` voi provider `sepay`:

- Set `expires_at = now() + SEPAY_PAYMENT_EXPIRES_MINUTES`.
- Status giu `PENDING`.
- Metadata luu `sepay.paymentCode`, `sepay.qrImageUrl`, `sepay.transferDescription`, `sepay.expiresAt`.

Them worker:

- Scan payments provider `sepay`, status `PENDING`, `expires_at < now()`.
- Chuyen thanh `FAILED` voi reason `SePay QR payment expired`.
- Ghi status history, audit log, payment transaction type `FAILED`.
- Emit `payment.failed` de `order-service` fail saga som hon hoac dong bo voi timeout.

Luu y:

- `order-service` hien da handle `payment.failed`.
- Dung `FAILED`, khong dung `CANCELLED`, vi `order-service` chua consume `payment.cancelled`.

### 7.6. Webhook business validation

Khi nhan SePay webhook tien vao:

1. Verify transport/security:
   - HTTPS o gateway/ingress.
   - HMAC hop le.
   - Timestamp trong +/- 5 phut.
   - IP allowlist neu co.

2. Store raw event:
   - Insert `payment_provider_events`.
   - Neu duplicate cung payload, return success.
   - Neu duplicate khac payload, flag conflict va return non-2xx hoac 200 tuy policy. Khuyen nghi return 200 sau khi luu conflict de tranh retry spam, dong thoi alert.

3. Business validation:
   - `transferType` phai la `in`.
   - `accountNumber` nam trong allowlist.
   - `code` khop `payments.provider_payment_id`.
   - Payment ton tai, provider `sepay`.
   - Payment status con `PENDING` hoac `REQUIRES_ACTION`.
   - Payment chua het han, hoac trong grace window nho neu business cho phep.
   - `transferAmount` dung bang `payments.amount`.
   - Currency cua payment la `VND`.

4. Neu hop le:
   - Lock payment row `FOR UPDATE`.
   - Set `status = CAPTURED`, `captured_at = now()`.
   - Insert `payment_transactions` voi `gateway_transaction_id = referenceCode`.
   - Insert status history/audit log.
   - Insert outbox event `payment.captured`.
   - Update provider event `process_status = PROCESSED`.

5. Neu mismatch:
   - Khong capture payment tu dong.
   - Update provider event:
     - `ACCOUNT_MISMATCH`
     - `AMOUNT_MISMATCH`
     - `UNKNOWN_PAYMENT_CODE`
     - `EXPIRED_PAYMENT`
     - `ORDER_NOT_PAYABLE`
   - Gui notification/alert cho support.

### 7.7. Late payment policy

Can lam ro ngay trong implementation:

- Neu webhook den sau khi payment da `FAILED` do het han:
  - Khong transition `FAILED -> CAPTURED` vi current status transition khong cho phep va order co the da fail.
  - Luu provider event `LATE_PAYMENT`.
  - Tao notification cho support de xu ly refund/manual restore.

- Neu webhook den sau khi order da `CANCELLED`/`FAILED`:
  - Khong auto confirm order.
  - Luu provider event `ORDER_NOT_PAYABLE`.
  - Support can xu ly hoan tien hoac tao lai order.

- Neu payment da `CAPTURED` va webhook duplicate cung event:
  - Return success idempotently.

- Neu payment da `CAPTURED` nhung webhook khac reference cung code:
  - Flag `DUPLICATE_PAYMENT_CODE_TRANSFER`, manual review.

### 7.8. Doi soat SePay

Them worker trong `payment-service`:

- Config:

```env
SEPAY_RECONCILE_ENABLED=true
SEPAY_RECONCILE_INTERVAL_MS=1800000
SEPAY_API_TOKEN=...
SEPAY_RECONCILE_LOOKBACK_MINUTES=120
```

- Goi:

```txt
GET https://userapi.sepay.vn/v2/transactions?transaction_date_from=...&transaction_date_to=...&per_page=100&page=...
Authorization: Bearer {SEPAY_API_TOKEN}
```

- Hoac dung `since_id` neu da luu cursor.

Them table cursor:

```sql
CREATE TABLE IF NOT EXISTS payment_reconciliation_cursors (
  provider varchar(64) PRIMARY KEY,
  since_id varchar(128),
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Worker logic:

- Lay transactions moi tu SePay.
- Neu transaction chua co trong `payment_provider_events`, inject vao cung pipeline nhu webhook voi source `reconciliation`.
- Neu transaction da co nhung `process_status != PROCESSED`, thu xu ly lai neu con hop le.
- Emit metric `sepay_reconciliation_missing_total`.

### 7.9. API Gateway public route

File: `services/api-gateway/internal/router/router.go`

Them public route:

```go
public.Method(http.MethodPost, "/api/v1/payments/webhooks/sepay", proxies[config.ServicePayment])
public.Method(http.MethodPost, "/api/payments/webhooks/sepay", proxies[config.ServicePayment])
```

Ly do:

- SePay webhook khong co JWT buyer.
- Payment-service tu verify HMAC/API Key.
- Route phai public HTTPS tren production domain.

Can can nhac rate limit rieng cho webhook de khong bi global user-facing rate limit chan retry SePay.

### 7.10. Update shared contracts

Files:

- `shared/kafka/events/payment.events.ts`
- `frontend/apps/buyer-web/src/lib/api/types.ts`

Them:

```ts
export interface PaymentInstructions {
  type: 'VIETQR';
  paymentCode: string;
  qrImageUrl: string;
  bankCode: string;
  accountNumber: string;
  accountName?: string | null;
  amount: number;
  currency: 'VND';
  transferDescription: string;
  expiresAt: string;
}
```

`Payment` co them optional:

```ts
paymentInstructions?: PaymentInstructions;
expiresAt?: string | null;
capturedAt?: string | null;
```

Neu payment API docs duoc maintain trong `docs/api/payment-service-api.md`, cap nhat response schema.

## 8. Thay doi frontend chi tiet

### 8.1. Checkout submit flow

File: `frontend/apps/buyer-web/src/app/checkout/page.tsx`

Thay doi:

- Khi `paymentMethod === 'online'`:
  - Tao order(s) nhu hien tai.
  - Goi `createBuyerPaymentIntent` cho tung order.
  - Khong clear cart va redirect `/orders` ngay neu payment intent thanh cong.
  - Luu danh sach orderIds/paymentIds trong URL hoac session storage.
  - Redirect:
    - 1 order: `/checkout/payment/{orderId}`
    - nhieu order: `/checkout/payment?orderIds=id1,id2`
  - Chi clear cart sau khi payment page duoc khoi tao thanh cong, hoac clear ngay sau khi order created nhung can co trang retry payment tu order detail.

De xuat an toan:

- Clear cart sau khi tat ca order va payment intent da tao thanh cong.
- Neu mot payment intent fail:
  - Khong mat order.
  - Redirect order detail/list va hien "Don hang da tao nhung khoi tao QR that bai, vui long thu lai".
  - Order detail co nut "Tiep tuc thanh toan".

### 8.2. Trang QR payment moi

Them:

- `frontend/apps/buyer-web/src/app/checkout/payment/[orderId]/page.tsx`
- Hoac component shared `PaymentQrPanel`.
- Neu multi-order: `frontend/apps/buyer-web/src/app/checkout/payment/page.tsx`.

UI:

- Header buyer nhu checkout hien tai.
- Khu vuc QR:
  - QR image tu `payment.paymentInstructions.qrImageUrl`.
  - So tien: format VND.
  - Noi dung chuyen khoan: copy button.
  - Ngan hang, so tai khoan, ten chu tai khoan: copy button.
  - Dem nguoc `expiresAt`.
  - Badge status: `Cho chuyen khoan`, `Da thanh toan`, `Het han`, `Can ho tro`.
- Poll:
  - Goi `fetchBuyerPaymentByOrderId` moi 3 giay.
  - Dung backoff khi tab hidden.
  - Stop poll khi `CAPTURED`, `FAILED`, `CANCELLED`, `REFUNDED`.
- Khi `CAPTURED`:
  - Hien success state.
  - Sau 2-3 giay redirect `/orders/{orderId}` hoac nut xem don.
- Khi het han:
  - Hien "Ma QR da het han".
  - Neu order van payable, nut "Tao lai ma QR"; neu order da failed, nut "Dat lai".

Khong nen dung `requiresActionUrl` de mo external link trong MVP, vi QR duoc hien inline.

### 8.3. Order list/detail

Files:

- `frontend/apps/buyer-web/src/app/orders/page.tsx`
- `frontend/apps/buyer-web/src/app/orders/[orderId]/page.tsx`

Thay doi:

- Neu `order.paymentMethod === 'ONLINE'` va payment status `PENDING` co `paymentInstructions`, hien nut `Tiep tuc thanh toan` tro ve `/checkout/payment/{orderId}`.
- Neu `payment.status === 'CAPTURED'`, hien `Da thanh toan`.
- Neu `payment.status === 'FAILED'`, hien `Thanh toan het han/that bai`.

### 8.4. i18n

File: `frontend/apps/buyer-web/src/lib/i18n.ts`

Them text VI/EN:

- `paymentQrTitle`
- `paymentQrSubtitle`
- `paymentQrAmount`
- `paymentQrContent`
- `paymentQrBank`
- `paymentQrAccount`
- `paymentQrCopy`
- `paymentQrCopied`
- `paymentQrExpiresIn`
- `paymentQrExpired`
- `paymentQrPaid`
- `paymentQrPending`
- `paymentQrRetry`
- `paymentQrSupport`

## 9. Trang thai va event mapping

### Payment status

| Hanh dong | Status hien tai | Status moi | Event |
| --- | --- | --- | --- |
| Tao SePay intent | auto PENDING hoac none | PENDING | payment.created |
| SePay webhook exact match | PENDING | CAPTURED | payment.captured |
| Het han QR | PENDING | FAILED | payment.failed |
| Refund manual sau nay | CAPTURED | PARTIALLY_REFUNDED/REFUNDED | payment.partially-refunded/payment.refunded |
| Late payment sau FAILED | FAILED | giu FAILED | provider event manual review |

### Order saga

| Event | order-service xu ly |
| --- | --- |
| `payment.captured` | `HandlePaymentCaptured`, set saga payment `CAPTURED` |
| `payment.failed` | `HandlePaymentFailed`, set saga failed va order failed neu order con `PENDING` |
| inventory reserved + payment captured | saga completed |
| seller confirm sau saga completed | order `PENDING -> CONFIRMED` |

## 10. Bao mat

Checklist production:

- Webhook URL public HTTPS, cert hop le.
- Public route chi expose `/api/v1/payments/webhooks/sepay`, khong expose route admin.
- HMAC-SHA256 bat buoc:
  - Header `X-SePay-Signature: sha256={hex_hash}`
  - Header `X-SePay-Timestamp`
  - Message: `{timestamp}.{raw_body}`
  - Secret: `SEPAY_WEBHOOK_SECRET`
  - Reject timestamp lech qua 5 phut.
- Constant-time comparison.
- Whitelist IP SePay o ingress/firewall neu danh sach IP on dinh.
- Validate `accountNumber` voi allowlist.
- Validate `transferAmount` exact.
- Validate `code`/paymentCode exact.
- Khong log secret, API token, full Authorization header.
- Luu raw payload de audit nhung can can nhac masking neu co PII.
- Rate limit rieng cho webhook, tranh user global rate limit chan SePay retry.
- Return response nhanh; khong goi email/third-party dong bo trong request webhook.

## 11. Observability

Metrics de them trong `payment-service`:

- `payment_sepay_webhook_received_total`
- `payment_sepay_webhook_processed_total`
- `payment_sepay_webhook_duplicate_total`
- `payment_sepay_webhook_invalid_signature_total`
- `payment_sepay_webhook_amount_mismatch_total`
- `payment_sepay_webhook_unknown_code_total`
- `payment_sepay_payment_captured_total`
- `payment_sepay_payment_expired_total`
- `payment_sepay_reconciliation_missing_total`
- `payment_sepay_reconciliation_errors_total`

Logs:

- Luon log `requestId`, `providerEventId`, `referenceCode`, `paymentCode`, `paymentId`, `orderId`.
- Khong log raw secret/header auth.

Alerts:

- Invalid signature spike.
- Unknown payment code spike.
- Amount mismatch.
- Reconciliation missing transactions > 0.
- Payment pending qua expiry nhung chua failed.
- Outbox `payment.events` lag cao.

## 12. Test plan

### Unit tests payment-service

Commands:

```bash
cd services/payment-service && go test ./...
```

Test cases:

- Config accepts `PAYMENT_GATEWAY=sepay`.
- Config fail neu thieu required SePay env trong sepay mode.
- SePay QR URL encode dung `acc`, `bank`, `amount`, `des`, `template`.
- SePay rejects non-`VND`.
- SePay rejects decimal VND amount.
- Payment code unique va co prefix expected.
- HMAC verify pass voi raw body.
- HMAC verify fail khi body bi thay doi.
- Timestamp replay fail khi lech qua tolerance.
- Webhook parse maps SePay payload to `CAPTURED`.
- Webhook duplicate same `id` returns success idempotently.
- Webhook duplicate same `id` different body flags conflict/manual review.
- Unknown `code` stores provider event, does not capture.
- Amount mismatch stores provider event, does not capture.
- Account mismatch stores provider event, does not capture.
- Expired payment webhook becomes late/manual review.
- Exact webhook transitions payment `PENDING -> CAPTURED` and inserts outbox `payment.captured`.
- Expiry worker transitions `PENDING -> FAILED` and emits `payment.failed`.
- Reconciliation imports missing transaction and reuses webhook pipeline.

### Unit/integration tests order-service

Commands:

```bash
cd services/order-service && go test ./...
```

Test cases:

- Existing `payment.captured` saga behavior still pass.
- `payment.failed` from expired QR fails pending ONLINE order.
- COD behavior unaffected.

### Frontend validation

Commands:

```bash
npm --workspace frontend/apps/buyer-web run lint
npm --workspace frontend/apps/buyer-web run build
```

Manual cases:

- Checkout COD unchanged.
- Checkout online one item:
  - Creates order.
  - Shows QR with correct VND amount and transfer content.
  - Polling moves to paid state after simulated webhook.
- Checkout online multiple items:
  - Shows multiple QR cards or clear grouped state.
  - Each payment can independently become paid.
- Refresh QR page:
  - Fetches payment by order ID and re-renders QR.
- Expired QR:
  - Countdown stops.
  - UI shows expired/failed.
- Order detail:
  - Pending online payment shows "Tiep tuc thanh toan".
  - Captured payment shows "Da thanh toan".

### End-to-end local simulation

1. Run stack:

```bash
docker compose up
```

2. Configure payment-service with `PAYMENT_GATEWAY=sepay` and test env.
3. Use ngrok/cloudflared to expose API Gateway webhook URL:

```txt
https://{public-domain}/api/v1/payments/webhooks/sepay
```

4. Tao webhook trong SePay test mode.
5. Tao order online tren buyer web.
6. Simulate SePay transaction hoac curl signed payload.
7. Verify:
   - `payments.status = CAPTURED`
   - `payment_transactions` co row gateway transaction
   - `payment_provider_events.process_status = PROCESSED`
   - outbox da publish `payment.captured`
   - order saga payment status `CAPTURED`
   - buyer UI hien paid.

## 13. Rollout plan

### Phase 0 - Chot thong tin van hanh

- Xac nhan ngan hang, so tai khoan, ten chu tai khoan.
- Xac nhan co dung VA khong.
- Xac nhan prefix payment code tren SePay dashboard, de xuat `EMX`.
- Xac nhan SePay webhook auth mode production: HMAC-SHA256.
- Xac nhan public webhook domain production.
- Xac nhan policy late payment, underpayment, overpayment.

### Phase 1 - Backend SePay provider

- Config `sepay`.
- SePay gateway adapter.
- Migration `payment_provider_events`, `payments.expires_at`, `payments.captured_at`, reconciliation cursor.
- Payment response `paymentInstructions`.
- Raw webhook handler + HMAC verify.
- Webhook business validation + idempotency.
- Expiry worker.
- Unit tests.

### Phase 2 - API Gateway va infra

- Public webhook route.
- Docker/Kubernetes env.
- Secrets wiring.
- Ingress HTTPS path.
- Rate limit exception/rule cho SePay webhook.
- Smoke test webhook endpoint.

### Phase 3 - Frontend QR UX

- Checkout redirect to payment page.
- Payment QR page one/multiple order.
- Polling and countdown.
- Order list/detail continue payment.
- i18n.
- Lint/build.

### Phase 4 - Doi soat va operations

- Reconciliation worker.
- Metrics/logs/alerts.
- Dashboard docs/runbook.
- Manual review workflow cho mismatch/late payment.

### Phase 5 - Sandbox/test mode UAT

- Dung SePay test mode neu account co.
- Test webhook retry/replay.
- Test ngrok/local public URL.
- Test mobile banking QR scan neu sandbox/live cho phep.

### Phase 6 - Production rollout

- Enable feature flag cho internal/test users.
- Monitor webhook/mismatch/expired trong 24-48h.
- Enable full buyer traffic.
- Document support playbook.

## 14. Feature flags va migration strategy

Feature flags:

Implementation status 2026-05-31:

- Phase 0-2: backend SePay provider, webhook, expiry worker, API Gateway route va infra placeholders da implemented.
- Phase 3: buyer checkout redirect, QR payment page one/multi order, polling/countdown, continue-payment links va i18n da implemented.
- Phase 4: reconciliation worker, provider event audit, cursor va operations runbook da implemented.
- Phase 5: Test Mode config path va sandbox UAT runbook da documented.
- Phase 6: buyer online payment runtime flag va production rollout/rollback checklist da documented.

```env
BUYER_ONLINE_PAYMENT_ENABLED=true
PAYMENT_GATEWAY=sepay
SEPAY_RECONCILE_ENABLED=false
```

Rollout:

- Deploy DB migration first.
- Deploy backend support with `PAYMENT_GATEWAY=mock` unchanged.
- Enable `PAYMENT_GATEWAY=sepay` in staging.
- Verify frontend hidden behind `BUYER_ONLINE_PAYMENT_ENABLED`.
- Enable production after webhook URL, HMAC secret, bank account config ready.

Rollback:

- Set `BUYER_ONLINE_PAYMENT_ENABLED=false` to hide online option.
- Set `PAYMENT_GATEWAY=mock` only in non-prod; production rollback should hide online payment, not switch captured money to mock.
- Keep webhook endpoint active after rollback to still capture/refund manually any pending transfers.

## 15. Cac diem can quyet dinh truoc khi code

1. Ngan hang nhan tien la ngan hang nao? Co bat buoc VA, `SEVQR`, hay `TKP{VA}` trong noi dung khong?
2. Platform nhan tien tap trung hay moi seller co tai khoan SePay rieng?
3. Neu buyer chuyen thieu/thua tien, policy la gi?
4. Neu buyer chuyen sau 15 phut, policy la refund manual hay restore order neu con hang?
5. Cart nhieu item co chap nhan hien nhieu QR trong MVP khong?
6. Sau khi payment captured va inventory reserved, co tu dong confirm order khong, hay giu rule hien tai seller phai confirm?
7. Co can gui notification realtime/WebSocket thay polling khong? MVP de polling.

## 16. Acceptance criteria

- Buyer chon online va thay QR dung amount/noi dung/tai khoan trong vong 2 giay sau khi order tao xong.
- QR scan tu app ngan hang fill dung amount va memo.
- Webhook SePay hop le capture payment trong `payment-service`.
- Payment duplicate webhook khong tao duplicate transaction/outbox.
- Amount/account/code mismatch khong auto capture.
- Payment captured phat `payment.captured` va order saga nhan duoc.
- Buyer UI tu chuyen sang paid state trong vong mot lan polling sau khi webhook processed.
- Payment het han sau 15 phut chuyen failed va order saga failed neu chua thanh toan.
- Doi soat co the import giao dich bi mat webhook.
- COD checkout khong bi thay doi.
