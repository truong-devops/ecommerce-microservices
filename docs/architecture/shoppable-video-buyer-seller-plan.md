# Shoppable Video Plan - Seller Upload + Buyer Watch

> **Note:** Paths referencing `product-service-nest` are **historical**. Shoppable video APIs are implemented in Go **`services/product-service/`** in the current stack.

Last updated: 2026-05-15  
Scope: `ecommerce-microservices`  
Feature priority: Shoppable Video trước Livestream Commerce và Recommendation FP-Growth.

## 1) Mục tiêu

Tính năng này không chỉ là MVP upload video. Mục tiêu là mô phỏng nghiệp vụ thương mại điện tử thực tế:

- Seller đăng video ngắn để bán hàng, gắn sản phẩm đang bán vào video.
- Buyer xem feed video, click sản phẩm trong video, đi tới chi tiết sản phẩm hoặc thêm vào giỏ hàng.
- Hệ thống ghi nhận view, click, add-to-cart để seller thấy hiệu quả video.
- Có trạng thái kiểm duyệt/publish/unpublish để giống nghiệp vụ thật.
- Kiến trúc vẫn đúng microservice: media lưu file, product-service quản lý domain video sản phẩm, analytics xử lý event, api-gateway định tuyến.

Không làm giảm chất lượng code vì mục tiêu chính là chia phase rõ, tránh làm lan man và tránh sửa sai nhiều lần.

## 2) Phạm vi hơn MVP nhưng chưa quá nặng

### Phải có trong bản demo tốt

| Nhóm | Chức năng | Lý do nghiệp vụ |
|---|---|---|
| Seller | Tạo draft video | Seller thường cần chuẩn bị nội dung trước khi public |
| Seller | Upload video + thumbnail | Video cần asset riêng, thumbnail giúp feed đẹp hơn |
| Seller | Gắn 1-n sản phẩm vào video | Đây là phần "shoppable" quan trọng nhất |
| Seller | Preview video trước publish | Giảm lỗi nội dung khi lên buyer feed |
| Seller | Submit review/unpublish | Seller gửi video cho moderator duyệt trước khi public và có thể tắt video đã public |
| Seller | Xem thống kê cơ bản | Chứng minh feature có giá trị kinh doanh |
| Buyer | Trang `/videos` | Có điểm vào rõ ràng để buyer xem video |
| Buyer | Home section `Video nổi bật` | Tăng khả năng discovery |
| Buyer | Product tag/rail trong video | Buyer click mua ngay trong ngữ cảnh video |
| Buyer | Ghi nhận view/click | Là input cho analytics và recommendation sau này |
| Moderator | Review queue cơ bản | Mô phỏng nền tảng marketplace thực tế |

### Chưa làm ở phase đầu

| Không làm ngay | Lý do |
|---|---|
| Transcoding HLS/DASH thật | Tốn nhiều hạ tầng, chưa cần cho demo local |
| Adaptive bitrate | Chỉ cần `mp4/webm` chạy ổn trong browser |
| AI moderation | Có thể để future work |
| Feed recommendation phức tạp | Sau này nối với FP-Growth/analytics |
| Video ads/boosting | Không cần cho luồng nghiệp vụ chính |
| Upload nhiều GB | Local dev chỉ cần giới hạn vừa phải |

## 3) Hiện trạng repo

| Khu vực | Hiện trạng | Ghi chú triển khai |
|---|---|---|
| `media-service` | Presign upload đang chỉ cho `image/*` | Cần mở rộng policy cho `video/mp4`, `video/webm` |
| `product-service` | **Go** + MongoDB (hiện tại); legacy Nest ở `product-service-nest` | Video module trong Go `services/product-service/` |
| `api-gateway` | Go gateway đang route các service | Cần expose route video + media upload đúng auth policy |
| `analytics-service` | Go service, có ingest analytics | Cần thêm event type video và KPI |
| `buyer-web` | Đã có skeleton nav/home section/video page | Cần thay data mock bằng API thật |
| `seller` | Đã có skeleton sidebar/page video | Cần nối upload/create/submit-review API thật |
| `moderator` | Có app riêng | Review queue để phase sau, không chặn buyer-seller flow |

## 4) Quy ước trạng thái theo dõi

Quy ước `Status`: `TODO` | `IN_PROGRESS` | `BLOCKED` | `DONE`

Quy ước `Evidence`:

- `File`: đã có file/code liên quan.
- `API`: gọi được endpoint.
- `Test`: có test/lint/build pass.
- `Demo`: chạy được luồng end-to-end.

Khi làm xong task nào, cập nhật bảng ở mục 17 và mục 18 ngay trong file này.

## 5) Role và quyền

| Role | Quyền trong feature |
|---|---|
| `SELLER` | Tạo/sửa/xóa mềm video của chính seller, gắn sản phẩm của chính seller, publish/unpublish |
| `CUSTOMER` | Xem video published, click product, ghi nhận view/click/add-to-cart |
| Anonymous buyer | Xem feed public và ghi nhận event bằng `anonymousSessionId` |
| `MODERATOR` | Xem review queue, approve/reject video |
| `ADMIN`/`SUPER_ADMIN` | Can thiệp nội dung, ẩn video vi phạm |

Quy tắc bắt buộc:

- Không nhận `sellerId` từ request body. Luôn lấy từ JWT/current user.
- Seller chỉ được gắn sản phẩm thuộc seller đó.
- Buyer chỉ được thấy video `published`.
- Video `hidden`, `rejected`, `archived`, `processing_failed` không được xuất hiện trong buyer feed.
- Nếu sản phẩm hết hàng/inactive/deleted thì vẫn có thể hiển thị video, nhưng CTA mua phải bị disable hoặc tag phải báo trạng thái.

## 6) Luồng nghiệp vụ chuẩn

### 6.1 Seller tạo và gửi duyệt video

