# Livestream Commerce MVP Roadmap (Practical for Personal Demo)

Last updated: 2026-05-16  
Scope: `ecommerce-microservices`

## 1) Mục tiêu tài liệu

- Ưu tiên xây **Livestream MVP chạy được trên máy cá nhân** để demo với giảng viên.
- Tập trung vào luồng có giá trị thật: **Seller go-live -> Buyer xem/chát -> Pin sản phẩm -> Click mua**.
- Giảm rủi ro triển khai: tận dụng service sẵn có, hạn chế scope ingest video phức tạp ở vòng đầu.

## 2) MVP scope (bắt buộc)

In scope:
- Seller tạo phiên live, start/end phiên.
- Buyer vào phòng live, nhận realtime chat + pinned products.
- Seller pin sản phẩm trong lúc live.
- Buyer click từ pinned product sang product detail/add-to-cart.
- Ghi analytics event cơ bản để có số liệu demo.

Out of scope (để sau MVP):
- Realtime transcoding pipeline hoàn chỉnh (ABR multi-bitrate, recording pipeline).
- Recommendation model FP-Growth theo thời gian thực.
- Chống gian lận/phân tích nâng cao.

## 3) Kiến trúc MVP đề xuất (thực tế, dễ demo local)

### 3.1 Thành phần sử dụng

- `live-service`: quản lý live session + WebSocket realtime + room presence.
- `product-service`: xác thực sản phẩm hợp lệ để pin, lấy snapshot giá/tên.
- `api-gateway`: route/auth cho REST + WS.
- `analytics-service`: ingest event để thống kê cơ bản.
- `frontend/apps/seller`: màn hình điều khiển phiên live.
- `frontend/apps/buyer-web`: màn hình xem live.

### 3.2 Video strategy cho MVP local

Chọn phương án A để demo ổn định trên máy cá nhân:
- Phương án A (khuyến nghị): Seller nhập `playbackUrl` có sẵn (HLS/MP4), hệ thống tập trung vào commerce realtime.
- Phương án B (hậu MVP): tích hợp OBS -> RTMP ingest -> HLS output.

Lý do chọn A:
- Ít phụ thuộc hạ tầng media.
- Giảm rủi ro demo fail vì transcoding/network.
- Vẫn thể hiện đầy đủ business flow livestream commerce.

## 4) Luồng nghiệp vụ MVP end-to-end

### 4.1 Seller flow

1. Seller tạo session: tiêu đề, mô tả ngắn, `playbackUrl`.
2. Seller bấm Start -> session chuyển `LIVE`.
3. Seller pin sản phẩm (`productId`) trong lúc live.
4. Seller gửi vài tin nhắn/announcement.
5. Seller bấm End -> session chuyển `ENDED`.

### 4.2 Buyer flow

1. Buyer mở `/live/:sessionId`.
2. Client join room WS, nhận trạng thái live + pinned products hiện tại.
3. Buyer chat realtime.
4. Buyer click pinned product -> product detail/add-to-cart.
5. Hệ thống ghi event click/conversion để báo cáo.

### 4.3 Event flow (Kafka)

- `live.session.started`
- `live.viewer.joined`
- `chat.message.created`
- `live.product.pinned`
- `live.product.clicked`
- `live.session.ended`

`analytics-service` consume các event trên để build dashboard KPI MVP.

## 5) API contract MVP (v1)

Owner chính: `live-service` (qua `api-gateway`)

- `POST /api/v1/live/sessions`
  - Input: `title`, `playbackUrl`, `scheduledAt?`
  - Output: `sessionId`, `status=DRAFT`
- `PATCH /api/v1/live/sessions/:id/start`
  - Output: `status=LIVE`, `startedAt`
- `PATCH /api/v1/live/sessions/:id/end`
  - Output: `status=ENDED`, `endedAt`
- `GET /api/v1/live/sessions/:id`
  - Output: session detail + current pinned products
- `POST /api/v1/live/sessions/:id/pin-product`
  - Input: `productId`
  - Flow: gọi `product-service` check product ACTIVE + snapshot
- `GET /api/v1/live/sessions/:id/pinned-products`
  - Output: danh sách pinned theo thứ tự mới nhất

WebSocket events:
- `live:join`, `live:leave`
- `live:message:create`, `live:message:new`
- `live:product:pin`, `live:product:pinned`
- `live:session:status`

## 6) Data model tối thiểu

`live-service`:

