# Shoppable Video -> Livestream Commerce -> Recommendation FP-Growth Roadmap

Last updated: 2026-05-14  
Scope: monorepo `ecommerce-microservices`

## 1) Thứ tự phát triển bắt buộc

1. Shoppable Video MVP
2. Livestream Commerce MVP
3. Recommendation FP-Growth

## 2) Mục tiêu

- Làm ra 3 tính năng đặc biệt có thể demo end-to-end.
- Giữ đúng kiến trúc microservice, event-driven, outbox, idempotency.
- Mỗi giai đoạn đều có kết quả đo lường được để trình bày với hội đồng.

## 3) Hiện trạng kỹ thuật đã xác nhận

- `media-service` mới hỗ trợ upload `image/*`, chưa hỗ trợ video.
- `chat-service` đã có WebSocket realtime và outbox Kafka phù hợp để mở rộng live interaction.
- `product-service` chưa có API video domain và chưa có API recommendation thật.
- `analytics-service` đã ingest từ `analytics.events` nhưng compose hiện đặt `KAFKA_ENABLED=false`.
- `seller` đã có trang `marketing/live-video` nhưng phần lớn là UI mock.
- `buyer-web` đang có TODO cho recommendation thật trong home route.

## 4) Timeline tổng quan (8 tuần)

| Phase | Feature | Thời lượng | Deliverable chính |
|---|---|---:|---|
| 0 | Foundation | 1 tuần | Chốt contract/API/event/data + bật analytics consume |
| 1 | Shoppable Video MVP | 2 tuần | Upload video + gắn product tag + buyer video feed |
| 2 | Livestream Commerce MVP | 2 tuần | Tạo phiên live + chat + pin sản phẩm + click mua |
| 3 | Recommendation FP-Growth | 2 tuần | Pipeline FP-Growth + API recommendation thật |
| 4 | Hardening & Demo | 1 tuần | Load test, dashboard KPI, script demo hội đồng |

## 5) Phase 0 - Foundation (bắt buộc trước khi code lớn)

Mục tiêu:
- Khóa scope, tránh lan man.
- Chuẩn hóa contract để giảm sửa đi sửa lại.

Checklist:
- Bổ sung topic trong `shared/kafka/topics.ts`:
- `video.published`, `video.viewed`, `video.product.clicked`, `video.completed`.
- `live.session.started`, `live.session.ended`, `live.viewer.joined`, `live.product.pinned`.
- `recommendation.updated`.
- Bổ sung event interfaces trong `shared/kafka/events/*`.
- Bật `KAFKA_ENABLED=true` cho `analytics-service` trong `docker-compose.yml`.
- Chốt API list cho từng phase ngay trong file này.

Definition of Done:
- Có contract version 1 cho video/live/recommendation.
- Có mapping service ownership rõ ràng.

## 6) Phase 1 - Shoppable Video MVP (ưu tiên số 1)

## 6.1 Mục tiêu

- Seller upload video ngắn.
- Seller gắn sản phẩm vào video.
- Buyer xem feed, click tag sản phẩm để mua.

## 6.2 Backend scope

- `media-service`:
- Mở rộng `PresignUpload` cho `video/mp4`, `video/webm`.
- Hỗ trợ object key prefix `videos/` riêng.
- `product-service`:
- `POST /api/v1/products/:id/videos` tạo video metadata.
- `GET /api/v1/products/:id/videos` danh sách video của product.
- `GET /api/v1/videos/feed` feed video public.
- Event publish:
- `video.published`.
- `video.viewed`.
- `video.product.clicked`.
- `analytics-service`:
- Ingest video events để tính CTR/engagement.

## 6.3 Frontend scope

- `frontend/apps/seller/src/app/marketing/live-video/page.tsx`:
- Tab Video gọi API upload/publish thật.
- `frontend/apps/buyer-web`:
- Tạo trang `videos` hoặc section feed trên home.
- Overlay tag sản phẩm trong video card.
- Click tag -> product detail hoặc add-to-cart.

## 6.4 Data model đề xuất

- `product-service` collection: `product_videos`.
- Trường chính:
- `videoId`, `sellerId`, `productIds`, `thumbnailUrl`, `durationSec`, `status`, `createdAt`.

## 6.5 Demo kết thúc phase

- Seller upload video và publish.
- Buyer mở feed video, click tag sản phẩm, vào mua hàng.

## 7) Phase 2 - Livestream Commerce MVP (ưu tiên số 2)

## 7.1 Mục tiêu

- Seller mở phiên livestream.
- Buyer vào xem, chat realtime, thấy sản phẩm pin và mua nhanh.

## 7.2 Backend scope

- `chat-service` mở rộng live session domain:
- `POST /api/v1/live/sessions`.
- `PATCH /api/v1/live/sessions/:id/start`.
- `PATCH /api/v1/live/sessions/:id/end`.
- `GET /api/v1/live/sessions/:id`.
- `POST /api/v1/live/sessions/:id/pin-product`.
- `GET /api/v1/live/sessions/:id/pinned-products`.
- WebSocket events:
- `live.viewer.joined`.
- `live.product.pinned`.
- `chat.message.created`.
- `product-service`:
- Endpoint kiểm tra product status/price trước khi pin.
- `api-gateway`:
- Expose route cho live session theo policy public/private.
- `analytics-service`:
- Ingest live events để tính viewers, click, conversion.

## 7.3 Frontend scope