1. Seller mở `seller/marketing/videos`.
2. Seller bấm `Tạo video bán hàng`.
3. Seller nhập `title`, `description`, chọn sản phẩm muốn gắn.
4. Seller tạo draft video trong `product-service`.
5. Frontend gọi `media-service` để lấy presigned upload URL với `entityType=video`, `entityId=<videoId>`.
6. Frontend upload file trực tiếp lên MinIO bằng presigned URL.
7. Frontend gọi `product-service` confirm media object key.
8. Seller chọn/gửi thumbnail.
9. Seller preview video và product tags.
10. Seller bấm `Gửi duyệt`.
11. `product-service` validate sản phẩm, status, media rồi chuyển trạng thái `review_pending`.
12. Moderator approve thì video mới chuyển `published` và xuất hiện ở buyer feed.
13. Khi published, service phát event để analytics/feed cập nhật.

### 6.2 Buyer xem và click mua

1. Buyer vào home thấy section `Video nổi bật`.
2. Buyer click `Xem tất cả` hoặc nav `Video`.
3. Buyer mở `/videos`, hệ thống gọi video feed.
4. Buyer xem video, frontend gửi `view_started`.
5. Nếu xem đủ 3 giây hoặc đạt ngưỡng 50% duration, frontend gửi `view_qualified`.
6. Buyer click product tag/rail, frontend gửi `product_clicked`.
7. Buyer vào product detail hoặc thêm giỏ hàng.
8. Nếu add-to-cart thành công, frontend gửi `add_to_cart` hoặc cart-service phát event có source video.

### 6.3 Moderator review

1. Seller submit video -> status `review_pending`.
2. Moderator mở review queue.
3. Moderator xem video, sản phẩm được tag, mô tả.
4. Moderator approve -> `published`.
5. Moderator reject -> `rejected` kèm `rejectionReason`.
6. Seller thấy lý do reject và có thể sửa để submit lại.

Rule hiện tại: tất cả video seller đăng đều phải qua moderator duyệt. Seller không được publish trực tiếp.

## 7) State machine video

| Status | Ý nghĩa | Ai thấy | Transition hợp lệ |
|---|---|---|---|
| `draft` | Seller đã tạo metadata, chưa hoàn tất asset | Seller | `processing`, `archived` |
| `processing` | Đã có media key, đang validate metadata/file | Seller | `review_pending`, `processing_failed` |
| `processing_failed` | File/metadata lỗi | Seller | `draft`, `archived` |
| `review_pending` | Chờ moderator duyệt | Seller, Moderator | `published`, `rejected` |
| `published` | Public cho buyer | Seller, Buyer, Moderator | `hidden`, `archived` |
| `hidden` | Seller/admin tạm ẩn | Seller, Moderator | `review_pending`, `archived` |
| `rejected` | Bị từ chối | Seller, Moderator | `draft`, `archived` |
| `archived` | Xóa mềm, không dùng nữa | Seller/Admin nội bộ | Không restore ở phase đầu |

Rule publish:

- Phải có `title`.
- Phải có `mediaObjectKey`.
- `mimeType` phải thuộc allowlist.
- `durationSec` trong giới hạn.
- Phải gắn ít nhất 1 product.
- Tất cả product phải tồn tại, thuộc seller, chưa deleted.
- Nếu product không active thì không cho publish hoặc cho publish nhưng tag bị disable. Phase đầu nên không cho publish để đơn giản.
- Seller chỉ được `submit-review`; `MODERATOR`/`ADMIN` approve mới publish.

## 8) Service ownership

| Service/App | Ownership | Không nên làm |
|---|---|---|
| `media-service` | Presign upload/download, validate mime/extension/size policy, object key prefix | Không lưu logic publish, không biết product nào được tag |
| `product-service` | Video metadata, product tags, status lifecycle, buyer feed, seller management API | Không stream binary video, không lưu file video trong Mongo |
| `analytics-service` | Nhận event view/click/add-to-cart, tính KPI video | Không quyết định video có published không |
| `api-gateway` | Route, auth forwarding, public/private route policy | Không chứa business logic video |
| `buyer-web` | Feed UI, player, event tracking client-side | Không tự tạo fake analytics khi API đã có |
| `seller` | Upload wizard, quản lý video, analytics seller | Không gửi `sellerId` tự nhập lên backend |
| `moderator` | Review queue và approve/reject | Không sửa metadata seller nếu không cần |

## 9) Data flow kỹ thuật

### 9.1 Seller upload

```txt
seller UI
  -> api-gateway
  -> product-service: POST /api/v1/videos
  <- videoId
  -> api-gateway
  -> media-service: POST /api/v1/media/uploads/presign
  <- uploadUrl, objectKey
  -> MinIO: PUT uploadUrl
  -> api-gateway
  -> product-service: POST /api/v1/videos/:videoId/media/confirm
  -> product-service: POST /api/v1/videos/:videoId/submit-review or /publish
  -> Kafka/outbox: video.published
```

### 9.2 Buyer watch

```txt
buyer-web /videos
  -> api-gateway
  -> product-service: GET /api/v1/videos/feed
  <- published videos + product snapshots
  -> browser plays videoUrl
  -> api-gateway
  -> product-service or analytics-service: POST video event
  -> Kafka/outbox: video.view_qualified, video.product_clicked
  -> analytics-service: aggregate KPI
```

### 9.3 Analytics

```txt
video behavior event
  -> analytics.events topic or video.* topic
  -> analytics-service consumer
  -> store raw event/aggregate
  -> seller UI: GET /api/v1/videos/:videoId/analytics
```

Pragmatic phase đầu: nếu event infrastructure chưa bật đủ, cho phép `product-service` nhận event API và publish sang topic `analytics.events`. Sau khi ổn mới tách thêm topic domain `video.events`.

## 10) Data model đề xuất

### 10.1 `product_videos` trong `product-service`

Collection: `product_videos`

