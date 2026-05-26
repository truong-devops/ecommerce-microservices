# Thong Tin Can Nexus Express Cung Cap De Tich Hop Tao Van Don

Tai lieu nay tong hop cac thong tin con can Nexus Express cung cap/xac nhan de ecommerce platform co the tich hop API tao van don, huy van don, tracking va webhook trang thai.

## 1. Credential Va Moi Truong

Vui long cung cap credential sandbox de bat dau tich hop:

```text
SANDBOX_NEXUS_BASE_URL=
SANDBOX_NEXUS_PARTNER_CODE=
SANDBOX_NEXUS_API_KEY=
SANDBOX_NEXUS_API_SECRET=
```

Sau khi test sandbox thanh cong, vui long cung cap credential production qua kenh bao mat:

```text
PROD_NEXUS_BASE_URL=
PROD_NEXUS_PARTNER_CODE=
PROD_NEXUS_API_KEY=
PROD_NEXUS_API_SECRET=
```

Vui long xac nhan them:

```text
Can whitelist IP sandbox khong?
Can whitelist IP production khong?
Neu co, Nexus can format danh sach IP nhu the nao?
```

## 2. Mapping Seller/Shop Sang Merchant Nexus

Ben minh du kien dung `sellerId` UUID hien tai lam `external.shopId`. Vui long xac nhan va cung cap mapping theo format:

```csv
partner_code,shop_id,shop_name,merchant_id,sender_hub_code,active
<partner_code>,<seller_uuid>,<shop_name>,<nexus_merchant_id>,<hub_code>,true
```

Can xac nhan:

```text
1. Mot sellerId UUID ben minh co map voi mot merchantId Nexus rieng khong?
2. Neu seller chua co mapping thi Nexus tra 404 MERCHANT_NOT_FOUND dung khong?
3. Quy trinh onboard seller moi la gi?
4. Co API tra cuu mapping shopId -> merchantId trong phase dau khong?
```

## 3. Sender/Pickup Profile

Ben minh can biet Nexus yeu cau toi thieu nhung field nao cho nguoi gui trong sandbox va production.

Vui long xac nhan field bat buoc:

```text
sender.name
sender.phone
sender.address
sender.ward
sender.district
sender.province
sender.hubCode
```

Can xac nhan them:

```text
1. ward/district/province gui text tieng Viet co dau duoc khong?
2. Co can ma hanh chinh provinceCode/districtCode/wardCode khong?
3. hubCode co bat buoc neu da co mapping shop -> hub khong?
4. Neu shop co nhieu kho lay hang, Nexus muon nhan field nao de phan biet warehouse?
```

## 4. Parcel Defaults Va Gioi Han

Hien tai platform co the chua co day du can nang/kich thuoc that cho tung san pham. Vui long xac nhan cac gia tri default duoc chap nhan:

```text
weightGram=500
lengthCm=20
widthCm=15
heightCm=10
serviceType=STANDARD
pickupType=PICKUP
payment.payer=RECEIVER
```

Can xac nhan gioi han production:

```text
Max item/order=
Max weightGram=
Max lengthCm=
Max widthCm=
Max heightCm=
Max length+width+height=
Max codAmount=
Max declaredValue=
```

## 5. Payment/COD Rule

Vui long xac nhan cach tinh `codAmount`:

```text
1. Don da thanh toan online: codAmount = 0 dung khong?
2. Don COD nguoi nhan tra ca tien hang va phi ship: codAmount = totalAmount dung khong?
3. Neu shippingFee do shop/san tra: codAmount = totalAmount - shippingFee dung khong?
4. Nexus co chap nhan field codIncludesShippingFee khong?
```

## 6. Create Order Response Mapping

Ben minh du kien luu response Nexus nhu sau:

```text
data.shipmentCode -> awb va trackingNumber
data.status=CREATED -> AWB_CREATED
data.trackingUrl -> shipment.metadata.nexus.trackingUrl
data.pickup.pickupCode -> shipment.metadata.nexus.pickupCode
data.label.url -> shipment.metadata.nexus.labelUrl
```

