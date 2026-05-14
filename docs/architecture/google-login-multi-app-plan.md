# Google Login Plan (buyer-web, seller, moderator)

Last updated: 2026-05-14  
Scope: monorepo `ecommerce-microservices`

## 0) Quy ước đánh mốc cập nhật

- Mỗi khi hoàn thành một hạng mục, cập nhật ngay bảng ở mục `10)`:
- Đổi `Trạng thái`: `TODO` -> `IN_PROGRESS` -> `DONE` (hoặc `BLOCKED` nếu kẹt).
- Ghi rõ `Cập nhật gần nhất` theo ngày thực tế.
- Ghi 1 dòng ngắn ở cột `Ghi chú` mô tả đã làm gì.
- Đồng thời thêm 1 dòng vào `11) Change log` cho các thay đổi quan trọng.

## 1) Mục tiêu

- Thêm đăng nhập Google cho 3 app: `buyer-web`, `seller`, `moderator`.
- Giữ kiến trúc hiện tại: frontend app -> BFF route (Next API route) -> `auth-service`.
- Không phá flow email/password hiện có; Google login là nhánh bổ sung.

## 2) Hiện trạng đã xác nhận

- `auth-service` hiện có login/password + JWT + refresh token, chưa có OAuth endpoint.
- `users` table chưa có cột/provider cho social login.
- `buyer-web` và `seller` login page đã có nút `Google` nhưng chưa nối backend.
- `moderator` login page chưa có nút Google, hiện ưu tiên password + MFA.
- Cả 3 app đang lưu session ở `localStorage` qua `AppProvider`.

## 3) Quyết định kiến trúc (khuyến nghị)

Chọn mô hình `Backend OAuth Flow`:

1. User click "Google login" ở app.
2. App gọi route BFF nội bộ `/api/<app>/auth/google/start`.
3. BFF redirect tới `auth-service` endpoint authorize.
4. Google callback về `auth-service`.
5. `auth-service` xác thực, upsert user/link account, tạo session JWT như login thường.
6. `auth-service` redirect về BFF callback của app kèm `loginTicket` ngắn hạn (one-time).
7. BFF gọi `auth-service` để đổi `loginTicket` lấy `accessToken/refreshToken`, trả JSON cho frontend hoặc redirect trang callback xử lý lưu session.

Lý do:
- Không để Google client secret ở frontend.
- Dễ kiểm soát role-policy theo từng app.
- Tái sử dụng logic session hiện tại của `auth-service`.

## 4) Phạm vi dữ liệu cần thêm

Thêm bảng mới (ưu tiên) `oauth_accounts` trong `auth-service`:

- `id` (uuid)
- `user_id` (fk -> users.id)
- `provider` (`google`)
- `provider_user_id` (Google `sub`, unique theo provider)
- `provider_email`
- `provider_email_verified` (bool)
- `created_at`, `updated_at`

Ghi chú:
- Không sửa `users.email` uniqueness hiện tại.
- Cho phép 1 user có thể link nhiều provider trong tương lai.

## 5) Role policy theo app

| App | Role được phép Google login |
|---|---|
| `buyer-web` | `CUSTOMER` |
| `seller` | `SELLER`, `ADMIN`, `SUPER_ADMIN`, `SUPPORT` |
| `moderator` | `MODERATOR`, `ADMIN`, `SUPER_ADMIN` |

Rule:
- Role check ở cả `auth-service` (khi issue loginTicket) và BFF app (double-check).
- Nếu Google account chưa map role hợp lệ -> trả `403 FORBIDDEN` rõ lý do.

## 6) Kế hoạch triển khai theo phase

## Phase 0 - Prep & Config

Checklist:
- [ ] Tạo Google OAuth App (Web application).
- [ ] Khai báo redirect URIs:
  - [ ] Buyer callback URI
  - [ ] Seller callback URI
  - [ ] Moderator callback URI
  - [ ] Auth-service callback URI (nếu chọn callback tập trung tại auth-service)
- [ ] Thêm env cho `auth-service`:
  - [ ] `GOOGLE_OAUTH_CLIENT_ID`
  - [ ] `GOOGLE_OAUTH_CLIENT_SECRET`
  - [ ] `GOOGLE_OAUTH_REDIRECT_URI`
  - [ ] `GOOGLE_OAUTH_SCOPES` (mặc định: `openid email profile`)
  - [ ] `OAUTH_STATE_TTL_SECONDS`
  - [ ] `OAUTH_LOGIN_TICKET_TTL_SECONDS`