| Field | Type | Required | Note |
|---|---|---:|---|
| `videoId` | string/uuid | Yes | ID public dùng trong URL/API |
| `sellerId` | string | Yes | Lấy từ JWT |
| `title` | string | Yes | 3-120 ký tự |
| `slug` | string | Optional | Có thể dùng cho SEO sau |
| `description` | string/null | No | 0-1000 ký tự |
| `status` | enum | Yes | State machine ở mục 7 |
| `mediaObjectKey` | string/null | No | MinIO object key |
| `mediaUrl` | string/null | No | Public/presigned URL hoặc CDN URL |
| `thumbnailObjectKey` | string/null | No | Thumbnail seller upload |
| `thumbnailUrl` | string/null | No | URL ảnh preview |
| `mimeType` | string/null | No | `video/mp4`, `video/webm` |
| `sizeBytes` | number/null | No | Dùng validate giới hạn |
| `durationSec` | number/null | No | 10-120 giây cho demo |
| `products` | array | Yes | Snapshot product tags |
| `moderation` | object | No | Review info |
| `metricsSnapshot` | object | No | Số liệu cache hiển thị nhanh |
| `publishedAt` | date/null | No | Sort feed |
| `hiddenAt` | date/null | No | Track unpublish |
| `archivedAt` | date/null | No | Soft delete |
| `createdAt` | date | Yes | Mongoose timestamps |
| `updatedAt` | date | Yes | Mongoose timestamps |

### 10.2 Product tag snapshot

Không chỉ lưu `productIds[]`. Nên lưu snapshot tối thiểu để feed không phải gọi product detail từng item.

```ts
type VideoProductTag = {
  productId: string;
  sku?: string | null;
  nameSnapshot: string;
  imageSnapshot?: string | null;
  priceSnapshot: number;
  currencySnapshot: string;
  statusSnapshot: 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'OUT_OF_STOCK';
  sortOrder: number;
  tagPosition?: {
    x: number; // 0-100 percent
    y: number; // 0-100 percent
    startSec?: number;
    endSec?: number;
  } | null;
};
```

Phase đầu có thể chỉ dùng product rail bên dưới video. `tagPosition` để future overlay theo thời gian.

### 10.3 Moderation object

```ts
type VideoModeration = {
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
  policyFlags?: string[];
};
```

### 10.4 Metrics snapshot

```ts
type VideoMetricsSnapshot = {
  viewStartedCount: number;
  qualifiedViewCount: number;
  productClickCount: number;
  addToCartCount: number;
  ctr: number;
  addToCartRate: number;
  lastAggregatedAt?: Date | null;
};
```

### 10.5 Index đề xuất

| Index | Mục đích |
|---|---|
| `{ videoId: 1 } unique` | Lookup video detail |
| `{ sellerId: 1, createdAt: -1 }` | Seller list |
| `{ sellerId: 1, status: 1, updatedAt: -1 }` | Seller filter theo status |
| `{ status: 1, publishedAt: -1 }` | Buyer feed |
| `{ 'products.productId': 1, status: 1 }` | Video liên quan product |
| `{ archivedAt: 1 }` partial | Loại archived khỏi query |

## 11) Media policy

| Rule | Phase đầu |
|---|---|
| Allowed MIME | `video/mp4`, `video/webm`, thumbnail `image/jpeg`, `image/png`, `image/webp` |
| Max size | 50MB/video |
| Duration | 10-120 giây |
| Object prefix | `media/videos/<videoId>/<uuid>.mp4` hoặc theo config hiện có |
| Upload method | Presigned PUT |
| Delete | Soft delete metadata trước, xóa object sau nếu cần cleanup job |
| Public read | Dùng policy hiện tại của MinIO hoặc presigned download tùy config |

Lưu ý quan trọng:

- Không lưu binary video trong MongoDB.
- Không để buyer upload video bằng endpoint seller.
- Không dùng tên file gốc làm object key trực tiếp.
- Validate `contentType` và extension cùng lúc.
- Với local demo, browser có thể phát trực tiếp `mp4/webm` từ MinIO public URL.

## 12) API contract v1

Base path qua gateway: `/api/v1`

Response nên giữ format hiện có của từng service. Contract dưới đây tập trung payload chính.

### 12.1 Seller APIs

| Method | Path | Auth | Mục đích |
|---|---|---|---|
| `POST` | `/videos` | `SELLER` | Tạo draft video |
| `PATCH` | `/videos/:videoId` | `SELLER` owner | Sửa title/description/product tags |
| `POST` | `/videos/:videoId/media/confirm` | `SELLER` owner | Gắn `mediaObjectKey` sau khi upload xong |
| `POST` | `/videos/:videoId/thumbnail/confirm` | `SELLER` owner | Gắn thumbnail |
| `POST` | `/videos/:videoId/submit-review` | `SELLER` owner | Gửi duyệt |
| `POST` | `/videos/:videoId/publish` | `MODERATOR`, `ADMIN`, `SUPER_ADMIN` | Publish sau khi review/approve |
| `POST` | `/videos/:videoId/unpublish` | `SELLER` owner | Ẩn video khỏi buyer feed |
| `DELETE` | `/videos/:videoId` | `SELLER` owner | Archive video |
| `GET` | `/videos/me` | `SELLER` | List video của seller |
| `GET` | `/videos/:videoId/analytics` | `SELLER` owner | KPI video |

Create draft request:

```json
{
  "title": "3 cach phoi dam maxi di bien",
  "description": "Video demo san pham moi",
  "products": [
    {
      "productId": "product-id-1",
      "sortOrder": 1
    }
  ]
}
```

Confirm media request:

```json
{
  "mediaObjectKey": "media/videos/video-id/file.mp4",
  "mediaUrl": "http://localhost:9000/media/media/videos/video-id/file.mp4",
  "mimeType": "video/mp4",
  "sizeBytes": 24000000,
  "durationSec": 42
}
```

Seller list query:

```txt
GET /api/v1/videos/me?status=published&page=1&pageSize=20&search=dam
```

### 12.2 Media upload API

Tận dụng endpoint media hiện có, mở rộng để hỗ trợ video.

```txt
POST /api/v1/media/uploads/presign
Auth: SELLER
```

Request:

```json
{
  "entityType": "video",
  "entityId": "video-id",
  "fileName": "demo.mp4",
  "contentType": "video/mp4",
  "expiresInSeconds": 900
}
```

Response:

```json
{
  "objectKey": "media/video/video-id/uuid.mp4",
  "method": "PUT",
  "uploadUrl": "http://localhost:9000/...",
  "expiresAt": "2026-05-15T00:00:00Z",
  "headers": {
    "Content-Type": "video/mp4"
  }
}
```

