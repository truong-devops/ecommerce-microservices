# Business Logic Audit (Actionable)

Last updated: 2026-05-14  
Scope: business logic issues across core e-commerce flows (`cart -> order -> payment -> inventory -> shipping`)

## Usage

- `Status`:
  - `TODO`: chưa xử lý
  - `IN_PROGRESS`: đang xử lý
  - `DONE`: đã xử lý xong
  - `BLOCKED`: bị chặn do dependency
- Khi fix xong mỗi mục:
  - cập nhật `Status`
  - thêm `Fix Note`
  - thêm `Verification`

---

## 1) CRITICAL - Order trust giá từ client

- Status: `DONE`
- Vấn đề:
  - `order-service` tính tiền trực tiếp từ `item.UnitPrice` trong request.
  - Không đối soát giá authoritative từ `product-service`.
- Ảnh hưởng:
  - Có thể bị sửa giá ở phía client trước khi đặt hàng.
- Tham chiếu:
  - [services/order-service/internal/service/order_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/order-service/internal/service/order_service.go:116)
  - [services/order-service/internal/service/order_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/order-service/internal/service/order_service.go:129)
- Fix Note:
  - Added `ProductCatalogClient` in `order-service` and enforced authoritative pricing by `productId + sku`.
  - `CreateOrder` now rejects request when `unitPrice` mismatches product catalog or SKU/currency is invalid.
- Verification:
  - `go test ./...` passed in `services/order-service`.

---

## 2) CRITICAL - Payment intent trust amount/currency/order từ client

- Status: `DONE`
- Vấn đề:
  - `payment-service` tạo intent từ `req.Amount`, `req.Currency`, `req.OrderID`.
  - Chưa verify với `order-service` (owner, status, payable amount).
- Ảnh hưởng:
  - Có thể thanh toán sai số tiền/sai đơn.
- Tham chiếu:
  - [services/payment-service/internal/service/payment_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/payment-service/internal/service/payment_service.go:157)
  - [services/payment-service/internal/service/payment_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/payment-service/internal/service/payment_service.go:197)
- Fix Note:
  - Added `OrderClient` in `payment-service` to fetch and verify order snapshot before intent creation.
  - `CreatePaymentIntent` now validates ownership, payable order status, amount and currency against order source of truth.
- Verification:
  - `go test ./...` passed in `services/payment-service`.

---

## 3) CRITICAL - Conflict luồng auto-create payment vs create intent

- Status: `DONE`
- Vấn đề:
  - Consumer `order.created` tự tạo payment pending.
  - API create intent lại conflict nếu payment đã tồn tại cho order.
- Ảnh hưởng:
  - Checkout có thể kẹt, không tạo được payment intent gateway mới.
- Tham chiếu:
  - [services/payment-service/internal/service/order_events_consumer.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/payment-service/internal/service/order_events_consumer.go:96)
  - [services/payment-service/internal/service/payment_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/payment-service/internal/service/payment_service.go:176)
  - [services/payment-service/internal/service/payment_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/payment-service/internal/service/payment_service.go:718)
- Fix Note:
  - Updated payment intent flow to attach gateway intent into existing auto-created `PENDING` payment instead of conflicting.
  - Added safeguards: only auto-created pending records without provider payment id are attachable.
- Verification:
  - Added unit test coverage for attachability logic in `payment-service/internal/service/order_client_test.go`.
  - `go test ./...` passed in `services/payment-service`.

---

## 4) HIGH - Event contract mismatch giữa order và inventory

- Status: `TODO`
- Vấn đề:
  - Inventory consumer xử lý `order.cancelled` nhưng yêu cầu có `payload.items`.
  - Order event hiện không publish `items`.
- Ảnh hưởng:
  - Flow release reservation có thể bị skip.
- Tham chiếu:
  - [services/order-service/internal/service/order_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/order-service/internal/service/order_service.go:531)
  - [services/inventory-service/internal/events/consumer.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/inventory-service/internal/events/consumer.go:74)
  - [services/inventory-service/internal/events/consumer.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/inventory-service/internal/events/consumer.go:84)
- Fix Note:
  - N/A
- Verification:
  - N/A

---

## 5) HIGH - Shipping auto-create dùng dữ liệu placeholder

- Status: `TODO`
- Vấn đề:
  - Auto-create shipment dùng `Pending recipient info`, `N/A`, `Pending address`.
  - Thiếu `sellerId` thì fallback `systemActorID`.
  - `shippingFee` đọc từ event payload, nhưng payload order chưa gửi field tương ứng.
- Ảnh hưởng:
  - Dữ liệu shipment không đủ chuẩn nghiệp vụ, dễ sai downstream.
- Tham chiếu:
  - [services/shipping-service/internal/service/shipping_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/shipping-service/internal/service/shipping_service.go:688)
  - [services/shipping-service/internal/service/shipping_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/shipping-service/internal/service/shipping_service.go:694)
  - [services/shipping-service/internal/service/shipping_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/shipping-service/internal/service/shipping_service.go:728)