- `frontend/apps/seller/src/app/marketing/live-video/page.tsx`:
- Nút Start/End session, pin sản phẩm.
- `frontend/apps/buyer-web`:
- Tạo trang `/live/[sessionId]`.
- Player area.
- Pinned products rail.
- Chat panel tích hợp luồng hiện có.

## 7.4 Data model đề xuất

- `chat-service` collections:
- `live_sessions`.
- `live_session_products`.

## 7.5 Demo kết thúc phase

- Seller start live -> buyer join -> chat + pin product -> buyer click mua.

## 8) Phase 3 - Recommendation FP-Growth (ưu tiên số 3)

## 8.1 Mục tiêu

- Recommendation chạy từ dữ liệu mua hàng thật.
- Loại bỏ recommendation giả lập ở `buyer-web` home route.

## 8.2 Backend scope

- `analytics-service`:
- Dùng event `order.created`, `order.status-updated` trong `analytics.events`.
- Chạy batch mỗi 5-15 phút:
- Build baskets.
- Chạy FP-Growth.
- Sinh association rules.
- Lưu vào bảng `product_recommendations`.
- API:
- `GET /api/v1/analytics/recommendations/products/:productId?limit=10`.
- `product-service`:
- API public:
- `GET /api/v1/products/:id/recommendations`.
- Fallback khi cold-start:
- category/brand/top-selling.
- `buyer-web`:
- Sửa `frontend/apps/buyer-web/src/app/api/buyer/home/route.ts` để gọi API recommendation thật.

## 8.3 Data model đề xuất

- Bảng `product_recommendations`:
- `source_product_id`, `target_product_id`, `score`, `support`, `confidence`, `lift`, `window_start`, `window_end`, `updated_at`.

## 8.4 Demo kết thúc phase

- Buyer mở product/home thấy recommendation thay đổi theo data order mới.

## 9) Phase 4 - Hardening & Demo

Checklist:
- Idempotency cho publish video, pin product, create live session.
- Retry + backoff + DLQ cho event processing.
- Dashboard KPI cho video/live/recommendation.
- Load test kịch bản concurrent viewers và chat throughput.
- Script demo 10-12 phút chạy được lặp.

## 10) Test strategy (theo Validation Ladder)

L0:
- Unit test cho validator/mapper/parser/job logic.

L1:
- `cd services/media-service && go test ./...`
- `cd services/chat-service && go test ./...`
- `cd services/analytics-service && go test ./...`
- `npm --workspace services/product-service run test`

L2:
- `scripts/test-product-service.sh`
- `scripts/test-analytics-service.sh`
- Thêm script smoke riêng cho shoppable video/live/recommendation.

L3:
- `npm run test` chỉ khi thay đổi cross-service lớn.

## 11) KPI chấm điểm đề xuất

- Video:
- `video_3s_view_rate`, `video_product_click_ctr`, `video_to_cart_rate`.
- Livestream:
- `concurrent_viewers_peak`, `chat_messages_per_min`, `live_to_product_click_ctr`, `live_to_order_conversion`.
- Recommendation:
- `recommendation_ctr`, `recommendation_add_to_cart_rate`, `recommendation_order_rate`.
- Platform:
- `p95_api_latency`, `kafka_consumer_lag`, `error_rate`.

## 12) Backlog EPIC gợi ý

- EPIC-1: Shoppable Video domain + APIs + feed.
- EPIC-2: Livestream session + realtime interaction.
- EPIC-3: FP-Growth pipeline + recommendation APIs.
- EPIC-4: Hardening, observability, demo package.

## 13) Bảng theo dõi tiến độ hằng ngày (để không quên)

Quy ước `Status`: `TODO` | `IN_PROGRESS` | `BLOCKED` | `DONE`

| Date | Feature | Task ID | Task mô tả | Service/Folder | Owner | Status | % | Next step | Blocker |
|---|---|---|---|---|---|---|---:|---|---|
| 2026-05-14 | Foundation | FND-01 | Chốt roadmap + thứ tự feature | `docs/architecture` | You | DONE | 100 | Tạo ticket Phase 0 | None |
| 2026-05-14 | Shoppable Video | VID-01 | Chốt schema `product_videos` | `services/product-service` | You | TODO | 0 | Draft schema + DTO | None |
| 2026-05-14 | Livestream | LIV-01 | Chốt schema `live_sessions` | `services/chat-service` | You | TODO | 0 | Draft model + migration | None |
| 2026-05-14 | Recommendation | REC-01 | Thiết kế batch FP-Growth | `services/analytics-service` | You | TODO | 0 | Define basket query | None |

## 14) Bảng log thay đổi (đã thay đổi những gì)

| Date | Feature | Change type | Files changed | API changed | Event changed | DB changed | Test evidence | Commit/PR | Note |
|---|---|---|---|---|---|---|---|---|---|
| 2026-05-14 | Planning | Docs update | `docs/architecture/livestream-video-recommendation-roadmap.md` | No | No | No | N/A | Uncommitted | Viết lại roadmap theo thứ tự Video -> Live -> FP-Growth và thêm bảng tracking |

## 15) Mẫu điền nhanh cuối ngày

Copy block này mỗi ngày để cập nhật nhanh:

```txt
Date:
Feature:
Task ID:
What I finished:
Files changed:
API/Event/DB changed:
Tests run:
Current blocker:
Next first task tomorrow:
```