### 12.3 Buyer APIs

| Method | Path | Auth | Mục đích |
|---|---|---|---|
| `GET` | `/videos/feed` | Public | Feed video published |
| `GET` | `/videos/:videoId` | Public | Chi tiết video |
| `POST` | `/videos/:videoId/events/view-started` | Public | Buyer bắt đầu xem |
| `POST` | `/videos/:videoId/events/view-qualified` | Public | Buyer xem đủ ngưỡng |
| `POST` | `/videos/:videoId/events/product-clicked` | Public | Buyer click product trong video |
| `POST` | `/videos/:videoId/events/add-to-cart` | Customer/Public | Ghi nhận add-to-cart từ video |

Feed query:

```txt
GET /api/v1/videos/feed?page=1&pageSize=12&categoryId=&sellerId=&cursor=
```

Feed item response tối thiểu:

```json
{
  "videoId": "video-id",
  "title": "Dam maxi di bien",
  "description": "Video demo",
  "mediaUrl": "http://localhost:9000/media/...",
  "thumbnailUrl": "http://localhost:9000/media/...",
  "durationSec": 42,
  "seller": {
    "sellerId": "seller-id",
    "shopName": "eMall Fashion"
  },
  "products": [
    {
      "productId": "product-id-1",
      "name": "Dam Maxi",
      "image": "http://localhost:9000/media/...",
      "price": 293000,
      "currency": "VND",
      "status": "ACTIVE"
    }
  ],
  "metrics": {
    "qualifiedViewCount": 120,
    "productClickCount": 18
  },
  "publishedAt": "2026-05-15T00:00:00Z"
}
```

Event request:

```json
{
  "productId": "product-id-1",
  "source": "buyer_video_feed",
  "anonymousSessionId": "browser-session-id",
  "clientEventId": "uuid-from-client",
  "watchTimeSec": 4,
  "occurredAt": "2026-05-15T00:00:00Z"
}
```

### 12.4 Moderator APIs

| Method | Path | Auth | Mục đích |
|---|---|---|---|
| `GET` | `/moderation/videos?status=review_pending` | `MODERATOR` | Review queue |
| `POST` | `/moderation/videos/:videoId/approve` | `MODERATOR` | Approve video |
| `POST` | `/moderation/videos/:videoId/reject` | `MODERATOR` | Reject video kèm lý do |

Moderator có thể làm phase sau, nhưng status/API nên thiết kế từ đầu để tránh phá schema.

## 13) Event contract

### 13.1 Topic strategy

Phase đầu ưu tiên đơn giản:

- Dùng topic analytics chung nếu repo đang có: `analytics.events`.
- Event name phân biệt bằng `eventType`.
- Sau khi ổn, có thể tách topic domain: `video.events`.

### 13.2 Event list

| Event | Producer | Consumer | Khi nào phát |
|---|---|---|---|
| `video.created` | `product-service` | analytics/audit | Seller tạo draft |
| `video.media_confirmed` | `product-service` | analytics/audit | Seller confirm media |
| `video.submitted` | `product-service` | moderator/analytics | Seller gửi duyệt |
| `video.published` | `product-service` | analytics/feed cache | Video public |
| `video.hidden` | `product-service` | analytics/feed cache | Seller/admin ẩn |
| `video.rejected` | `product-service` | analytics/audit | Moderator reject |
| `video.view_started` | `product-service` hoặc `analytics-service` | analytics | Buyer bắt đầu xem |
| `video.view_qualified` | `product-service` hoặc `analytics-service` | analytics | Buyer xem đủ ngưỡng |
| `video.product_clicked` | `product-service` hoặc `analytics-service` | analytics | Buyer click product tag |
| `video.add_to_cart` | `cart-service` hoặc frontend event API | analytics | Add cart từ video |

### 13.3 Event payload chung

```json
{
  "eventId": "uuid",
  "eventType": "video.product_clicked",
  "occurredAt": "2026-05-15T00:00:00Z",
  "requestId": "request-id",
  "actor": {
    "userId": "buyer-id-or-null",
    "role": "CUSTOMER",
    "anonymousSessionId": "browser-session-id"
  },
  "video": {
    "videoId": "video-id",
    "sellerId": "seller-id"
  },
  "product": {
    "productId": "product-id-1"
  },
  "context": {
    "source": "buyer_video_feed",
    "watchTimeSec": 5,
    "clientEventId": "client-generated-uuid"
  }
}
```

Idempotency:

- Với client events, dùng `clientEventId`.
- Với publish/unpublish, dùng `eventId` từ outbox hoặc deterministic key `videoId:eventType:version`.
- Analytics consumer phải idempotent theo `eventId`.

## 14) Frontend UX plan

### 14.1 Buyer home

File liên quan:

- `frontend/apps/buyer-web/src/components/home/VideoHighlightsSection.tsx`
- `frontend/apps/buyer-web/src/app/page.tsx`
- `frontend/apps/buyer-web/src/components/layout/Header.tsx`
- `frontend/apps/buyer-web/src/lib/i18n.ts`

Yêu cầu:

- Header có entry `Video`.
- Home có section `Video nổi bật`.
- Section không chỉ là banner. Nên có 4-6 video cards, mỗi card hiển thị thumbnail, title, shop, product count, CTA.
- Khi API chưa có, dùng fallback demo data rõ ràng và comment/TODO ngắn.
- Khi API có, bỏ mock khỏi component hoặc chuyển mock thành fallback khi API lỗi trong dev.

### 14.2 Buyer `/videos`

File liên quan:

- `frontend/apps/buyer-web/src/app/videos/page.tsx`

UX đề xuất:

- Desktop: layout 2 cột, trái là video feed, phải là product panel/sticky info.
- Mobile: vertical feed dạng reel, product rail ở dưới.
- Có trạng thái loading, empty, error.
- Video card có:
  - Player hoặc thumbnail click-to-play.
  - Product rail.
  - Nút `Xem sản phẩm`.
  - Nút `Thêm vào giỏ` nếu có cart API.
  - Shop name/seller info.
