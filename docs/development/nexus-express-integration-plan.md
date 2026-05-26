# Kế Hoạch Triển Khai Tích Hợp Nexus Express Trên Production

## 1. Mục Tiêu

Tích hợp hệ thống ecommerce với Nexus Express để:

1. Tạo vận đơn Nexus từ đơn hàng đã đủ điều kiện giao.
2. Lưu mã vận đơn, tracking URL, label và pickup reference vào `shipping-service`.
3. Nhận webhook trạng thái vận chuyển từ Nexus và cập nhật shipment nội bộ.
4. Hỗ trợ kiểm thử có kiểm soát trực tiếp trên production, không phát sinh pickup/giao hàng thật trong lần test đầu.
5. Chuẩn bị nền tảng cho hủy vận đơn, truy vấn tracking và lấy lại label ở giai đoạn tiếp theo.

## 2. Trạng Thái Thông Tin Hiện Tại

### 2.1 Đã đủ để bắt đầu code

Nexus đã xác nhận các contract và quy tắc sau:

| Nhóm | Giá trị đã chốt |
| --- | --- |
| Production base URL | `https://ops.nexus-ex.site` |
| Health endpoint | `GET /merchant/integrations/health` |
| Create order endpoint | `POST /merchant/integrations/orders` |
| Cancel endpoint | `POST /merchant/integrations/orders/{platform}/{shopId}/{externalOrderId}/cancel` |
| Query order endpoint | `GET /merchant/integrations/orders/{platform}/{shopId}/{externalOrderId}` |
| Tracking endpoint | `GET /merchant/integrations/shipments/{shipmentCode}/tracking` |
| Label endpoint | `GET /merchant/integrations/shipments/{shipmentCode}/label?format=A6` |
| Authentication | HMAC-SHA256, kết quả hex lowercase |
| Timestamp | ISO-8601 UTC `Z` hoặc timezone offset |
| Shop ID | Dùng `sellerId` UUID làm `external.shopId` |
| Idempotency key | `<partner_code>:<sellerId>:<order.id>` |
| Mã vận đơn | `shipmentCode` lưu vào `awb` và `trackingNumber` |
| Status tạo thành công | Nexus `CREATED` -> internal `AWB_CREATED` |
| Default dịch vụ | `STANDARD` |
| Default pickup | `PICKUP` |
| Default payer | `RECEIVER` |
| Default COD | `codAmount=totalAmount`, `codIncludesShippingFee=true` |
| Default parcel giai đoạn đầu | `500g`, `20x15x10cm` |
| Kiểm thử không pickup | Gửi `options.autoCreatePickup=false` |
| Webhook endpoint phía mình | `POST /api/v1/shipments/webhooks/nexus` |
| Webhook security | HMAC-SHA256 hex lowercase, secret production riêng |

### 2.2 Chưa đủ để bật gọi production thật

Các thông tin dưới đây không chặn việc phát triển code, nhưng bắt buộc phải có trước khi bật `NEXUS_ENABLED=true`:

```text
PROD_NEXUS_PARTNER_CODE
PROD_NEXUS_API_KEY
PROD_NEXUS_API_SECRET
PROD_NEXUS_WEBHOOK_SECRET
```

Ngoài ra cần hoàn tất:

```text
1. Nexus xác nhận /merchant/integrations/* đã enable và health check thành công.
2. Nexus cấp mapping sellerId -> merchantId -> senderHubCode cho shop production dùng để test.
3. Nexus cấp đầy đủ sender profile của shop test.
4. Bên mình cung cấp public production webhook URL.
5. Bên mình cung cấp outbound IP nếu Nexus bật whitelist.
6. Hai bên xác nhận đơn test đầu tiên dùng autoCreatePickup=false hoặc merchant test không điều phối thật.
```

### 2.3 Trạng thái triển khai trong mã nguồn

Đã triển khai cho lần kiểm thử tạo vận đơn đầu tiên:

- Buyer checkout giữ `sellerId`, gửi thông tin người nhận và `paymentMethod`.
- `order-service` lưu các trường giao hàng, kiểm tra seller theo product catalog và phát payload shipping khi order `CONFIRMED`.
- Checkout COD được `CONFIRMED` sau khi reserve tồn kho; đơn online vẫn cần payment captured.
- `shipping-service` tạo shipment từ `order.status-updated(CONFIRMED)`, ghi durable provider request và có worker gọi Nexus.
- Nexus client ký HMAC raw body, hỗ trợ `GET health` và `POST create order`.
- Có lệnh `go run ./cmd/nexus-healthcheck` để ký/gọi health trước khi bật outbound.
- Kết quả create lưu AWB/tracking/metadata, history, tracking event và outbox event.
- Webhook Nexus public qua API gateway, verify HMAC/timestamp/partner code, hỗ trợ `webhook.ping` và trạng thái phase đầu; webhook có thể bật độc lập bằng `NEXUS_WEBHOOK_ENABLED=true`.
- Cấu hình deploy mặc định `NEXUS_ENABLED=false` và `NEXUS_WEBHOOK_ENABLED=false`.
- Khi bật outbound, chỉ đơn của seller có trong file mapping active mới được gửi Nexus; seller chưa mapping vẫn tạo shipment nội bộ như trước.

Chưa triển khai trong đợt code này: thao tác nghiệp vụ gọi cancel, query order, tracking và label từ màn hình/API nội bộ; các endpoint này thuộc giai đoạn tiếp theo sau khi create order và webhook được nghiệm thu.

## 3. Hiện Trạng Repository Và Khoảng Trống Cần Sửa

### 3.1 Thành phần đã có

