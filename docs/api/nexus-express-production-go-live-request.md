# Yêu Cầu Dữ Liệu Go-Live Production - dt-commerce -> Nexus Express

> Ngày gửi: 2026-05-26  
> Từ: dt-commerce - Đội ngũ Kỹ thuật  
> Đến: Nexus Express - Đội ngũ Kỹ thuật Tích hợp  
> Mục tiêu: Bật gửi vận đơn production thật, không thực hiện giai đoạn đơn test riêng

Chào team Nexus,

Bên mình đã deploy integration Nexus lên Kubernetes production. Hiện outbound đang tắt cho đến khi nhận đủ dữ liệu go-live để tránh tạo vận đơn sai seller hoặc sai cấu hình điều phối.

Thông tin public phía dt-commerce:

```text
Base URL Nexus dự kiến gọi: https://ops.nexus-ex.site
Outbound IP dt-commerce: 103.179.172.220
Webhook dt-commerce:
POST https://api.dt-commerce.site/api/v1/shipments/webhooks/nexus
Partner code đã được thông báo: DT_COMMERCE
```

Nhờ Nexus phản hồi một lần đầy đủ theo các mục dưới đây.

## 1. Credential Production

Gửi các giá trị sau qua kênh bảo mật riêng:

```text
PROD_NEXUS_PARTNER_CODE=DT_COMMERCE
PROD_NEXUS_API_KEY=<gia_tri_that>
PROD_NEXUS_API_SECRET=<gia_tri_that>
PROD_NEXUS_WEBHOOK_SECRET=<gia_tri_that>
```

Không gửi API secret hoặc webhook secret trong email/ticket/chat công khai.

## 2. Enable API Và Network Production

Nhờ xác nhận:

```text
Production base URL chính xác: https://ops.nexus-ex.site
IP 103.179.172.220: đã whitelist / không yêu cầu whitelist
GET  /merchant/integrations/health: đã enable
POST /merchant/integrations/orders: đã enable
```

Các endpoint vận hành đề nghị enable cùng đợt, dù dt-commerce có thể tích hợp UI ở phase tiếp theo:

```text
GET  /merchant/integrations/orders/{platform}/{shopId}/{externalOrderId}
POST /merchant/integrations/orders/{platform}/{shopId}/{externalOrderId}/cancel
GET  /merchant/integrations/shipments/{shipmentCode}/tracking
GET  /merchant/integrations/shipments/{shipmentCode}/label?format=A6
```

## 3. Mapping Toàn Bộ Shop Được Phép Gửi Nexus

Hệ thống dt-commerce chỉ gửi đơn sang Nexus cho seller có mapping được cấu hình active. Nhờ cấp mapping cho tất cả shop cần bật giao hàng ở đợt go-live đầu, không chỉ dữ liệu ví dụ.

Vui lòng gửi dưới dạng CSV hoặc JSON. Mỗi shop phải có:

```text
sellerId/shopId          UUID seller trên dt-commerce, dùng làm external.shopId
shopName                 Tên shop
merchantId               Merchant ID đã mapping tại Nexus
sender.name              Tên người/cửa hàng gửi
sender.phone             Số điện thoại lấy hàng
sender.address           Địa chỉ lấy hàng
sender.ward              Phường/xã
sender.district          Quận/huyện
sender.province          Tỉnh/thành phố
sender.hubCode           Hub code lấy hàng
active                   true/false
```

Format JSON dt-commerce sẽ cấu hình:

```json
[
  {
    "shopId": "<sellerId UUID>",
    "shopName": "<shop name>",
    "merchantId": "<Nexus merchant id>",
    "sender": {
      "name": "<sender name>",
      "phone": "<sender phone>",
      "address": "<sender address>",
      "ward": "<sender ward>",
      "district": "<sender district>",
      "province": "<sender province>",
      "hubCode": "<sender hub code>"
    },
    "active": true
  }
]
```

Nếu chỉ cấp một shop, production chỉ gửi vận đơn Nexus cho shop đó; order của seller chưa có mapping sẽ không được đẩy sang Nexus.

## 4. Cấu Hình Giao Hàng Thật Cần Chốt

Bên mình cần bật luồng giao hàng thực tế, nên nhờ Nexus xác nhận chính xác các giá trị request áp dụng cho production:

```text
options.autoCreatePickup = true hay false?
```

Quan trọng:

- Nếu muốn Nexus tự phát sinh tác vụ lấy hàng ngay sau khi dt-commerce tạo vận đơn, vui lòng xác nhận `autoCreatePickup=true`.
- Nếu phải để `false`, vui lòng nêu rõ quy trình/API hoặc thao tác vận hành nào sẽ tạo pickup thật sau đó.
- Integration hiện tại của dt-commerce đã có API tạo vận đơn và nhận webhook; chưa triển khai API riêng để kích hoạt pickup thủ công.

Nhờ xác nhận các default production:

```text
service.serviceType = STANDARD
service.pickupType = PICKUP
payment.payer = RECEIVER
COD order: codAmount = order.totalAmount
COD order: codIncludesShippingFee = true
ONLINE order: codAmount = 0
Default parcel khi sản phẩm chưa có cân nặng/kích thước:
  weightGram = 500
  lengthCm = 20
  widthCm = 15
  heightCm = 10
```

Nhờ xác nhận thêm định dạng địa chỉ người nhận:

```text
receiver.ward / receiver.district / receiver.province chấp nhận tên tiếng Việt,
hay bắt buộc mã địa giới/mã Nexus?
```

## 5. Webhook Production

Nhờ Nexus đăng ký:

```text
POST https://api.dt-commerce.site/api/v1/shipments/webhooks/nexus
```

Nhờ xác nhận production sẽ gửi các event:

```text
shipment.status_changed
shipment.delivered
shipment.cancelled
shipment.returned
shipment.delivery_failed
```

Bên mình đang xử lý webhook theo:

```text
HMAC-SHA256 hex lowercase
X-Nexus-Partner-Code = DT_COMMERCE
X-Nexus-Event-Id/eventId dùng chống xử lý trùng
Timestamp chấp nhận ISO-8601
```

Nhờ Nexus xác nhận contract chữ ký/header/payload production không thay đổi so với tài liệu đã cấp.

## 6. Mẫu Phản Hồi Đề Nghị

Nhờ phản hồi phần không bí mật theo mẫu sau; credential bí mật gửi riêng:

```text
Partner code production: DT_COMMERCE / <gia_tri_khac>
Credential production đã gửi qua kênh bảo mật: có/chưa

Base URL production: https://ops.nexus-ex.site / <gia_tri_khac>
Whitelist IP 103.179.172.220: đã xong / không cần / chưa xong
Endpoint health: đã enable/chưa
Endpoint create order: đã enable/chưa
Endpoint query/cancel/tracking/label: đã enable/chưa

Số shop được mapping để go-live: <so_luong>
File/danh sách mapping đính kèm: có/chưa

autoCreatePickup cho giao hàng thật: true/false
Nếu false, cách phát sinh pickup thật: <mo_ta>
Default service/pickup/payer/COD/parcel: xác nhận / thay đổi như sau: <mo_ta>
Định dạng receiver ward/district/province: tên text / mã / quy tắc khác

Webhook production đã đăng ký: có/chưa
Webhook contract/signature không thay đổi: xác nhận/chưa
```

Sau khi nhận đủ các mục trên, dt-commerce sẽ cấu hình credential và mapping runtime, bật webhook và outbound giao hàng production theo danh sách seller đã được Nexus mapping.

*dt-commerce - Integration Team*