- `live_sessions`
  - `sessionId`, `sellerId`, `title`, `playbackUrl`, `status`, `startedAt`, `endedAt`, `createdAt`, `updatedAt`
- `live_session_products`
  - `sessionId`, `productId`, `nameSnapshot`, `priceSnapshot`, `imageSnapshot`, `pinnedAt`, `pinnedBy`
- `live_messages`
  - `sessionId`, `senderId`, `senderRole`, `message`, `createdAt`

Indexes cần có:
- `live_sessions`: `{ sellerId: 1, status: 1, createdAt: -1 }`
- `live_session_products`: `{ sessionId: 1, pinnedAt: -1 }`
- `live_messages`: `{ sessionId: 1, createdAt: -1 }`

## 7) Kế hoạch triển khai MVP (4 tuần)

## Tuần 1: Domain + API + DB

- Chốt schema `live_sessions`, `live_session_products`, `live_messages`.
- Implement REST create/start/end/get session.
- Implement pin-product API có verify từ `product-service`.
- Unit test cho state transition: `DRAFT -> LIVE -> ENDED`.

Deliverable:
- Seller có thể tạo/start/end/pin qua API thật (Postman/curl pass).

## Tuần 2: Realtime WS + Buyer/Seller UI

- Tạo WS room theo `sessionId`.
- Broadcast chat message và product pinned event.
- Seller page: control start/end + pin sản phẩm.
- Buyer page: player + chat + pinned products rail.

Deliverable:
- 2 browser tabs (seller/buyer) tương tác realtime được.

## Tuần 3: Analytics + demo metrics

- Publish Kafka events cho các action chính.
- `analytics-service` consume và aggregate KPI cơ bản.
- Tạo endpoint/report đơn giản hoặc log dashboard:
  - viewers peak
  - chat messages/min
  - pinned product clicks

Deliverable:
- Có số liệu định lượng sau buổi live demo.

## Tuần 4: Hardening nhẹ + script demo

- Idempotency cho start/end/pin để tránh double click.
- Validation quyền truy cập session theo role.
- Viết script demo 10-12 phút + fallback plan khi mạng yếu.
- Smoke test end-to-end bằng docker compose local.

Deliverable:
- Demo ổn định, có checklist chạy trước khi trình bày.

## 8) Local demo runbook (máy cá nhân)

Chuẩn bị:
- Chạy `docker-compose` (Mongo, Redis, Kafka, services chính).
- Seed ít nhất 5 sản phẩm active để pin.
- Chuẩn bị sẵn 1 `playbackUrl` ổn định (HLS/MP4).

Kịch bản demo 10-12 phút:
1. Seller tạo session và Start.
2. Buyer mở trang live từ sessionId.
3. Seller pin 2 sản phẩm + gửi chat message.
4. Buyer thấy realtime pinned update, click vào product.
5. Show analytics counters sau 2-3 phút thao tác.
6. Seller End session, buyer nhận trạng thái kết thúc.

Fallback khi video lỗi:
- Vẫn demo commerce flow bằng placeholder player + chat/pin/click events.
- Nhấn mạnh phạm vi MVP là live-commerce interaction, không phải media transcoding pipeline.

## 9) KPI MVP để báo cáo giảng viên

- `session_start_success_rate`
- `concurrent_viewers_peak`
- `chat_messages_per_min`
- `pinned_product_click_ctr`
- `live_to_add_to_cart_rate`
- `session_end_clean_rate`

## 10) Rủi ro chính và cách giảm

- Rủi ro 1: Player URL không ổn định.
  - Giảm thiểu: chuẩn bị 2 URL dự phòng + placeholder mode.
- Rủi ro 2: WS disconnect khi demo.
  - Giảm thiểu: auto reconnect + toast trạng thái.
- Rủi ro 3: Pin product sai trạng thái/hết hàng.
  - Giảm thiểu: verify ACTIVE trước khi pin + trả lỗi rõ ràng.

## 11) Hậu MVP (nếu còn thời gian)

- Bổ sung ingest OBS/RTMP thật.
- Lưu recording và replay.
- Recommendation từ hành vi live (`live.product.clicked`, `order.created`) bằng FP-Growth theo batch.

## 12) Change log

| Date | Change | Note |
|---|---|---|
| 2026-05-16 | Rewrite roadmap theo hướng Livestream MVP-first | Tối ưu khả năng demo local và trình bày thực tế |