| Thành phần | Hiện trạng |
| --- | --- |
| `order-service` | Tạo order, lưu item/giá, phát `order.created` và `order.status-updated` |
| `shipping-service` | Lưu shipment, status/tracking event, webhook generic, Kafka outbox |
| Kafka | `shipping-service` đã consume `order.events` |
| Buyer web | Checkout đã nhập tên, số điện thoại, địa chỉ người nhận |
| Seller/buyer UI | Đã đọc shipment và tracking events để hiển thị |

### 3.2 Khoảng trống hiện tại

| Vấn đề | Ảnh hưởng |
| --- | --- |
| Checkout chưa gửi `recipientName`, `recipientPhone`, `recipientAddress` lên order API | Không có dữ liệu người nhận để gửi Nexus |
| Cart/order chưa giữ `sellerId` theo đơn hàng | Không map được `external.shopId`/merchant Nexus |
| `order-service` chưa lưu payment method và shipping address | Không tính COD đúng và không phát event đủ dữ liệu |
| `shipping-service` đang auto-create từ `order.created` | Có nguy cơ tạo shipment trước khi checkout saga hoàn tất |
| Chưa có Nexus HTTP client | Chưa có request/HMAC sang Nexus |
| Webhook hiện tại nhận schema nội bộ generic | Chưa parse và verify schema webhook Nexus |
| Chưa có durable queue cho request gọi provider | Có thể mất yêu cầu tạo vận đơn nếu process lỗi sau khi tạo shipment |

## 4. Quyết Định Kiến Trúc

### 4.1 Service chịu trách nhiệm

`shipping-service` là service duy nhất giao tiếp với Nexus:

- Gọi create order/cancel/query/tracking/label.
- Ký HMAC cho request đi.
- Verify HMAC webhook nhận về.
- Lưu thông tin provider và đồng bộ status shipment.

`order-service` không gọi trực tiếp Nexus. Service này chịu trách nhiệm:

- Lưu dữ liệu checkout cần cho vận chuyển.
- Xác thực seller/order data ở boundary.
- Phát event đủ dữ liệu khi order thay đổi trạng thái.

### 4.2 Thời điểm tạo vận đơn

Không gọi Nexus từ `order.created`, vì lúc đó order đang `PENDING` và saga inventory/payment chưa chắc hoàn tất.

Trigger đề xuất:

```text
order.status-updated với status=CONFIRMED
```

Lý do:

- `CONFIRMED` chứng minh checkout saga đã thành công.
- Không tạo vận đơn cho đơn inventory fail/payment fail.
- Payload gửi Nexus có thể dùng `orderStatus=READY_TO_SHIP`.

Luồng sau khi sửa:

```text
Buyer checkout
  -> order-service tạo order PENDING
  -> inventory/payment checkout saga
  -> order-service chuyển order sang CONFIRMED
  -> publish order.status-updated(CONFIRMED)
  -> shipping-service tạo shipment PENDING
  -> enqueue Nexus CREATE_ORDER request
  -> worker gọi Nexus
  -> update shipment AWB_CREATED
```

### 4.3 Không gọi HTTP bên ngoài trong transaction database

`shipping-service` không được giữ DB transaction mở trong lúc gọi Nexus. Dùng quy trình hai bước:

1. Trong transaction: tạo shipment `PENDING` và tạo bản ghi yêu cầu gọi provider.
2. Sau commit: worker lấy request pending, gọi Nexus, sau đó cập nhật shipment/result trong transaction mới.

Điều này tránh transaction kéo dài và bảo đảm có thể retry nếu service restart.

### 4.4 Giai đoạn đầu chỉ hỗ trợ order một seller

Order vận chuyển cần một sender/shop duy nhất. Giai đoạn đầu:

- Cart vẫn có thể hiển thị item, nhưng checkout chỉ cho phép chọn item từ một `sellerId`.
- Nếu cart có item từ nhiều seller, frontend báo lỗi và không tạo order.
- Giai đoạn sau mới tách checkout thành nhiều order theo seller.

## 5. Luồng End-To-End Mục Tiêu

```text
1. Buyer thêm sản phẩm có sellerId vào cart.
2. Buyer nhập/kiểm tra thông tin người nhận và chọn COD hoặc online.
3. buyer-web gửi CreateOrderInput gồm sellerId, receiver và paymentMethod.
4. order-service kiểm tra dữ liệu, lưu order PENDING và phát order.created.
5. Checkout saga xử lý inventory/payment.
6. Khi thành công, order-service chuyển order sang CONFIRMED và phát order.status-updated.
7. shipping-service consume event CONFIRMED, tạo shipment PENDING và Nexus request PENDING.
8. Nexus worker ký HMAC và gọi POST /merchant/integrations/orders.
9. Nexus trả shipmentCode; shipping-service lưu AWB/tracking/metadata và status AWB_CREATED.
10. Nexus gửi webhook trạng thái; shipping-service verify signature và cập nhật tracking.
11. Buyer/seller đọc shipment hiện có để xem trạng thái.
```

## 6. Phase 1 - Bổ Sung Dữ Liệu Từ Buyer Web

### 6.1 Bổ sung seller vào cart

File liên quan:

- `frontend/apps/buyer-web/src/providers/AppProvider.tsx`
- `frontend/apps/buyer-web/src/app/products/[productId]/page.tsx`
- Các luồng add-to-cart khác nếu có.

Thêm vào `CartItem` và `AddToCartPayload`:

```ts
sellerId: string;
sellerName?: string;
```

Yêu cầu:

- Product detail phải truyền `product.sellerId` khi add cart.
- Dữ liệu localStorage cũ không có `sellerId` không được checkout âm thầm.
- Khi đọc cart cũ, đánh dấu item thiếu seller là không hợp lệ hoặc buộc tải lại product để bổ sung.

