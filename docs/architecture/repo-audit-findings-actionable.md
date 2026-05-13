# Repo Audit Findings (Actionable)

Last updated: 2026-05-14  
Scope: actionable issues for fixing during development

Ghi chú theo yêu cầu:
- Không đưa vào danh sách fix: **#7, #8, #12** từ báo cáo trước.
- File này chỉ giữ các lỗi còn lại để theo dõi và xử lý.

## Cách dùng

- `Status`:
  - `TODO`: chưa xử lý
  - `IN_PROGRESS`: đang xử lý
  - `DONE`: đã xử lý xong và verify
- Sau khi fix mỗi mục:
  - cập nhật `Status`
  - thêm `Fix Note`
  - thêm `Verification`

---

## ~~1) CRITICAL - Gateway route sai cho payment/notification~~ `DONE`

- Status: `DONE`
- Vấn đề:
  - Gateway mount `/api/payments` và `/api/notifications` nhưng không mount `/api/v1/*` tương ứng.
  - `payment-service` và `notification-service` đang expose theo `/api/v1/*`.
- Tham chiếu:
  - [services/api-gateway/internal/router/router.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/api-gateway/internal/router/router.go:90)
  - [services/api-gateway/internal/router/router.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/api-gateway/internal/router/router.go:93)
  - [services/payment-service/internal/router/router.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/payment-service/internal/router/router.go:40)
  - [services/notification-service/internal/router/router.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/notification-service/internal/router/router.go:39)
- Hậu quả:
  - Request qua gateway có thể 404 dù service downstream hoạt động bình thường.
- Fix Note:
  - Added missing gateway mounts for `/api/v1/payments` and `/api/v1/notifications`.
- Verification:
  - Route map updated in `api-gateway/internal/router/router.go`; `go test ./...` in `services/api-gateway` passes.

---

## ~~2) CRITICAL - Gateway không nhất quán chuẩn `/api/v1`~~ `DONE`

- Status: `DONE`
- Vấn đề:
  - Nhiều route private trên gateway đang mount ở `/api/*`, không nhất quán với chuẩn `/api/v1`.
- Tham chiếu:
  - [docs/development/code-standards.md](/Users/maccuatruong/workspace/ecommerce-microservices/docs/development/code-standards.md:143)
  - [services/api-gateway/internal/router/router.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/api-gateway/internal/router/router.go:83)
- Hậu quả:
  - Contract API khó dự đoán, client/BFF dễ gọi nhầm version.
- Fix Note:
  - Added missing `/api/v1/*` mounts for `users`, `payments`, `inventory`, `shipping`, `notifications`, `analytics` in gateway.
- Verification:
  - Reviewed updated route declarations in `api-gateway/internal/router/router.go`.

---

## ~~3) HIGH - WS default URL ở frontend sai cổng local~~ `DONE`

- Status: `DONE`
- Vấn đề:
  - `NEXT_PUBLIC_CHAT_WS_BASE_URL` fallback về `http://localhost:8080`, lệch cổng gateway đang expose local.
- Tham chiếu:
  - [frontend/apps/buyer-web/src/app/chat/page.tsx](/Users/maccuatruong/workspace/ecommerce-microservices/frontend/apps/buyer-web/src/app/chat/page.tsx:20)
  - [frontend/apps/seller/src/app/customer-care/chat/page.tsx](/Users/maccuatruong/workspace/ecommerce-microservices/frontend/apps/seller/src/app/customer-care/chat/page.tsx:31)
  - [docker-compose.yml](/Users/maccuatruong/workspace/ecommerce-microservices/docker-compose.yml:599)
- Hậu quả:
  - WS fail connect khi dev không set env rõ ràng.
- Fix Note:
  - Changed fallback WS base URL from `http://localhost:8080` to `http://localhost:12000` for buyer-web and seller chat pages.
- Verification:
  - Confirmed both chat pages now default to gateway public port `12000`.

---

## ~~4) HIGH - Access token đi qua query string trên WebSocket~~ `DONE`

- Status: `DONE`
- Vấn đề:
  - FE gửi token qua query `?accessToken=...`.
  - BE chấp nhận token từ query.
- Tham chiếu:
  - [frontend/apps/buyer-web/src/app/chat/page.tsx](/Users/maccuatruong/workspace/ecommerce-microservices/frontend/apps/buyer-web/src/app/chat/page.tsx:173)
  - [frontend/apps/seller/src/app/customer-care/chat/page.tsx](/Users/maccuatruong/workspace/ecommerce-microservices/frontend/apps/seller/src/app/customer-care/chat/page.tsx:109)
  - [services/chat-service/internal/auth/jwt.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/chat-service/internal/auth/jwt.go:24)
- Hậu quả:
  - Rủi ro lộ token trong logs/history/traces.
- Fix Note:
  - Removed `accessToken` from WS query string in buyer/seller chat pages.
  - Added WS auth extraction from `Sec-WebSocket-Protocol` (`access-token.<jwt>`) in chat JWT middleware.
- Verification:
  - Chat pages now build WS URL with only `conversationId`.
  - `go test ./...` passes in `services/chat-service`.

---