- [ ] Cập nhật `env.validation.ts` và `configuration.ts`.

## Phase 1 - Auth Service OAuth Core

Files chính dự kiến:
- `services/auth-service/src/modules/auth/controllers/auth.controller.ts`
- `services/auth-service/src/modules/auth/services/auth.service.ts`
- `services/auth-service/src/modules/auth/entities/*` (entity mới)
- `services/auth-service/migrations/*` (migration mới)
- `docs/api/auth-service-api.md`

Checklist:
- [ ] Thêm endpoint `GET /auth/oauth/google/authorize`.
- [ ] Thêm endpoint `GET /auth/oauth/google/callback`.
- [ ] Thêm endpoint `POST /auth/oauth/exchange-ticket`.
- [ ] Sinh + validate `state` (anti-CSRF), TTL bằng Redis.
- [ ] Exchange `authorization_code` với Google token endpoint.
- [ ] Verify `id_token` (issuer, audience, exp, email_verified).
- [ ] Upsert `oauth_accounts`, link với `users`.
- [ ] Nếu user mới:
  - [ ] Tạo `users` với `is_email_verified=true` khi `email_verified=true`.
  - [ ] Gán role mặc định theo `app`: buyer -> `CUSTOMER`; seller/moderator cần pre-provision hoặc deny.
- [ ] Issue `loginTicket` one-time và redirect về app callback.
- [ ] Endpoint `exchange-ticket` trả payload giống login cũ (`accessToken`, `refreshToken`, `sessionId`, `user`).

## Phase 2 - buyer-web Integration

Files chính dự kiến:
- `frontend/apps/buyer-web/src/app/login/page.tsx`
- `frontend/apps/buyer-web/src/app/api/buyer/auth/*` (thêm routes google)
- `frontend/apps/buyer-web/src/providers/AppProvider.tsx`

Checklist:
- [ ] Nút `Google` gọi `/api/buyer/auth/google/start?returnUrl=...`.
- [ ] Thêm route `GET /api/buyer/auth/google/start`.
- [ ] Thêm route `GET /api/buyer/auth/google/callback`.
- [ ] Callback route đổi `loginTicket` -> lưu session (theo cơ chế app đang dùng).
- [ ] Redirect user về `returnUrl` hoặc `/account`.
- [ ] Xử lý lỗi user-facing: cancel consent, role invalid, account blocked.

## Phase 3 - seller Integration

Files chính dự kiến:
- `frontend/apps/seller/src/app/login/page.tsx`
- `frontend/apps/seller/src/app/api/seller/auth/*` (thêm routes google)
- `frontend/apps/seller/src/providers/AppProvider.tsx`

Checklist:
- [ ] Nút `Google` gọi `/api/seller/auth/google/start`.
- [ ] Thêm `start` + `callback` routes tương tự buyer.
- [ ] Giữ role-gate seller hiện có ở BFF.
- [ ] Nếu account Google chưa có role seller hợp lệ -> thông báo hướng dẫn liên hệ admin.

## Phase 4 - moderator Integration

Files chính dự kiến:
- `frontend/apps/moderator/src/app/login/page.tsx`
- `frontend/apps/moderator/src/app/api/moderator/auth/*` (thêm routes google)
- `frontend/apps/moderator/src/providers/AppProvider.tsx`

Checklist:
- [ ] Quyết định bật Google cho moderator ngay hay phase sau (khuyến nghị phase sau nếu muốn giữ MFA bắt buộc).
- [ ] Nếu bật ngay:
  - [ ] Thêm nút `Google Workspace` (hoặc thay nút SSO hiện tại).
  - [ ] Chỉ cho domain công ty (vd: `@yourcompany.com`) nếu cần compliance.
  - [ ] Sau Google login vẫn enforce MFA step-up cho role nhạy cảm.

## Phase 5 - Security, Test, Rollout

Checklist:
- [ ] Rate-limit authorize/callback/exchange-ticket.
- [ ] One-time ticket: single-use + short TTL + revoke sau khi exchange.
- [ ] Chặn open redirect: allowlist `returnUrl`.
- [ ] Audit log event mới:
  - [ ] `auth.google.login.succeeded`
  - [ ] `auth.google.login.failed`
  - [ ] `auth.google.account.linked`
- [ ] Unit test service OAuth paths.
- [ ] Integration test BFF callback cho 3 app.
- [ ] Smoke test manual với Google test users.