### 6.2 Validate một seller tại checkout

Trong checkout:

```ts
const sellerIds = new Set(items.map((item) => item.sellerId));
```

Quy tắc:

- Không có seller hợp lệ: không cho đặt hàng.
- `sellerIds.size > 1`: không cho đặt hàng ở giai đoạn đầu.
- `sellerIds.size === 1`: gửi seller đó trong order payload.

### 6.3 Mở rộng payload tạo order

Mở rộng `CreateOrderInput` tại buyer frontend:

```ts
interface CreateOrderInput {
  sellerId: string;
  currency: string;
  shippingAmount?: number;
  discountAmount?: number;
  note?: string;
  paymentMethod: 'COD' | 'ONLINE';
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientWard?: string;
  recipientDistrict?: string;
  recipientProvince?: string;
  items: CreateOrderItemInput[];
}
```

Phase production chính thức nên bổ sung trường địa chỉ tách biệt trên form:

```text
recipientWard
recipientDistrict
recipientProvince
```

Nexus đã bắt buộc rõ dữ liệu sender production; với receiver, gửi địa chỉ cấu trúc đầy đủ giúp route/SLA và hạn chế đơn lỗi. Trong lần code đầu, có thể để các trường này optional nhưng không bật production thật cho đến khi thống nhất dữ liệu receiver dùng để test.

### 6.4 Payment method

Checkout phải truyền:

```text
COD
ONLINE
```

Mapping COD khi gửi Nexus:

| Payment method | `codAmount` | `codIncludesShippingFee` |
| --- | ---: | --- |
| `ONLINE` đã captured | `0` | `false` |
| `COD` | `order.totalAmount` | `true` |

## 7. Phase 2 - Cập Nhật Order-Service

### 7.1 Database migration