## ~~5) HIGH - WebSocket `CheckOrigin` đang mở toàn bộ~~ `DONE`

- Status: `DONE`
- Vấn đề:
  - `CheckOrigin` luôn `return true`.
- Tham chiếu:
  - [services/chat-service/internal/handler/chat_handler.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/chat-service/internal/handler/chat_handler.go:162)
- Hậu quả:
  - Tăng bề mặt tấn công cross-origin WS.
- Fix Note:
  - Replaced permissive `CheckOrigin` with allowlist-based origin validation.
  - Added chat config `WS_ALLOWED_ORIGINS` with safe local defaults.
- Verification:
  - `chat-service` compiles/tests successfully with new origin check path.

---

## ~~6) HIGH - BFF frontend gọi trực tiếp từng service (lệch chuẩn qua gateway)~~ `DONE`

- Status: `DONE`
- Vấn đề:
  - BFF buyer/seller đang gọi thẳng service URLs thay vì đi qua gateway.
- Tham chiếu:
  - [docs/development/code-standards.md](/Users/maccuatruong/workspace/ecommerce-microservices/docs/development/code-standards.md:131)
  - [frontend/apps/buyer-web/src/lib/server/upstream-client.ts](/Users/maccuatruong/workspace/ecommerce-microservices/frontend/apps/buyer-web/src/lib/server/upstream-client.ts:1)
  - [frontend/apps/seller/src/lib/server/upstream-client.ts](/Users/maccuatruong/workspace/ecommerce-microservices/frontend/apps/seller/src/lib/server/upstream-client.ts:1)
- Hậu quả:
  - Auth/rate-limit/observability bị phân tán, khó governance.
- Fix Note:
  - Switched default upstream base in buyer/seller BFF to `API_GATEWAY_BASE_URL` (`http://localhost:12000/api/v1`).
  - Service-specific env vars still supported for overrides.
- Verification:
  - Verified updated upstream-client defaults in both buyer-web and seller apps.

---

## 9) MEDIUM - `auth/me` trả cờ bảo mật hardcode

- Status: `TODO`
- Vấn đề:
  - `isEmailVerified` và `mfaEnabled` không lấy từ source of truth, đang hardcode.
- Tham chiếu:
  - [frontend/apps/buyer-web/src/app/api/buyer/auth/me/route.ts](/Users/maccuatruong/workspace/ecommerce-microservices/frontend/apps/buyer-web/src/app/api/buyer/auth/me/route.ts:31)
  - [frontend/apps/seller/src/app/api/seller/auth/me/route.ts](/Users/maccuatruong/workspace/ecommerce-microservices/frontend/apps/seller/src/app/api/seller/auth/me/route.ts:37)
- Hậu quả:
  - UI và security flow có thể hiển thị sai trạng thái account.
- Fix Note:
  - TODO
- Verification:
  - TODO

---

## 10) MEDIUM - Test coverage thấp ở nhiều service

- Status: `TODO`
- Vấn đề:
  - Nhiều Go service chưa có test files.
  - `auth-service` test script pass nhưng không có test case thực tế.
- Tham chiếu:
  - [services/api-gateway/internal/middleware/timeout_test.go](/Users/maccuatruong/workspace/ecommerce-microservices/services/api-gateway/internal/middleware/timeout_test.go:1)
  - [services/auth-service/package.json](/Users/maccuatruong/workspace/ecommerce-microservices/services/auth-service/package.json:11)
- Hậu quả:
  - Dễ lọt regression routing/auth/event.
- Fix Note:
  - TODO
- Verification:
  - TODO

---

## 11) LOW - Lint pipeline NestJS chưa thật sự triển khai

- Status: `TODO`
- Vấn đề:
  - `lint` scripts hiện chỉ `echo`.
- Tham chiếu:
  - [services/auth-service/package.json](/Users/maccuatruong/workspace/ecommerce-microservices/services/auth-service/package.json:10)
  - [services/product-service/package.json](/Users/maccuatruong/workspace/ecommerce-microservices/services/product-service/package.json:14)
- Hậu quả:
  - Không có guardrail style/static checks trong CI.
- Fix Note:
  - TODO
- Verification:
  - TODO

---

## 13) LOW - Local config gateway dễ drift

- Status: `TODO`
- Vấn đề:
  - `.env` gateway local có `JWT_SECRET=change-me` và map URL/port khác profile compose hiện tại.
- Tham chiếu:
  - [services/api-gateway/.env](/Users/maccuatruong/workspace/ecommerce-microservices/services/api-gateway/.env:4)
  - [services/api-gateway/.env](/Users/maccuatruong/workspace/ecommerce-microservices/services/api-gateway/.env:12)
- Hậu quả:
  - Dễ phát sinh lỗi “chạy local bằng .env thì fail, chạy compose thì pass”.
- Fix Note:
  - TODO
- Verification:
  - TODO

---

## Priority xử lý đề xuất

1. #1 + #2 (gateway routing/versioning)
2. #3 + #4 + #5 (WS connectivity/security)
3. #6 + #9 (BFF architecture + auth identity correctness)
4. #10 + #11 + #13 (quality/maintainability)