## 7) Test strategy (theo ladder repo này)

L0:
- Unit test parser/state/ticket/role-check.

L1:
- `npm --workspace services/auth-service run test`
- `npm --workspace services/auth-service run build`
- `npm --workspace frontend/apps/buyer-web run lint` (nếu có script)
- `npm --workspace frontend/apps/seller run lint` (nếu có script)
- `npm --workspace frontend/apps/moderator run lint` (nếu có script)

L2:
- Smoke OAuth login từng app ở local/staging.
- Verify session persistence sau reload + logout.

## 8) Rủi ro & cách chặn

| Rủi ro | Tác động | Cách chặn |
|---|---|---|
| Callback URI cấu hình sai | Login fail toàn bộ | Kiểm tra env + runbook verify trước deploy |
| Account takeover qua email trùng | Security high | Chỉ auto-link khi email verified + policy rõ ràng |
| Seller/Moderator tự tạo account qua Google | Sai phân quyền | Bắt buộc pre-provision role hoặc deny |
| Token lộ qua URL | Security high | Chỉ truyền `loginTicket` one-time, không truyền JWT trực tiếp |
| Open redirect qua `returnUrl` | Phishing risk | Allowlist path nội bộ bắt đầu bằng `/` |

## 9) Definition of Done

- `buyer-web` login Google chạy end-to-end production-like.
- `seller` login Google chạy end-to-end với role gate đúng.
- `moderator` đã có quyết định rõ: bật hoặc hoãn, có checklist tương ứng.
- Tất cả login path mới có audit log và test tối thiểu L1 + smoke.
- Không regression login/password cũ.

## 10) Bảng theo dõi tiến độ (cập nhật mỗi ngày)

| ID | Hạng mục | Owner | Trạng thái | Bắt đầu | Cập nhật gần nhất | Ghi chú |
|---|---|---|---|---|---|---|
| GGL-01 | Google OAuth app + redirect URIs |  | TODO |  | 2026-05-14 | Chưa tạo OAuth app trên Google Cloud Console |
| GGL-02 | Env + validation cho auth-service | Codex | DONE | 2026-05-14 | 2026-05-14 | Đã thêm env validation + config mapping OAuth |
| GGL-03 | Migration `oauth_accounts` | Codex | DONE | 2026-05-14 | 2026-05-14 | Đã thêm migration `0002_add_oauth_accounts.sql` |
| GGL-04 | Auth endpoints authorize/callback/exchange | Codex | DONE | 2026-05-14 | 2026-05-14 | Đã implement endpoint + logic Redis state/ticket |
| GGL-05 | Buyer-web BFF start/callback | Codex | DONE | 2026-05-14 | 2026-05-14 | Đã thêm route start/callback |
| GGL-06 | Buyer-web login UI integration | Codex | DONE | 2026-05-14 | 2026-05-14 | Nút Google đã gọi flow OAuth |
| GGL-07 | Seller BFF start/callback | Codex | DONE | 2026-05-14 | 2026-05-14 | Đã thêm route start/callback + role check |
| GGL-08 | Seller login UI integration | Codex | DONE | 2026-05-14 | 2026-05-14 | Nút Google đã gọi flow OAuth |
| GGL-09 | Moderator strategy decision (enable/hold) | Codex | DONE | 2026-05-14 | 2026-05-14 | Đã chọn enable với role gate hiện tại |
| GGL-10 | Moderator implementation (nếu enable) | Codex | DONE | 2026-05-14 | 2026-05-14 | Đã thêm flow Google cho moderator |
| GGL-11 | Security hardening + audit logs | Codex | IN_PROGRESS | 2026-05-14 | 2026-05-14 | Đã có state/ticket one-time + callback/returnUrl validation |
| GGL-12 | Test L1/L2 + smoke report | Codex | IN_PROGRESS | 2026-05-14 | 2026-05-14 | Đã chạy build/test một phần, còn pending smoke OAuth thật |

Legend trạng thái: `TODO` | `IN_PROGRESS` | `BLOCKED` | `DONE`

## 11) Change log (để không quên đã đổi gì)

| Date | Author | Hạng mục | Thay đổi | Link PR/Commit | Note |
|---|---|---|---|---|---|
| 2026-05-14 |  | INIT | Tạo plan Google Login cho 3 app |  |  |
| 2026-05-14 | Codex | Implementation | Implement OAuth core + buyer/seller/moderator integration + docs update |  | Cần set env thật và tạo Google OAuth app để chạy E2E |