- Tracking:
  - Gửi `view_started` khi video bắt đầu play.
  - Gửi `view_qualified` một lần nếu xem đủ 3 giây.
  - Gửi `product_clicked` trước khi navigate.
  - Không spam event khi scroll qua lại.

### 14.3 Seller video management

File liên quan:

- `frontend/apps/seller/src/components/layout/seller-sidebar.tsx`
- `frontend/apps/seller/src/app/marketing/videos/page.tsx`

UX đề xuất:

- Sidebar có mục `Video bán hàng` hoặc `Shoppable Video`.
- Page `marketing/videos` gồm:
  - KPI cards: published videos, total views, CTR, add-to-cart.
  - Tabs: `Tất cả`, `Draft`, `Đang duyệt`, `Published`, `Rejected`, `Hidden`.
  - Table/list video: thumbnail, title, status, products, views, CTR, updatedAt, actions.
  - Button `Tạo video`.
- Upload wizard 4 bước:
  - Bước 1: Thông tin video.
  - Bước 2: Upload video/thumbnail.
  - Bước 3: Chọn sản phẩm và sắp xếp product rail.
  - Bước 4: Preview và submit/publish.
- Actions:
  - Edit draft.
  - Submit review.
  - Publish nếu dev bypass.
  - Unpublish.
  - Archive.
  - View analytics.

### 14.4 Moderator review

File gợi ý:

- `frontend/apps/moderator/src/app/videos/review/page.tsx`

Phase sau:

- Queue video `review_pending`.
- Preview video + sản phẩm tag.
- Approve/reject với reason.
- Filter theo seller/category/status.

## 15) Feed ranking phase đầu

Không nên random thuần vì khó debug. Dùng ranking đơn giản, dễ giải thích:

```txt
score = recencyScore + engagementScore

recencyScore:
  video mới trong 7 ngày được ưu tiên

engagementScore:
  log(qualifiedViewCount + 1) * 0.2
  + productClickCtr * 2
  + addToCartRate * 3
```

Phase đầu nếu chưa có analytics:

- Sort `publishedAt desc`.
- Có thể pin vài video demo bằng `isFeatured=true`.
- Sau analytics, cập nhật `metricsSnapshot` bằng batch/job.

## 16) Test strategy

Theo validation ladder trong `AGENTS.md`.

### 16.1 Backend unit/service tests

| Scope | Command | Cần test |
|---|---|---|
| `media-service` | `cd services/media-service && go test ./...` | Allow video MIME, reject bad MIME, object key prefix |
| `product-service` | `npm --workspace services/product-service-nest run test` | DTO validation, owner policy, state transition, feed filter |
| `analytics-service` | `cd services/analytics-service && go test ./...` | Event ingest, idempotency, KPI aggregate |
| `api-gateway` | `cd services/api-gateway && go test ./...` | Route mapping video/media/moderation |

### 16.2 Frontend checks

| App | Command | Cần kiểm tra |
|---|---|---|
| `buyer-web` | `npm --prefix frontend/apps/buyer-web run lint`; `npm --prefix frontend/apps/buyer-web run build` | Header/video page/home section |
| `seller` | `npm --prefix frontend/apps/seller run lint` | Sidebar/video management page |
| `moderator` | `npm --prefix frontend/apps/moderator run lint`; `npm --prefix frontend/apps/moderator run build` | Review queue nếu làm |

### 16.3 Smoke test thủ công

1. Start stack local.
2. Login seller.
3. Tạo product active nếu chưa có.
4. Seller tạo draft video.
5. Upload `mp4` nhỏ.
6. Gắn product.
7. Publish hoặc submit -> approve.
8. Buyer mở `/videos`.
9. Buyer xem video, click product.
10. Kiểm tra analytics event/KPI.

## 17) Implementation roadmap chi tiết

### Phase 0 - Planning và UI foundation

| Task ID | Deliverable | Files/Scope | Status | % | Evidence | Next step | Blocker |
|---|---|---|---|---:|---|---|---|
| `VID-PLAN-01` | Viết plan chi tiết | `docs/architecture/shoppable-video-buyer-seller-plan.md` | DONE | 100 | File | Dùng plan để code phase 1 | None |
| `VID-UI-01` | Buyer nav + home video section + `/videos` skeleton | `frontend/apps/buyer-web` | DONE | 100 | File | Nối API thật | Backend chưa có video API |
| `VID-UI-02` | Seller sidebar + `marketing/videos` skeleton | `frontend/apps/seller` | DONE | 100 | File | Nối API thật | Backend chưa có video API |
| `VID-UX-01` | Chốt UX upload wizard + buyer feed behavior | `docs/architecture` | TODO | 0 | N/A | Review layout hiện có | None |

### Phase 1 - Media upload video

| Task ID | Deliverable | Files/Scope | Status | % | Evidence | Next step | Blocker |
|---|---|---|---|---:|---|---|---|
| `VID-MEDIA-01` | Mở rộng allowlist `video/mp4`, `video/webm` | `services/media-service/internal/service/storage_service.go` | DONE | 100 | File/Test | Nối seller upload | None |
| `VID-MEDIA-02` | Object key prefix video rõ ràng | `media-service` config/service | DONE | 100 | File/Test | Dùng `entityType=video` | None |
| `VID-MEDIA-03` | Unit test media policy | `services/media-service` | DONE | 100 | Test | Duy trì khi thêm MIME mới | None |
| `VID-MEDIA-04` | Gateway route media upload hoạt động với seller | `services/api-gateway` | DONE | 100 | API/Test | Dùng qua seller BFF | None |

Definition of Done:

- Seller có thể lấy presigned URL cho file `.mp4`.
- Upload file lên MinIO thành công.
- MIME xấu bị reject.
- `go test ./...` của media-service pass.

### Phase 2 - Product-service video domain