Vui long xac nhan:

```text
1. shipmentCode co phai ma van don chinh de tracking khong?
2. trackingUrl co het han khong?
3. label.url production co TTL bao lau?
4. Neu label het han, endpoint lay label moi chinh thuc la gi?
```

## 7. Webhook Status

Ben minh se cung cap endpoint webhook de Nexus gui cap nhat trang thai. Vui long xac nhan contract chinh thuc:

```text
HTTP method:
Webhook path:
Headers bat buoc:
Signature algorithm:
Retry schedule:
Timeout:
```

Vui long cung cap payload mau cho cac event:

```text
shipment.status_changed
shipment.delivered
shipment.cancelled
shipment.returned
shipment.delivery_failed
```

Can xac nhan mapping status Nexus -> partner status:

```text
CREATED -> AWB_CREATED
UPDATED -> PENDING
TASK_ASSIGNED -> PENDING hay OUT_FOR_DELIVERY?
PICKUP_COMPLETED -> PICKED_UP
MANIFEST_SEALED -> IN_TRANSIT
SEND_GOODS -> IN_TRANSIT
IN_TRANSIT -> IN_TRANSIT
MANIFEST_RECEIVED -> IN_TRANSIT
MANIFEST_UNSEALED -> IN_TRANSIT
SCAN_INBOUND -> IN_TRANSIT
SCAN_OUTBOUND -> IN_TRANSIT
INVENTORY_CHECK -> IN_TRANSIT
DELIVERED -> DELIVERED
DELIVERY_FAILED -> FAILED
NDR_CREATED -> FAILED
EXCEPTION -> FAILED
RETURN_STARTED -> RETURNED
RETURN_COMPLETED -> RETURNED
CANCELLED -> CANCELLED
```

## 8. Cancel, Tracking Va Label API

Vui long xac nhan endpoint production chinh thuc:

```http
POST /merchant/integrations/orders/{platform}/{shopId}/{externalOrderId}/cancel
GET /merchant/integrations/orders/{platform}/{shopId}/{externalOrderId}
GET /merchant/integrations/shipments/{shipmentCode}/tracking
GET /merchant/integrations/shipments/{shipmentCode}/label?format=A6
GET /merchant/integrations/shipments/{shipmentCode}/label.pdf?format=A6
```

Can xac nhan:

```text
1. Trang thai nao con duoc phep cancel?
2. Neu cancel bi tu choi thi error code co phai CANNOT_CANCEL khong?
3. Tracking API co can HMAC signature giong create order khong?
4. Label API tra JSON URL hay PDF binary la mac dinh?
```

## 9. Retry, Timeout Va Rate Limit

Vui long xac nhan production values:

```text
Request timeout khuyen nghi:
Retry backoff khuyen nghi:
Rate limit per shop:
Rate limit per partner:
Retry-After header khi 429 co luon duoc tra khong?
Idempotency key duoc luu bao lau?
```

Ben minh se retry create order khi:

```text
Timeout
HTTP 408
HTTP 429
HTTP 500/502/503/504
```

Ben minh se khong retry tu dong khi:

```text
HTTP 400
HTTP 401
HTTP 403
HTTP 404 MERCHANT_NOT_FOUND
HTTP 409 DUPLICATE_ORDER
```

## 10. Thong Tin Can Uu Tien Cung Cap Truoc

De bat dau code va test sandbox, vui long uu tien cung cap:

```text
1. Sandbox base URL, partner code, API key, API secret.
2. File mapping sellerId UUID -> Nexus merchantId/hubCode.
3. Xac nhan sender field nao bat buoc trong sandbox.
4. Xac nhan default parcel 500g, 20x15x10cm duoc chap nhan.
5. Payload webhook status chinh thuc va cach ky webhook.
```
