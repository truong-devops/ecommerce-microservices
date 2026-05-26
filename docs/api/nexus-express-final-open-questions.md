# Nexus Express - Cau Hoi Cuoi Can Chot Truoc Khi Implement

Tai lieu nay gom cac thong tin con thieu sau khi da nhan phan hoi tu Nexus Express. Muc tieu la chot nhanh cac gia tri thuc te de bat dau code va test sandbox.

## 1. Credential Sandbox Thuc Te

Vui long cap qua kenh bao mat rieng:

```text
SANDBOX_NEXUS_BASE_URL=https://uat-api.nexus-ex.site
SANDBOX_NEXUS_PARTNER_CODE=
SANDBOX_NEXUS_API_KEY=
SANDBOX_NEXUS_API_SECRET=
```

Neu UAT domain chua san sang, vui long cung cap base URL test tam thoi:

```text
TEMP_SANDBOX_NEXUS_BASE_URL=
```

## 2. Mapping Seller Sang Nexus Merchant

Ben minh se dung `sellerId` UUID lam `external.shopId`. Vui long cung cap file mapping sandbox theo format:

```csv
partner_code,shop_id,shop_name,merchant_id,sender_hub_code,active
<partner_code>,<seller_uuid>,<shop_name>,<nexus_merchant_id>,<hub_code>,true
```

Toi thieu can co 1-3 seller test de tao don sandbox.

Can xac nhan:

```text
1. merchant_id sandbox co khac production khong?
2. sender_hub_code co bat buoc trong sandbox khong?
3. Neu sender_hub_code bo trong, Nexus co auto route theo sender address khong?
```

## 3. Sender/Pickup Profile Test

Vui long cung cap hoac xac nhan thong tin pickup profile sandbox cho cac seller test:

```text
sellerId/shopId=
shopName=
sender.name=
sender.phone=
sender.address=
sender.ward=
sender.district=
sender.province=
sender.hubCode=
```

Can xac nhan:

```text
1. Sandbox co chap nhan chi gui sender.name, sender.phone, sender.address, sender.province khong?
2. Production se bat buoc ward/district/province tu ngay go-live hay co phase chuyen tiep?
```

## 4. COD Va Payment Rule

Ben minh can chot quy tac COD de map `payment.codAmount`:

```text
1. Don online da thanh toan: codAmount = 0.
2. Don COD: codAmount = ?
```

Vui long chon mot quy tac mac dinh cho don COD:

```text
Option A: codAmount = totalAmount, nguoi nhan tra ca tien hang va phi ship.
Option B: codAmount = totalAmount - shippingFee, shop/san tra phi ship cho Nexus.
```

Neu Nexus khuyen nghi them field:

```json
{
  "payment": {
    "codIncludesShippingFee": true
  }
}
```

vui long xac nhan field nay duoc chap nhan trong sandbox va production.

## 5. Webhook URL Va Dang Ky Webhook

Ben minh du kien expose webhook:

```http
POST /api/v1/shipments/webhooks/nexus
```

Can Nexus xac nhan:

```text
1. Nexus can full public URL truoc khi test sandbox khong?
2. Co can dang ky webhook URL qua portal/admin hay gui cho Nexus cau hinh thu cong?
3. Webhook sandbox va production co dung cung API secret voi request API khong?
4. Nexus co gui webhook test/ping de verify endpoint khong?
```

Thong tin ben minh se cung cap khi co environment public:

```text
SANDBOX_WEBHOOK_URL=
PROD_WEBHOOK_URL=
```

## 6. Idempotency Va External Order Code

Ben minh du kien:

```text
external.platform = NEXUS_PARTNER_CODE
external.shopId = sellerId UUID
external.externalOrderId = order.id UUID
external.externalOrderCode = order.orderNumber/orderCode
Idempotency-Key = <partner_code>:<sellerId>:<order.id>
```

Vui long xac nhan mapping tren dung voi Nexus.

## 7. Create Order Sandbox Test Case

Vui long cung cap mot bo test data sandbox hop le:

```text
partner_code=
shop_id=
merchant_id=
sender_hub_code=
sender.name=
sender.phone=
sender.address=
sender.ward=
sender.district=
sender.province=
receiver.name=
receiver.phone=
receiver.address=
receiver.ward=
receiver.district=
receiver.province=
serviceType=STANDARD
pickupType=PICKUP
payment.payer=RECEIVER
```

De ben minh dung tao request test dau tien toi:

```http
POST /merchant/integrations/orders
```

## 8. Production Go-Live Sau Sandbox

Sau khi sandbox pass, vui long cung cap qua kenh bao mat:

```text
PROD_NEXUS_BASE_URL=https://ops.nexus-ex.site
PROD_NEXUS_PARTNER_CODE=
PROD_NEXUS_API_KEY=
PROD_NEXUS_API_SECRET=
```

Can Nexus xac nhan quy trinh whitelist production:

```text
1. Ben minh gui outbound IP production truoc go-live bao lau?
2. Sau khi whitelist, Nexus co endpoint health/check credential khong?
3. Production mapping seller/merchant co cung format voi sandbox khong?
```

## 9. Viec Ben Minh Se Bat Dau Code Sau Khi Nhan Du Thong Tin

Sau khi co credential sandbox va mapping seller test, ben minh se implement:

```text
1. Nexus HMAC client trong shipping-service.
2. Create order integration POST /merchant/integrations/orders.
3. Luu shipmentCode vao awb/trackingNumber.
4. Luu trackingUrl, labelUrl, pickupCode vao shipment metadata.
5. Webhook receiver /api/v1/shipments/webhooks/nexus.
6. Status mapping Nexus -> internal shipment status.
7. Cancel/tracking/label API client neu can trong phase tiep theo.
```