| Task ID | Deliverable | Files/Scope | Status | % | Evidence | Next step | Blocker |
|---|---|---|---|---:|---|---|---|
| `VID-BE-01` | Thêm schema `product_videos` | `services/product-service-nest/src/modules/products/entities` hoặc module `videos` | DONE | 100 | File/Build | Theo dõi analytics phase sau | None |
| `VID-BE-02` | DTO create/update/confirm media | `services/product-service-nest/src/modules/.../dto` | DONE | 100 | File/Build | Bổ sung moderation DTO sau | None |
| `VID-BE-03` | Repository video | `product-service` | DONE | 100 | File/Build | Tối ưu index theo data thật | None |
| `VID-BE-04` | Service state machine | `product-service` | DONE | 100 | Test | Bổ sung review approve/reject sau | None |
| `VID-BE-05` | Seller APIs | `product-service` controllers | DONE | 100 | API/Build | Smoke test bằng UI | None |
| `VID-BE-06` | Buyer feed APIs | `product-service` controllers | DONE | 100 | API/Build | Nối buyer-web phase sau | None |
| `VID-BE-07` | Owner/product validation | `product-service` service | DONE | 100 | Test | Mở rộng test edge cases | None |
| `VID-BE-08` | Unit tests | `product-service` test | DONE | 100 | Test | Thêm integration smoke sau | None |

Definition of Done:

- Seller tạo draft, confirm media, gắn product, gửi duyệt được qua API.
- Seller không sửa được video của seller khác.
- Seller không gắn được product của seller khác.
- Buyer feed chỉ trả `published`.
- Tests product-service pass.

### Phase 3 - Gateway routing và auth boundary

| Task ID | Deliverable | Files/Scope | Status | % | Evidence | Next step | Blocker |
|---|---|---|---|---:|---|---|---|
| `VID-GW-01` | Route `/api/v1/videos` tới product-service | `services/api-gateway/internal/router` | DONE | 100 | API/Test | Smoke test qua frontend | None |
| `VID-GW-02` | Route event public đúng policy | `api-gateway` | DONE | 100 | Test | Nối buyer tracking phase sau | None |
| `VID-GW-03` | Route moderation private | `api-gateway` | DONE | 100 | Test | Smoke test moderator app | None |

Definition of Done:

- Buyer gọi feed qua gateway được.
- Seller gọi create/submit-review qua gateway được với token.
- Route not found không còn xảy ra cho paths video.

### Phase 4 - Seller frontend nối API

| Task ID | Deliverable | Files/Scope | Status | % | Evidence | Next step | Blocker |
|---|---|---|---|---:|---|---|---|
| `VID-SELLER-01` | API client video seller | `frontend/apps/seller/src/lib` | DONE | 100 | File/Lint | Refine types nếu API đổi | None |
| `VID-SELLER-02` | Upload wizard dùng presign thật | `frontend/apps/seller/src/app/marketing/videos` | DONE | 100 | File/Lint | Smoke test với video thật | None |
| `VID-SELLER-03` | Product picker từ product API thật | `seller` | DONE | 100 | File/Lint | Hỗ trợ multi-product sau | None |
| `VID-SELLER-04` | Publish/unpublish actions | `seller` | DONE | 100 | File/Lint | Thêm confirm dialog sau | None |
| `VID-SELLER-05` | Analytics cards | `seller` | DONE | 100 | File/Lint | Nối aggregate analytics phase 6 | None |

Definition of Done:

- Seller không còn dùng mock cho danh sách video.
- Seller upload, preview và gửi duyệt được từ UI.
- Error states hiển thị rõ khi upload/API lỗi.

### Phase 5 - Buyer frontend nối API

| Task ID | Deliverable | Files/Scope | Status | % | Evidence | Next step | Blocker |
|---|---|---|---|---:|---|---|---|
| `VID-BUYER-01` | API client feed video | `frontend/apps/buyer-web/src/lib` | DONE | 100 | File/Lint | Smoke test local stack | None |
| `VID-BUYER-02` | Home section dùng API thật | `VideoHighlightsSection.tsx` | DONE | 100 | File/Lint | Smoke test local stack | None |
| `VID-BUYER-03` | `/videos` feed dùng API thật | `frontend/apps/buyer-web/src/app/videos/page.tsx` | DONE | 100 | File/Lint | Smoke test local stack | None |
| `VID-BUYER-04` | Tracking view/click | `buyer-web`, `product-service` | DONE | 100 | API/Test/Lint | Smoke test event count | None |
| `VID-BUYER-05` | Product click/add-to-cart flow | `buyer-web` | DONE | 100 | File/Lint | Add direct add-to-cart CTA later | None |

Definition of Done:

- Buyer thấy video seller vừa publish.
- Click product tag mở đúng product hoặc add cart.
- Event không spam khi refresh/scroll.

### Phase 6 - Analytics và KPI

| Task ID | Deliverable | Files/Scope | Status | % | Evidence | Next step | Blocker |
|---|---|---|---|---:|---|---|---|
| `VID-AN-01` | Event types video | `shared/kafka/events`, `shared/kafka/topics` hoặc analytics constants | DONE | 100 | File | Keep event naming stable | None |
| `VID-AN-02` | Ingest raw events | `services/analytics-service`, `product-service` publisher | DONE | 100 | Test | Smoke test Kafka local | None |
| `VID-AN-03` | Aggregate KPI | `analytics-service` | DONE | 100 | Test | Wire richer seller dashboard later | None |
| `VID-AN-04` | Seller analytics endpoint | `analytics-service` + product snapshot metrics | DONE | 100 | API/Test | Optional frontend analytics endpoint integration | None |
| `VID-AN-05` | KPI display in seller UI | `frontend/apps/seller` | DONE | 100 | Lint | Replace snapshot cards with aggregate endpoint if needed | None |

Definition of Done:

- Seller thấy views, CTR, add-to-cart count.
- Analytics consumer idempotent.
- Event payload có `videoId`, `sellerId`, `productId`, `source`.

### Phase 7 - Moderation và hardening

| Task ID | Deliverable | Files/Scope | Status | % | Evidence | Next step | Blocker |
|---|---|---|---|---:|---|---|---|
| `VID-MOD-01` | Review queue API | `product-service` | DONE | 100 | API/Test | Smoke test moderator app | None |
| `VID-MOD-02` | Approve/reject API | `product-service` | DONE | 100 | API/Test | Smoke test moderator app | None |
| `VID-MOD-03` | Moderator UI | `frontend/apps/moderator` | DONE | 100 | File/Lint | Smoke test local stack | None |
| `VID-HARD-01` | Idempotency publish/events | Backend services | DONE | 100 | Test | Monitor event key cache size | None |
| `VID-HARD-02` | Rate limit event APIs | Gateway/service | DONE | 100 | Test | Tune `RATE_LIMIT_RPS`/`BURST` for demo | None |
| `VID-HARD-03` | Cleanup orphan media | media/product-service job or docs | DONE | 100 | File | Implement scheduled cleanup only if required | None |