- Fix Note:
  - N/A
- Verification:
  - N/A

---

## 6) HIGH - Seller có thể đọc shipment không thuộc mình

- Status: `TODO`
- Vấn đề:
  - `ensureCanRead` chỉ check ownership cho `CUSTOMER`.
  - Không ép filter `sellerId = current seller` trong list.
- Ảnh hưởng:
  - Rò rỉ dữ liệu shipment giữa các seller.
- Tham chiếu:
  - [services/shipping-service/internal/service/shipping_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/shipping-service/internal/service/shipping_service.go:221)
  - [services/shipping-service/internal/service/shipping_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/shipping-service/internal/service/shipping_service.go:906)
- Fix Note:
  - N/A
- Verification:
  - N/A

---

## 7) HIGH - Shipping webhook public chưa verify signature

- Status: `TODO`
- Vấn đề:
  - Endpoint webhook public.
  - Chưa có signature field/verification logic như payment webhook.
- Ảnh hưởng:
  - Có thể bị fake callback cập nhật sai trạng thái shipment.
- Tham chiếu:
  - [services/shipping-service/internal/router/router.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/shipping-service/internal/router/router.go:39)
  - [services/shipping-service/internal/service/shipping_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/shipping-service/internal/service/shipping_service.go:866)
- Fix Note:
  - N/A
- Verification:
  - N/A

---

## 8) HIGH - Cart cho phép client điều khiển unitPrice

- Status: `TODO`
- Vấn đề:
  - Add/Merge item set lại `UnitPrice` từ request.
  - External validation chưa verify giá chuẩn từ product source of truth.
- Ảnh hưởng:
  - Tổng tiền cart bị sai, có thể kéo theo sai order amount.
- Tham chiếu:
  - [services/cart-service/internal/service/cart_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/cart-service/internal/service/cart_service.go:112)
  - [services/cart-service/internal/service/cart_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/cart-service/internal/service/cart_service.go:135)
  - [services/cart-service/internal/service/cart_validation_client.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/cart-service/internal/service/cart_validation_client.go:47)
- Fix Note:
  - N/A
- Verification:
  - N/A

---

## 9) MEDIUM - Create shipment thủ công chưa verify order tồn tại

- Status: `TODO`
- Vấn đề:
  - `CreateShipment` chủ yếu check format + unique nội bộ.
  - Chưa check với order-service xem order có thật và đang ở trạng thái phù hợp.
- Ảnh hưởng:
  - Có thể tạo shipment mồ côi.
- Tham chiếu:
  - [services/shipping-service/internal/service/shipping_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/shipping-service/internal/service/shipping_service.go:139)
  - [services/shipping-service/internal/service/shipping_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/shipping-service/internal/service/shipping_service.go:153)
- Fix Note:
  - N/A
- Verification:
  - N/A

---

## 10) MEDIUM - Payment webhook chưa check currency mismatch

- Status: `TODO`
- Vấn đề:
  - Có check amount mismatch.
  - Chưa thấy reject khi `webhook currency` khác `payment.Currency`.
- Ảnh hưởng:
  - Dễ nhận callback sai currency trong tình huống bất thường.
- Tham chiếu:
  - [services/payment-service/internal/service/payment_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/payment-service/internal/service/payment_service.go:599)
  - [services/payment-service/internal/service/payment_service.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/payment-service/internal/service/payment_service.go:644)
- Fix Note:
  - N/A
- Verification:
  - N/A

---

## Tracking Table

| ID | Severity | Area | Title | Owner | Status | Updated At | Notes |
|---|---|---|---|---|---|---|---|
| 1 | CRITICAL | Order | Order trust giá từ client | You | DONE | 2026-05-14 | Enforced authoritative SKU pricing from product-service |
| 2 | CRITICAL | Payment | Intent trust amount/currency/order | You | DONE | 2026-05-14 | Validated against order snapshot before gateway call |
| 3 | CRITICAL | Payment | Auto-create payment conflict create intent | You | DONE | 2026-05-14 | Attach intent to auto-created pending payment |
| 4 | HIGH | Order/Inventory | Event contract mismatch | You | TODO | 2026-05-14 | |
| 5 | HIGH | Shipping | Auto-create placeholder data | You | TODO | 2026-05-14 | |
| 6 | HIGH | Shipping | Seller đọc shipment không thuộc mình | You | TODO | 2026-05-14 | |
| 7 | HIGH | Shipping | Webhook không verify signature | You | TODO | 2026-05-14 | |
| 8 | HIGH | Cart | Client điều khiển unitPrice | You | TODO | 2026-05-14 | |
| 9 | MEDIUM | Shipping | Create shipment chưa verify order | You | TODO | 2026-05-14 | |
| 10 | MEDIUM | Payment | Webhook chưa check currency mismatch | You | TODO | 2026-05-14 | |