Thêm cột vào `orders` bằng migration idempotent:

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_name varchar(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_phone varchar(32);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_address varchar(500);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_ward varchar(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_district varchar(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_province varchar(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method varchar(32);
```

Sau khi backfill hoặc khi tất cả client đã gửi dữ liệu mới, có thể siết `NOT NULL` cho các trường cần thiết.

### 7.2 Request/domain/repository

Cập nhật:

- `services/order-service/internal/domain/domain.go`
- `services/order-service/internal/service/order_service.go`
- `services/order-service/internal/repository/order_repository.go`
- Migration order-service.

`CreateOrderRequest` mới:

```go
type CreateOrderRequest struct {
    SellerID          string                   `json:"sellerId"`
    Currency          string                   `json:"currency"`
    ShippingAmount    *float64                 `json:"shippingAmount,omitempty"`
    DiscountAmount    *float64                 `json:"discountAmount,omitempty"`
    Note              *string                  `json:"note,omitempty"`
    PaymentMethod     string                   `json:"paymentMethod"`
    RecipientName     string                   `json:"recipientName"`
    RecipientPhone    string                   `json:"recipientPhone"`
    RecipientAddress  string                   `json:"recipientAddress"`
    RecipientWard     *string                  `json:"recipientWard,omitempty"`
    RecipientDistrict *string                  `json:"recipientDistrict,omitempty"`
    RecipientProvince *string                  `json:"recipientProvince,omitempty"`
    Items             []CreateOrderItemRequest `json:"items"`
}
```

Validation tối thiểu:

```text
sellerId phải là UUID.
recipientName: 1..255 ký tự.
recipientPhone: 1..32 ký tự.
recipientAddress: 1..500 ký tự.
recipientWard/recipientDistrict/recipientProvince: tối đa 128 ký tự nếu có.
paymentMethod chỉ nhận COD hoặc ONLINE.
```

### 7.3 Xác thực seller authoritative

Không chỉ tin vào `sellerId` do browser gửi. `order-service` đang tra product catalog để xác minh giá/SKU; cần mở rộng catalog snapshot để nhận `sellerId` của product.

Khi tạo order:

1. Lấy từng product từ `product-service`.
2. Xác minh tất cả product thuộc cùng seller.
3. Xác minh seller đó trùng `req.SellerID`.
4. Từ chối request nếu có sản phẩm khác seller hoặc seller không khớp.

### 7.4 COD và checkout saga

Hiện checkout saga xác nhận order dựa vào inventory/payment events. Cần định nghĩa rõ:

- `ONLINE`: chỉ chuyển `CONFIRMED` sau khi inventory reserved và payment captured.
- `COD`: không chờ thanh toán online; chuyển `CONFIRMED` sau khi inventory reserved và ghi nhận phương thức `COD`.

Không gửi Nexus khi order còn `PENDING`.

### 7.5 Order response và Kafka event

Thêm shipping data vào response order và tất cả event cần downstream sử dụng, đặc biệt `order.status-updated(CONFIRMED)`:

```json
{
  "orderId": "...",
  "orderNumber": "...",
  "orderCode": "...",
  "userId": "...",
  "sellerId": "...",
  "status": "CONFIRMED",
  "paymentMethod": "COD",
  "currency": "VND",
  "subtotalAmount": 150000,
  "shippingAmount": 30000,
  "discountAmount": 0,
  "totalAmount": 180000,
  "recipientName": "Nguyen Van A",
  "recipientPhone": "0909000000",
  "recipientAddress": "44 Ho Tung Mau",
  "recipientWard": "Phuong Dich Vong",
  "recipientDistrict": "Cau Giay",
  "recipientProvince": "Ha Noi",
  "note": "Goi truoc khi giao",
  "items": []
}
```

## 8. Phase 3 - Cấu Hình Nexus Và Merchant Mapping

### 8.1 Environment variables

`shipping-service` đọc các biến theo môi trường runtime. Production cấu hình:

```env
NEXUS_ENABLED=false
NEXUS_WEBHOOK_ENABLED=false
NEXUS_BASE_URL=https://ops.nexus-ex.site
NEXUS_PARTNER_CODE=
NEXUS_API_KEY=
NEXUS_API_SECRET=
NEXUS_WEBHOOK_SECRET=
NEXUS_MERCHANT_MAPPING_FILE=/run/config/nexus-merchants.json
NEXUS_DEFAULT_SERVICE_TYPE=STANDARD
NEXUS_DEFAULT_PICKUP_TYPE=PICKUP
NEXUS_DEFAULT_PAYER=RECEIVER
NEXUS_DEFAULT_WEIGHT_GRAM=500
NEXUS_DEFAULT_LENGTH_CM=20
NEXUS_DEFAULT_WIDTH_CM=15
NEXUS_DEFAULT_HEIGHT_CM=10
NEXUS_AUTO_CREATE_PICKUP=false
NEXUS_REQUEST_TIMEOUT_MS=10000
```

Quy tắc:

- Commit code với `NEXUS_ENABLED=false` và `NEXUS_WEBHOOK_ENABLED=false`.
- Secret chỉ được inject qua secret manager/Kubernetes Secret/runtime env.
- Bật `NEXUS_WEBHOOK_ENABLED=true` trước để Nexus xác minh `webhook.ping`, trong lúc vẫn giữ `NEXUS_ENABLED=false`.
- Chỉ bật `NEXUS_ENABLED=true` sau checklist ở mục 16; file mapping phase đầu đóng vai trò allowlist shop test.
- Test production đầu tiên giữ `NEXUS_AUTO_CREATE_PICKUP=false`.

### 8.2 Merchant mapping file giai đoạn đầu

Nexus sẽ cấp mapping shop production dùng để test. Lưu file cấu hình runtime, không hardcode vào code:

```json
[
  {
    "shopId": "<seller-uuid>",
    "merchantId": "<nexus-merchant-id>",
    "shopName": "<shop-name>",
    "sender": {
      "name": "<sender-name>",
      "phone": "<sender-phone>",
      "address": "<sender-address>",
      "ward": "<sender-ward>",
      "district": "<sender-district>",
      "province": "<sender-province>",
      "hubCode": "<sender-hub-code>"
    },
    "active": true
  }
]
```

File mẫu trong repository: `services/shipping-service/config/nexus-merchant-mappings.example.json`.

Không gọi Nexus nếu:

- Không có mapping cho seller.
- Mapping inactive.
- Thiếu sender field bắt buộc.

Ứng xử nội bộ:

- Seller chưa mapping vẫn tạo shipment nội bộ nhưng không tạo `shipment_provider_requests` gửi Nexus.
- Chỉ seller có mapping active mới tạo provider request; trong lần test đầu file mapping chỉ chứa shop test.
- Nếu Nexus trả `MERCHANT_NOT_FOUND` cho seller đã mapping, provider request chuyển `FAILED` không retry vô hạn để vận hành kiểm tra mapping phía Nexus.

### 8.3 Hướng production lâu dài

Sau lần tích hợp đầu, thay mapping file bằng:

- DB table cấu hình provider theo seller/warehouse; hoặc
- Admin flow đồng bộ merchant mapping.

## 9. Phase 4 - Nexus HTTP Client Và HMAC

### 9.1 Package đề xuất

Tạo package:

```text
services/shipping-service/internal/nexus/
  client.go
  signing.go
  types.go
  client_test.go
  signing_test.go
```

### 9.2 Signature

Mỗi endpoint `/merchant/integrations/*` đều phải ký HMAC, kể cả health.

Chuỗi ký:

```text
METHOD + "\n" +
PATH + "\n" +
X-Nexus-Timestamp + "\n" +
X-Nexus-Nonce + "\n" +
SHA256_HEX_LOWERCASE(raw_request_body)
```

Headers:

```http
Content-Type: application/json
X-Nexus-Partner-Code: <partner_code>
X-Nexus-Api-Key: <api_key>
X-Nexus-Timestamp: <RFC3339 UTC Z>
X-Nexus-Nonce: <UUID v4>
X-Nexus-Signature: <hex lowercase>
Idempotency-Key: <partner_code>:<sellerId>:<orderId>
```

Đối với `GET` không có body, ký SHA256 của empty body.

### 9.3 Client methods

Giai đoạn tạo vận đơn:

```go
Health(ctx context.Context) error
CreateOrder(ctx context.Context, idempotencyKey string, req CreateOrderRequest) (CreateOrderResponse, error)
```

Giai đoạn tiếp theo:

```go
CancelOrder(ctx context.Context, platform, shopID, externalOrderID, reason string) error
GetOrder(ctx context.Context, platform, shopID, externalOrderID string) (OrderResponse, error)
GetTracking(ctx context.Context, shipmentCode string) (TrackingResponse, error)
GetLabel(ctx context.Context, shipmentCode, format string) (LabelResponse, error)
```

### 9.4 Timeout/retry

Production rule:

| Tình huống | Hành động |
| --- | --- |
| Timeout | Retry |
| HTTP `408` | Retry |
| HTTP `429` | Retry theo `Retry-After` |
| HTTP `500/502/503/504` | Retry |
| HTTP `400` | Không retry, lưu validation error |
| HTTP `401/403` | Không retry, báo lỗi cấu hình/credential |
| HTTP `404 MERCHANT_NOT_FOUND` | Không retry tự động, yêu cầu mapping |
| HTTP `409 DUPLICATE_ORDER` | Không retry; kiểm tra payload/idempotency conflict |

Backoff đề xuất:

```text
1s, 3s, 10s, 30s, 2m
```

Mọi lần retry phải giữ nguyên:

```text
Idempotency-Key
external.platform
external.shopId
external.externalOrderId
raw business payload
```

## 10. Phase 5 - Shipping-Service Và Durable Provider Request

### 10.1 Sửa consumer trigger

Consumer hiện tại chỉ xử lý `order.created`. Cần chuyển/đổi logic:

- Lắng nghe `order.status-updated`.
- Chỉ tạo shipment/provider request khi `payload.status == "CONFIRMED"`.
- Idempotent theo `orderId`: nếu shipment đã tồn tại thì không tạo trùng.

`order.created` có thể tiếp tục được nhận để quan sát, nhưng không gọi Nexus.

### 10.2 Shipment nội bộ

Khi nhận order confirmed:

```text
provider=NEXUS
status=PENDING
orderId=<order.id>
buyerId=<order.userId>
sellerId=<order.sellerId>
shippingFee=<order.shippingAmount>
codAmount=<theo paymentMethod>
recipient fields=<order recipient fields>
metadata.source=order.status-updated
metadata.orderStatus=CONFIRMED
```

Phải emit `shipment.created` sau khi tạo shipment nội bộ để các consumer hiện tại nhìn thấy shipment mới.

### 10.3 Bảng provider request mới

Thêm bảng trong `shipping-service` để không mất request khi process crash hoặc Nexus tạm lỗi:

```sql
CREATE TABLE shipment_provider_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  provider varchar(64) NOT NULL,
  action varchar(64) NOT NULL,
  idempotency_key varchar(255) NOT NULL UNIQUE,
  request_payload jsonb NOT NULL,
  response_payload jsonb,
  status varchar(32) NOT NULL DEFAULT 'PENDING',
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  last_error varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Statuses:

```text
PENDING
PROCESSING
SUCCEEDED
FAILED
```

Quy tắc:

- `order.status-updated(CONFIRMED)` tạo shipment và provider request trong cùng transaction.
- Worker gọi Nexus ngoài transaction.
- `404 MERCHANT_NOT_FOUND` -> `FAILED` không lên lịch retry; vận hành bổ sung mapping trước khi gửi lại đơn.
- Validation/auth/signature conflict -> `FAILED` không lên lịch retry.
- Timeout/5xx/429 -> `FAILED` kèm `next_retry_at`; worker claim lại khi đến hạn.
- Thành công -> `SUCCEEDED`.

### 10.4 Nexus create order payload

Payload build từ order event và merchant mapping:

```json
{
  "external": {
    "platform": "<NEXUS_PARTNER_CODE>",
    "shopId": "<sellerId>",
    "externalOrderId": "<orderId>",
    "externalOrderCode": "<orderCode>",
    "orderCreatedAt": "<createdAt>",
    "orderStatus": "READY_TO_SHIP"
  },
  "merchant": {
    "merchantId": "<mappedMerchantId>",
    "shopName": "<mappedShopName>"
  },
  "sender": {
    "name": "<mappedSenderName>",
    "phone": "<mappedSenderPhone>",
    "address": "<mappedSenderAddress>",
    "ward": "<mappedSenderWard>",
    "district": "<mappedSenderDistrict>",
    "province": "<mappedSenderProvince>",
    "hubCode": "<mappedSenderHubCode>"
  },
  "receiver": {
    "name": "<recipientName>",
    "phone": "<recipientPhone>",
    "address": "<recipientAddress>",
    "ward": "<recipientWard>",
    "district": "<recipientDistrict>",
    "province": "<recipientProvince>",
    "note": "<note>"
  },
  "parcel": {
    "items": [
      {
        "sku": "<item.sku>",
        "name": "<item.productName>",
        "quantity": 1,
        "unitPrice": 150000
      }
    ],
    "weightGram": 500,
    "lengthCm": 20,
    "widthCm": 15,
    "heightCm": 10,
    "declaredValue": "<subtotalAmount - discountAmount>"
  },
  "service": {
    "serviceType": "STANDARD",
    "pickupType": "PICKUP"
  },
  "payment": {
    "codAmount": "<0 for ONLINE, totalAmount for COD>",
    "shippingFee": "<shippingAmount>",
    "payer": "RECEIVER",
    "codIncludesShippingFee": "<false for ONLINE, true for COD>"
  },
  "options": {
    "autoCreatePickup": false,
    "printLabelFormat": "A6"
  }
}
```

`autoCreatePickup=false` là bắt buộc cho đơn test production đầu tiên, trừ khi Nexus cấp merchant test không điều phối thật và xác nhận cách khác.

### 10.5 Xử lý response thành công

Khi Nexus trả thành công:

```text
data.shipmentCode -> shipment.awb
data.shipmentCode -> shipment.tracking_number
data.status=CREATED -> shipment.status=AWB_CREATED
data.trackingUrl -> metadata.nexus.trackingUrl
data.pickup.pickupCode -> metadata.nexus.pickupCode
data.label.url -> metadata.nexus.labelUrl
data.createdAt -> metadata.nexus.createdAt
```

Cùng transaction cập nhật thành công:

- Cập nhật shipment.
- Tạo tracking event `AWB_CREATED`.
- Tạo status history `PENDING -> AWB_CREATED`.
- Lưu audit log.
- Enqueue `shipment.status-updated`.
- Mark provider request `SUCCEEDED`.

## 11. Phase 6 - Webhook Nexus

### 11.1 Endpoint

Route hiện có sẽ tiếp nhận:

```http
POST /api/v1/shipments/webhooks/nexus
```

Public URL thật sẽ được gửi cho Nexus sau khi deploy:

```text
https://<public-domain>/api/v1/shipments/webhooks/nexus
```

### 11.2 Verify bảo mật

Webhook handler cần đọc raw body trước khi decode JSON và verify:

```http
X-Nexus-Partner-Code
X-Nexus-Timestamp
X-Nexus-Nonce
X-Nexus-Event-Id
X-Nexus-Signature
```

Validation:

- Partner code phải khớp cấu hình.
- Timestamp trong cửa sổ chấp nhận của Nexus.
- HMAC dùng `NEXUS_WEBHOOK_SECRET`, không dùng mặc định chung với API secret ở production.
- `eventId` trong body phải khớp `X-Nexus-Event-Id` nếu cả hai có mặt.
- Dùng `eventId` làm idempotency key.

### 11.3 Webhook ping

Nexus có thể gửi:

```json
{
  "eventId": "...",
  "eventType": "webhook.ping",
  "occurredAt": "...",
  "partnerCode": "...",
  "data": {
    "message": "Nexus webhook verification",
    "environment": "production"
  }
}
```

Xử lý:

- Verify HMAC.
- Không tìm shipment.
- Trả HTTP `2xx`.
- Lưu audit/log tối thiểu, không lưu secret/raw sensitive data.

### 11.4 Webhook shipment

Events giai đoạn đầu:

```text
shipment.status_changed
shipment.delivered
shipment.cancelled
shipment.returned
shipment.delivery_failed
```

Resolve shipment theo:

1. `data.externalOrderId` -> `order_id`.
2. Nếu thiếu/không tìm thấy, fallback `data.shipmentCode` -> `awb`/`tracking_number`.

Status mapping:

| Nexus status | Internal status |
| --- | --- |
| `CREATED` | `AWB_CREATED` |
| `UPDATED` | `AWB_CREATED` |
| `TASK_ASSIGNED` | `AWB_CREATED` |
| `PICKUP_COMPLETED` | `PICKED_UP` |
| `MANIFEST_SEALED` | `IN_TRANSIT` |
| `SEND_GOODS` | `IN_TRANSIT` |
| `IN_TRANSIT` | `IN_TRANSIT` |
| `MANIFEST_RECEIVED` | `IN_TRANSIT` |
| `MANIFEST_UNSEALED` | `IN_TRANSIT` |
| `SCAN_INBOUND` | `IN_TRANSIT` |
| `SCAN_OUTBOUND` | `IN_TRANSIT` |
| `INVENTORY_CHECK` | `IN_TRANSIT` |
| `DELIVERED` | `DELIVERED` |
| `DELIVERY_FAILED` | `FAILED` |
| `NDR_CREATED` | `FAILED` |
| `EXCEPTION` | `FAILED` |
| `RETURN_STARTED` | `RETURNED` |
| `RETURN_COMPLETED` | `RETURNED` |
| `CANCELLED` | `CANCELLED` |

Lưu ý transition:

- Sau khi đã có AWB, event `UPDATED`/`TASK_ASSIGNED` giữ shipment ở `AWB_CREATED`; không làm lùi status shipment đã ở trạng thái cao hơn.
- Duplicate webhook trả thành công mà không cập nhật trùng.
- Raw payload được lưu ở tracking event để điều tra khi cần.

## 12. Phase 7 - Cancel, Tracking Và Label

Phần này triển khai sau create order + webhook nếu cần rút ngắn thời gian tích hợp lần đầu.

### 12.1 Cancel

Khi order bị hủy và shipment đã có Nexus AWB:

```http
POST /merchant/integrations/orders/{platform}/{shopId}/{externalOrderId}/cancel
```

Quy tắc:

- Dùng provider request durable tương tự create order.
- Giữ idempotency cho hành động cancel.
- Nếu Nexus trả `CANNOT_CANCEL`, ghi nhận để vận hành xử lý return/NDR.

### 12.2 Tracking

Webhook là nguồn cập nhật chính. Tracking query dùng khi:

- Cần reconcile.
- Webhook bị gián đoạn.
- CSKH/seller yêu cầu refresh trực tiếp.

### 12.3 Label

- Sau create order, UI đọc `metadata.nexus.labelUrl` nếu còn hạn.
- Khi URL hết hạn, backend gọi label API để lấy URL mới.
- Không expose API credential ra frontend.

## 13. Migration Cụ Thể

### 13.1 `order-service`

Migration thêm cột shipping/order context:

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_name varchar(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_phone varchar(32);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_address varchar(500);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_ward varchar(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_district varchar(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_province varchar(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method varchar(32);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);
```

### 13.2 `shipping-service`

Shipment hiện đã có `provider`, `awb`, `tracking_number`, `metadata`, tracking event và webhook idempotency records. Thêm bảng provider request để xử lý external API bền vững:

```sql
CREATE TABLE IF NOT EXISTS shipment_provider_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  provider varchar(64) NOT NULL,
  action varchar(64) NOT NULL,
  idempotency_key varchar(255) NOT NULL UNIQUE,
  request_payload jsonb NOT NULL,
  response_payload jsonb,
  status varchar(32) NOT NULL DEFAULT 'PENDING',
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  last_error_code varchar(128),
  last_error_message varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_shipment_provider_requests_dispatch
  ON shipment_provider_requests(status, next_retry_at, created_at);
```

## 14. Danh Sách File/Khu Vực Code Dự Kiến Sửa

### Buyer web

```text
frontend/apps/buyer-web/src/providers/AppProvider.tsx
frontend/apps/buyer-web/src/app/products/[productId]/page.tsx
frontend/apps/buyer-web/src/app/checkout/page.tsx
frontend/apps/buyer-web/src/lib/api/types.ts
frontend/apps/buyer-web/src/app/api/buyer/orders/route.ts (nếu cần validation/proxy normalization)
```

### Order-service

```text
services/order-service/migrations/0001_init_order_service.sql
services/order-service/internal/domain/domain.go
services/order-service/internal/repository/order_repository.go
services/order-service/internal/service/order_service.go
services/order-service/internal/service/order_saga_service.go
services/order-service/internal/service/product_catalog_client.go
services/order-service/internal/*/*_test.go
```

### Shipping-service

```text
services/shipping-service/migrations/0001_init_shipping_service.sql
services/shipping-service/internal/config/config.go
services/shipping-service/cmd/server/main.go
services/shipping-service/internal/events/consumer.go
services/shipping-service/internal/domain/domain.go
services/shipping-service/internal/repository/shipping_repository.go
services/shipping-service/internal/service/shipping_service.go
services/shipping-service/internal/handler/shipping_handler.go
services/shipping-service/internal/nexus/*
services/shipping-service/internal/*/*_test.go
```

### Deploy/config

```text
docker-compose.yml
infrastructure/kubernetes/*/shipping-service*
docs/deployment/* (nếu có runbook cấu hình production)
```

## 15. Test Plan

### 15.1 Unit test

Buyer web:

- Cart lưu/đọc được `sellerId`.
- Checkout chặn cart nhiều seller.
- Checkout gửi receiver/payment fields.

Order-service:

- Reject request thiếu/không hợp lệ `sellerId`.
- Reject request thiếu recipient fields.
- Reject order chứa sản phẩm khác seller.
- COD được xác nhận theo rule saga mới.
- ONLINE chỉ confirmed sau payment captured.
- Event `order.status-updated(CONFIRMED)` có đủ payload shipping.

Shipping-service:

- Mapping seller -> merchant/sender.
- HMAC create order ký đúng byte body và path.
- HMAC GET health ký empty body đúng.
- Build payload COD và ONLINE đúng.
- `autoCreatePickup=false` được gửi trong production controlled test.
- Consumer không tạo shipment từ order `PENDING`.
- Consumer tạo shipment/request từ order `CONFIRMED`.
- Worker lưu AWB/status khi Nexus trả thành công.
- Worker xử lý 429/5xx retry.
- Worker block `MERCHANT_NOT_FOUND`.
- Verify webhook HMAC.
- Handle `webhook.ping`.
- Status mapping và idempotency webhook.

### 15.2 Integration test local với mock Nexus

Các case bắt buộc:

```text
1. Order CONFIRMED -> shipment PENDING -> provider request PENDING.
2. Nexus 201 CREATED -> shipment AWB_CREATED + metadata đầy đủ.
3. Nexus request timeout -> provider request `FAILED` có `next_retry_at` và không tạo shipment trùng.
4. Nexus 404 MERCHANT_NOT_FOUND -> `FAILED` không tự retry.
5. Duplicate consumer event -> chỉ có một shipment và một create request.
6. Webhook PICKUP_COMPLETED -> PICKED_UP.
7. Webhook DELIVERED -> DELIVERED.
8. Duplicate webhook eventId -> không tạo tracking history trùng.
```

### 15.3 Kiểm thử production có kiểm soát

Trình tự:

1. Deploy code với `NEXUS_ENABLED=false` và `NEXUS_WEBHOOK_ENABLED=false`.
2. Cấu hình secrets/mapping shop test nhưng vẫn giữ outbound tắt.
3. Từ môi trường chạy thực tế, gọi Nexus health bằng client HMAC.
4. Bật `NEXUS_WEBHOOK_ENABLED=true`, vẫn giữ `NEXUS_ENABLED=false`.
5. Nexus đăng ký public webhook URL và gửi `webhook.ping`; hệ thống trả `2xx`.
6. Chỉ để shop test trong mapping active, sau đó bật `NEXUS_ENABLED=true`.
7. Tạo một order test với `autoCreatePickup=false`.
8. Kiểm tra Nexus trả `shipmentCode`.
9. Kiểm tra shipment nội bộ có AWB/tracking/status `AWB_CREATED`.
10. Nhờ Nexus gửi webhook trạng thái test hoặc thực hiện cancel nếu cần.
11. Xác nhận không phát sinh pickup thực tế.

Lệnh health check chạy tại `services/shipping-service` trong môi trường đã inject credential bảo mật:

```bash
NEXUS_BASE_URL=https://ops.nexus-ex.site \
NEXUS_PARTNER_CODE="$PROD_NEXUS_PARTNER_CODE" \
NEXUS_API_KEY="$PROD_NEXUS_API_KEY" \
NEXUS_API_SECRET="$PROD_NEXUS_API_SECRET" \
NEXUS_REQUEST_TIMEOUT_MS=10000 \
go run ./cmd/nexus-healthcheck
```

## 16. Checklist Trước Khi Bật Gọi Nexus Production Thật

Không bật `NEXUS_ENABLED=true` cho đến khi tất cả mục dưới đây hoàn tất:

```text
[ ] Nexus xác nhận production /merchant/integrations/* đã enable.
[ ] Health check HMAC từ môi trường production của bên mình thành công.
[ ] Đã inject PROD_NEXUS_PARTNER_CODE qua secret/config runtime.
[ ] Đã inject PROD_NEXUS_API_KEY qua secret manager.
[ ] Đã inject PROD_NEXUS_API_SECRET qua secret manager.
[ ] Đã inject PROD_NEXUS_WEBHOOK_SECRET qua secret manager.
[ ] Có mapping sellerId -> merchantId -> senderHubCode cho shop test.
[ ] Có sender profile đầy đủ của shop test.
[ ] Có public webhook URL và Nexus đã đăng ký.
[ ] Đã bật `NEXUS_WEBHOOK_ENABLED=true` trong khi `NEXUS_ENABLED=false` để test ping an toàn.
[ ] Webhook ping đã verify thành công.
[ ] Outbound IP đã whitelist nếu Nexus yêu cầu.
[ ] File mapping active chỉ chứa seller/shop được phép test trong đợt đầu.
[ ] autoCreatePickup=false được cấu hình cho đơn test đầu tiên.
[ ] Có người phụ trách phía Nexus để xác nhận không điều phối pickup/giao thật.
```

## 17. Nội Dung Cần Gửi Cho Nexus Để Bắt Đầu Test Production

Sau khi code đã deploy và có URL/IP thật, gửi Nexus mẫu sau:

```text
Chào team Nexus,

Bên mình đã triển khai integration Nexus Express và chuẩn bị chạy kiểm thử production có kiểm soát.

1. Public webhook URL cần đăng ký:
POST https://<PUBLIC_DOMAIN_CUA_TEAM>/api/v1/shipments/webhooks/nexus

2. Outbound IP gọi Nexus production:
environment,ip,description
production,<PRIMARY_OUTBOUND_IP>,Production outbound server
production,<BACKUP_OUTBOUND_IP_IF_ANY>,Backup outbound server

3. Seller/shop dùng để test:
sellerId/shopId=<SELLER_UUID_DA_MAPPING>
merchantId=<MERCHANT_ID_NEXUS_DA_CAP>
senderHubCode=<HUB_CODE_NEXUS_DA_CAP>

4. Phương án test an toàn:
Bên mình sẽ gửi request tạo vận đơn đầu tiên với:
{
  "options": {
    "autoCreatePickup": false,
    "printLabelFormat": "A6"
  }
}

Nhờ Nexus xác nhận request này không phát sinh pickup/giao hàng thực tế.

5. Nhờ Nexus thực hiện trước khi test:
- Xác nhận endpoint production /merchant/integrations/* đã enable.
- Xác nhận credential production đã cấp qua kênh bảo mật.
- Whitelist outbound IP nếu cần.
- Đăng ký webhook URL trên; bên mình sẽ bật nhận webhook trước nhưng chưa bật gửi đơn.
- Gửi webhook.ping sau khi đăng ký để bên mình verify.

6. Sau khi health check và webhook ping thành công, bên mình sẽ gửi một đơn test production có kiểm soát và gửi lại requestId/shipmentCode để hai bên đối soát.
```

### Dữ liệu Nexus vẫn phải cấp qua kênh bảo mật

Không gửi các giá trị này trong chat/email public hoặc commit vào repository:

```text
PROD_NEXUS_PARTNER_CODE
PROD_NEXUS_API_KEY
PROD_NEXUS_API_SECRET
PROD_NEXUS_WEBHOOK_SECRET
Mapping seller/shop production dùng để test
```

## 18. Thứ Tự Triển Khai Code Đề Xuất

1. Bổ sung `sellerId`, receiver và payment method vào buyer cart/checkout.
2. Mở rộng `order-service` schema/domain/API/event và kiểm tra seller authoritative.
3. Điều chỉnh checkout saga cho COD/ONLINE và dùng `CONFIRMED` làm trigger giao hàng.
4. Thêm merchant mapping/config production vào `shipping-service`.
5. Thêm package Nexus HMAC client và unit tests.
6. Thêm `shipment_provider_requests` và worker gọi Nexus bền vững.
7. Sửa Kafka consumer để tạo shipment từ `order.status-updated(CONFIRMED)`.
8. Cập nhật AWB/tracking/metadata/status khi create Nexus thành công.
9. Thêm Nexus webhook verify/idempotency/status mapping/ping.
10. Chạy test service-scoped và mock integration local.
11. Deploy với integration tắt.
12. Hoàn tất checklist production và gửi thông tin ở mục 17 cho Nexus.
13. Chạy health + webhook ping.
14. Bật integration cho shop test và gửi đơn `autoCreatePickup=false`.
15. Sau khi nghiệm thu, lên kế hoạch bật pickup thật và implement cancel/tracking/label nếu chưa hoàn tất.

## 19. Rủi Ro Và Biện Pháp Kiểm Soát

| Rủi ro | Biện pháp |
| --- | --- |
| Tạo vận đơn cho order chưa thanh toán/chưa giữ hàng | Trigger chỉ từ order `CONFIRMED` |
| Product seller bị giả mạo từ frontend | Order-service xác minh seller qua product catalog |
| Gọi Nexus thành công nhưng service crash trước khi lưu kết quả | Idempotency key cố định + durable provider request retry |
| Test production phát sinh pickup thật | `autoCreatePickup=false` + xác nhận Nexus trước test |
| Webhook bị gửi lặp | Dùng `eventId` làm idempotency key |
| Webhook giả mạo | Verify HMAC, timestamp, partner code |
| Bật test ảnh hưởng seller chưa duyệt | Outbound chỉ chạy với seller có trong mapping active |
| Seller đã khai báo nhưng Nexus chưa mapping | Nexus trả lỗi, provider request dừng retry và báo vận hành kiểm tra |
| URL label hết hạn | Gọi label endpoint qua backend để lấy URL mới |
| Secret lộ trong repo/log | Dùng secret manager, redact log, không lưu header auth |