Definition of Done:

- Video review flow chạy được.
- Event endpoints không dễ bị spam.
- Publish/unpublish gọi lại nhiều lần không tạo event trùng.

### Phase 8 - Demo package

| Task ID | Deliverable | Files/Scope | Status | % | Evidence | Next step | Blocker |
|---|---|---|---|---:|---|---|---|
| `VID-DEMO-01` | Seed/demo data | `docs/architecture/shoppable-video-demo-script.md` | DONE | 100 | File | Prepare real local account/video before presentation | None |
| `VID-DEMO-02` | Demo script 8-10 phút | `docs/architecture/shoppable-video-demo-script.md` | DONE | 100 | File | Rehearse with local stack | None |
| `VID-DEMO-03` | Troubleshooting guide | `docs/architecture/shoppable-video-demo-script.md` | DONE | 100 | File | Add new issues after smoke test | None |

Definition of Done:

- Chạy demo lặp được.
- Có kịch bản nói rõ business value, kiến trúc, event-driven, analytics.

## 18) Bảng theo dõi hằng ngày

| Date | Task ID | What changed | Files changed | API/Event/DB changed | Tests run | Status | Next task | Blocker |
|---|---|---|---|---|---|---|---|---|
| 2026-05-15 | `VID-PLAN-01` | Viết plan chi tiết cho shoppable video | `docs/architecture/shoppable-video-buyer-seller-plan.md` | No | Not run, docs only | DONE | `VID-MEDIA-01` | None |
| 2026-05-15 | `VID-UI-01` | Buyer có skeleton nav/home section/video page | `frontend/apps/buyer-web/src/app/page.tsx`, `frontend/apps/buyer-web/src/components/layout/Header.tsx`, `frontend/apps/buyer-web/src/components/home/VideoHighlightsSection.tsx`, `frontend/apps/buyer-web/src/app/videos/page.tsx`, `frontend/apps/buyer-web/src/lib/i18n.ts` | No | Lint cần chạy lại trước commit | DONE | `VID-BUYER-01` | Backend API chưa có |
| 2026-05-15 | `VID-UI-02` | Seller có skeleton sidebar/video management page | `frontend/apps/seller/src/components/layout/seller-sidebar.tsx`, `frontend/apps/seller/src/app/marketing/videos/page.tsx` | No | Lint cần chạy lại trước commit | DONE | `VID-SELLER-01` | Backend API chưa có |
| 2026-05-15 | `VID-MEDIA-01..04` | Media service hỗ trợ video upload policy + gateway media route dùng được | `services/media-service/internal/service/storage_service.go`, `services/media-service/internal/service/storage_service_test.go`, `services/api-gateway/internal/router/router.go`, `services/api-gateway/internal/router/router_test.go` | API | `cd services/media-service && go test ./...`; `cd services/api-gateway && go test ./...` | DONE | `VID-BE-01` | None |
| 2026-05-15 | `VID-BE-01..08` | Thêm domain `product_videos`, seller APIs, buyer feed APIs, state machine, unit test | `services/product-service-nest/src/modules/products/**` | API/DB | `npm --workspace services/product-service-nest run test`; `npm --workspace services/product-service-nest run build` | DONE | `VID-GW-01` | None |
| 2026-05-15 | `VID-GW-01..02` | Expose public/private `/api/v1/videos` routes qua gateway | `services/api-gateway/internal/router/router.go`, `services/api-gateway/internal/router/router_test.go` | API | `cd services/api-gateway && go test ./...` | DONE | `VID-SELLER-01` | None |
| 2026-05-15 | `VID-SELLER-01..05` | Seller UI nối API thật: list/create/presign/upload/confirm/publish/unpublish | `frontend/apps/seller/src/app/marketing/videos/page.tsx`, `frontend/apps/seller/src/app/api/seller/videos/**`, `frontend/apps/seller/src/lib/api/videos.ts`, `frontend/apps/seller/src/lib/api/types.ts` | API | `npm --prefix frontend/apps/seller run lint` | DONE | `VID-BUYER-01` | Cần smoke test với stack local |
| 2026-05-15 | `VID-BUYER-01..05` | Buyer home và `/videos` dùng feed thật, có tracking view/click và product navigation | `frontend/apps/buyer-web/src/app/videos/page.tsx`, `frontend/apps/buyer-web/src/components/home/VideoHighlightsSection.tsx`, `frontend/apps/buyer-web/src/app/api/buyer/videos/**`, `frontend/apps/buyer-web/src/lib/api/videos.ts`, `frontend/apps/buyer-web/src/lib/api/types.ts` | API/Event | `npm --prefix frontend/apps/buyer-web run lint`; `npm --prefix frontend/apps/buyer-web run build` | DONE | `VID-AN-01` | Chưa smoke test browser local |
| 2026-05-15 | `VID-AN-01..05` | Thêm video event contracts, publish behavior event sang `analytics.events`, analytics summary API và KPI snapshot | `shared/kafka/**`, `services/product-service-nest/src/modules/products/**`, `services/analytics-service/internal/**` | Event/API/DB | `npm --workspace services/product-service-nest run test`; `npm --workspace services/product-service-nest run build`; `cd services/analytics-service && go test ./...` | DONE | `VID-MOD-01` | Cần Kafka smoke test local nếu bật analytics realtime |
| 2026-05-15 | `VID-MOD-01..03`, `VID-HARD-01..03` | Thêm review queue approve/reject, moderator UI, event idempotency, route/rate-limit coverage, cleanup policy docs | `services/product-service-nest/src/modules/products/**`, `services/api-gateway/internal/router/**`, `frontend/apps/moderator/src/**`, `docs/architecture/shoppable-video-demo-script.md` | API/DB | `cd services/api-gateway && go test ./...`; `npm --workspace services/product-service-nest run test`; `npm --prefix frontend/apps/moderator run lint`; `npm --prefix frontend/apps/moderator run build` | DONE | `VID-DEMO-01` | Chưa smoke test UI với account thật |
| 2026-05-15 | `VID-DEMO-01..03` | Viết demo script, demo data checklist và troubleshooting guide | `docs/architecture/shoppable-video-demo-script.md` | No | Docs only | DONE | Smoke test end-to-end | None |

Mẫu thêm dòng mới:

```txt
| YYYY-MM-DD | `TASK-ID` | short change | files | API/Event/DB | tests | TODO/IN_PROGRESS/BLOCKED/DONE | next | blocker |
```

## 19) Bảng thay đổi kiến trúc

| Date | Change | Decision | Reason | Risk | Follow-up |
|---|---|---|---|---|---|
| 2026-05-15 | Chọn `product-service` sở hữu video metadata | Video gắn với product/seller nên để gần product domain | Tránh tạo service mới quá sớm | Product-service lớn hơn | Nếu feature lớn, tách `video-service` sau |
| 2026-05-15 | Chọn `media-service` chỉ sở hữu object upload | File storage là hạ tầng riêng | Giữ boundary sạch | Cần phối hợp confirm media | Thêm cleanup orphan media |
| 2026-05-15 | Bắt buộc moderator duyệt mọi video seller | Seller chỉ submit review, moderator/admin approve mới published | Đúng nghiệp vụ marketplace và tránh nội dung tự public | Demo cần thêm bước moderator | Dùng `/videos/review` để approve |
| 2026-05-15 | Ghi product snapshot trong video | Feed nhanh, ít gọi chéo service | Tránh N+1 product calls | Snapshot có thể cũ | Refresh snapshot khi publish hoặc product update |
| 2026-05-15 | Publish video behavior event vào `analytics.events` | Product-service cập nhật snapshot metric và phát event cho analytics-service | Buyer UI có feedback nhanh, analytics vẫn có raw event để aggregate | Nếu Kafka tắt thì chỉ có snapshot metrics | Smoke test Kafka khi chạy stack local |
| 2026-05-15 | Event idempotency lưu `recentEventKeys` trên `product_videos` | Chặn duplicate client event trước khi cộng metric/publish analytics | Tránh spam view/click làm sai KPI demo | Cache key giới hạn 500 event gần nhất/video | Tách sang Redis nếu traffic lớn |

## 20) Checklist tránh sai lầm khi code

Trước khi code:

- Xác định đang làm task ID nào trong mục 17.
- Đọc đúng service liên quan, không scan toàn repo nếu không cần.
- Chốt API path trước khi sửa frontend.
- Kiểm tra route gateway trước khi debug frontend quá lâu.

Khi làm backend:

- Không nhận `sellerId` từ body.
- Không publish video nếu product không thuộc seller.
- Không trả video chưa published cho buyer.
- Không lưu binary video vào MongoDB.
- Không tạo event trùng khi publish gọi lại.
- Không để event public endpoint spam vô hạn.

Khi làm frontend:

- Không giữ mock data sau khi API thật đã có, trừ fallback dev có ghi chú.
- Không gửi event view liên tục mỗi render.
- Không navigate product trước khi gửi click event nếu muốn tracking chắc chắn. Có thể dùng `navigator.sendBeacon` hoặc fire-and-forget an toàn.
- Luôn có loading, empty, error states.

Khi update plan:

- Task xong thì chuyển status `DONE`.
- Nếu bị kẹt do backend/API thì ghi `BLOCKED`, không để TODO mơ hồ.
- Ghi command test đã chạy vào mục 18.
- Nếu đổi API/Event/DB thì cập nhật mục 12, 13 hoặc 10.

## 21) Definition of Done toàn feature

Feature được coi là đạt hơn MVP khi:

1. Seller tạo video từ UI, upload `mp4/webm`, gắn sản phẩm, preview và gửi duyệt được.
2. Moderator approve video thì video mới published.
3. Buyer mở `/videos` thấy video từ backend thật.
4. Buyer click product trong video đi đúng product/cart flow.
5. View/click/add-to-cart được ghi nhận vào analytics.
6. Seller thấy KPI cơ bản cho từng video.
7. Gateway route và auth policy rõ public/private.
8. Có tests cho media policy, product video state machine, gateway route.
9. Có demo script và dữ liệu demo chạy lại được.

## 22) Kịch bản demo đề xuất

Thời lượng 8-10 phút:

1. Giới thiệu vấn đề: seller cần bán hàng bằng video ngắn, buyer muốn xem nội dung trực quan.
2. Mở seller app, chọn product đang active.
3. Tạo video bán hàng, upload file, gắn 2 sản phẩm.
4. Preview rồi publish.
5. Mở buyer home, thấy `Video nổi bật`.
6. Vào `/videos`, xem video vừa publish.
7. Click product tag, mở product detail hoặc add cart.
8. Quay lại seller, xem view/click/CTR tăng.
9. Giải thích kiến trúc: media-service lưu file, product-service quản video, analytics-service nhận event, gateway route.
10. Nói future roadmap: livestream commerce dùng lại video/product/event foundation, recommendation FP-Growth dùng event video/cart/order.

## 23) Thứ tự code khuyến nghị ngay sau file này

1. `VID-MEDIA-01` + `VID-MEDIA-03`: mở video upload trong `media-service` và test trước.
2. `VID-BE-01` đến `VID-BE-08`: làm domain video trong `product-service`.
3. `VID-GW-01` + `VID-GW-02`: route qua gateway.
4. `VID-SELLER-01` đến `VID-SELLER-04`: nối seller UI.
5. `VID-BUYER-01` đến `VID-BUYER-05`: nối buyer UI.
6. `VID-AN-01` đến `VID-AN-05`: analytics/KPI.
7. `VID-MOD-*` và `VID-HARD-*`: moderation, idempotency, rate limit.

Không nên làm analytics hoặc moderation trước khi seller upload -> buyer watch chạy end-to-end, vì sẽ khó test và dễ tốn thời gian.
