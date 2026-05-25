# Buyer Mobile Feature Parity & Mobile Commerce UI Plan

## Mục tiêu

Xây dựng `frontend/apps/buyer-mobile` thành ứng dụng mua hàng mobile production độc lập, có đầy đủ chức năng đang hoạt động trên `frontend/apps/buyer-web`, sử dụng nền tảng API công khai ổn định của hệ thống thay vì phụ thuộc vào implementation Next.js của web. Trải nghiệm được thiết kế theo chuẩn mobile commerce hiện đại, lấy cảm hứng từ các pattern của ứng dụng Shopee Việt Nam nhưng giữ thương hiệu `eMall` riêng.

Plan này thay thế góc nhìn "chỉ kiểm thử video/live" bằng lộ trình hoàn chỉnh cho buyer app. Tài liệu `buyer-mobile-video-live-playback-plan.md` vẫn được dùng như plan con cho phần playback.

## Nguyên tắc thiết kế

- Giữ thương hiệu `eMall`/`DT Commerce`, màu sắc, nội dung và tài sản riêng của dự án; không sao chép logo, icon hoặc màn hình Shopee.
- Học các pattern phù hợp với mobile commerce: thanh tìm kiếm nổi bật, deal/category trên trang chủ, lưới sản phẩm hai cột, điều hướng tab dưới, mua nhanh ở product detail, đơn hàng theo trạng thái, video/live shopping.
- Feature parity được xác định theo code đang chạy trong `buyer-web`, không theo menu placeholder hoặc ý tưởng chưa có API.
- Mobile dùng API production đã deploy; các biến môi trường local chỉ chứa URL public, không chứa secret.
- Kiến trúc đích phải phục vụ được cả web và mobile bằng contract dùng chung; BFF web hiện tại chỉ là nguồn tham khảo/migration, không phải dependency dài hạn của app native.

## Nguồn khảo sát

### Source code nội bộ

- Routes web: `frontend/apps/buyer-web/src/app/**/page.tsx`
- BFF routes web: `frontend/apps/buyer-web/src/app/api/buyer/**`
- Client/API types: `frontend/apps/buyer-web/src/lib/api/*`
- Auth, cart, locale state: `frontend/apps/buyer-web/src/providers/AppProvider.tsx`
- Baseline mobile trước Phase 0-3: `frontend/apps/buyer-mobile/App.tsx` và `src/domain/remote-api.ts`; đã được thay bằng Expo Router shell tại checkpoint triển khai bên dưới.

### Tham khảo sản phẩm mobile

- Google Play chính thức: `https://play.google.com/store/apps/details?gl=VN&id=com.shopee.vn`
- App Store chính thức: `https://apps.apple.com/vn/app/shopee-mua-s%E1%BA%AFm-online/id959841449`

Tại thời điểm khảo sát ngày 25/05/2026, mô tả chính thức của Shopee xác nhận các trục trải nghiệm liên quan trực tiếp đến dự án: hot deals, mua sắm mobile, theo dõi khuyến mãi, Shopee Live và Shopee Video. Plan chỉ suy ra pattern sản phẩm từ các trục này và giao diện marketplace hiện có của `buyer-web`.

## Trạng thái hiện tại

### Buyer web đã có

| Khu vực | Route web | Chức năng đang có |
| --- | --- | --- |
| Trang chủ | `/` | Category, video highlights, flash sale, mall, top search, recommendations |
| Tìm kiếm | `/search` | Query, sort, pagination, product grid |
| Chi tiết sản phẩm | `/products/[productId]` | Gallery, variant, quantity, cart/buy now, shop, recommendation, review |
| Gian hàng | `/shops/[sellerId]` | Banner/logo/decor, danh sách sản phẩm shop |
| Giỏ hàng | `/cart` | Chọn item, số lượng, đổi variant, recommendation, checkout |
| Thanh toán | `/checkout` | Địa chỉ nhận hàng, COD/online intent, tạo order |
| Đơn mua | `/orders` | Tab trạng thái, payment/shipment status, hủy, xác nhận nhận hàng, mua lại |
| Chi tiết đơn | `/orders/[orderId]` | Items, tổng tiền, payment, shipping, status history, tracking events |
| Đăng nhập/đăng ký | `/login`, `/register` | Email/password, Google OAuth trên web, return URL |
| Hồ sơ | `/account` | Cập nhật profile, avatar URL, giới tính, ngày sinh, logout |
| Chat | `/chat` và drawer toàn cục | Conversation, message, unread, realtime WS và polling fallback |
| Video | `/videos` | Video feed, view events, like local, share, comments, tagged products, recommendation |
| Live | `/live`, `/live/[sessionId]` | Session list, livestream detail, pinned products, chat, metrics, WebRTC/WHEP |

### Buyer mobile hiện có

| Hạng mục | Trạng thái |
| --- | --- |
| Expo app khởi động | Có entrypoint `App.tsx`, yêu cầu Node `>=20.19.4` |
| Production connection | Có gọi trực tiếp `/products`, `/videos/feed`, `/live/sessions` |
| Video player | Có preview cơ bản bằng `expo-video` |
| Live player | Có fallback; chưa phát được stream WebRTC/WHEP production |
| Media URL normalization | Có sửa URL media trả về `localhost` sang public API host |
| Navigation/screens | Chưa có |
| Auth/cart/order/chat/profile | Chưa có |
| Contract tương thích buyer-web BFF | Chưa có |

## Phát hiện kiến trúc quan trọng

`buyer-web` không chỉ render UI từ API gateway. Nhiều API client gọi các Next BFF routes dưới `/api/buyer/*`, và BFF thực hiện logic cần giữ đồng nhất trên mobile:

| BFF area | Logic đáng chú ý |
| --- | --- |
| `/api/buyer/home` | Ghép home sections từ products, tính discount, category, top search, mall và recommendation display data |
| `/api/buyer/products/*` | Chuẩn hóa product detail/search payload, price, images, variants và seller code |
| `/api/buyer/shops/*` | Gọi shop decor và chuẩn hóa seller code |
| `/api/buyer/reviews` | Kiểm tra quyền/order delivered trước khi tạo review |
| `/api/buyer/auth/google/*` | OAuth start/callback, exchange login ticket rồi lưu session vào `localStorage` của web |
| Chat/order/payment/shipping/live/video | Proxy gateway/service với policy, error shape và normalization riêng |

Mobile không thể đạt parity bằng cách chỉ gọi các route gateway đang có cho mọi màn hình. Direct gateway đủ cho smoke test hiện tại, nhưng home/product/review/OAuth sẽ lệch hành vi web. Tuy nhiên, gắn app native lâu dài vào server Next của `buyer-web` cũng không đúng boundary: logic buyer-facing cần được đưa vào API/service contract độc lập.

## Target Architecture Dài Hạn

### Quyết định kiến trúc

Tạo lớp `buyer-experience` public API dành cho các client buyer. Đây có thể là module trong `api-gateway` giai đoạn đầu hoặc service riêng khi khối lượng orchestration tăng; điều quan trọng là contract không thuộc sở hữu của Next.js frontend.

| Lớp | Trách nhiệm dài hạn | Không chịu trách nhiệm |
| --- | --- | --- |
| `buyer-experience` API | Home composition, catalog DTO, cart recommendation, review eligibility, client-friendly error/metadata | Render UI, lưu session theo platform |
| Domain services | Auth, product, order, payment, shipping, chat, video, live business logic | Ghép payload theo layout app |
| API Gateway/Ingress | Public routing, auth enforcement, rate limit, TLS, observability | Business transformation lớn |
| Web client | Render web, web OAuth callback bridge trong giai đoạn migration | Cung cấp API chính thức cho native |
| Mobile client | Native UI, secure token persistence, cache/offline state, deep links | Tái hiện orchestration backend từ web |

Endpoint đích được version hóa:

```text
https://api.dt-commerce.site/api/v1/buyer-experience/...
wss://api.dt-commerce.site/api/v1/chat/ws
wss://api.dt-commerce.site/api/v1/live/ws
https://api.dt-commerce.site/ecommerce-media/...
```

`buyer-web` được migrate sang contract này sau khi parity tests pass; các Next BFF route hiện tại có thể giữ adapter tạm trong giai đoạn chuyển đổi rồi xóa dần.

### Contract ownership và shared package

Tạo package contract không phụ thuộc React/Next/Expo:

```text
frontend/packages/buyer-contracts/
  src/
    envelope.ts
    auth.ts
    catalog.ts
    commerce.ts
    engagement.ts
    realtime.ts
    index.ts
```

Contract package định nghĩa DTO, enum, request schema và error code client-facing; backend phải có contract tests tương ứng. Các hàm format UI, cache hoặc navigation không đặt trong package này.

### API capability map đích

| Capability | Public endpoint đích | Ghi chú contract |
| --- | --- | --- |
| Home | `GET /buyer-experience/home` | Trả sections đã compose, placement IDs, tracking metadata |
| Search/catalog | `GET /buyer-experience/products` | Search/filter/sort/cursor; DTO cùng web/mobile |
| Product detail | `GET /buyer-experience/products/:id` | Variant, shop preview, review summary, recommendations |
| Shop | `GET /buyer-experience/shops/:sellerId` | Decor, metrics thực, catalog cursor |
| Cart recommendation | `POST /buyer-experience/recommendations/cart` | Auth optional/required được quy định rõ |
| Auth session | `/auth/*` | Login/register/refresh/logout/me; refresh lifecycle mobile |
| OAuth mobile | `/auth/oauth/google/*` | PKCE/state/ticket + app redirect allowlist |
| Profile | `/buyer-experience/profile` | Get/update buyer profile |
| Checkout/order | `/buyer-experience/orders/*`, `/buyer-experience/payments/*` | Idempotency, payment action URL/deep link |
| Shipment | `/buyer-experience/shipments/*` | Tracking timeline normalized |
| Review | `/buyer-experience/reviews/*` | Server kiểm review eligibility |
| Chat | `/buyer-experience/chat/*` + WS | Conversation/message/read/unread |
| Video | `/buyer-experience/videos/*` | Feed, comments, commerce events |
| Live | `/buyer-experience/live/*` + WS/media | Session, product pins, messages, metrics, playback capability |

### API envelope và client behavior

Mọi API mobile-facing trả envelope thống nhất:

```ts
interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
    pagination?: { cursor?: string; nextCursor?: string | null };
  };
}

interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    fieldErrors?: Record<string, string>;
  };
  meta: { requestId: string; timestamp: string };
}
```

- Listing feed dài ưu tiên cursor pagination để không lệch dữ liệu khi refresh.
- Mutation tạo order/payment/message/event phải hỗ trợ idempotency/client event ID.
- Media payload chỉ trả URL public; không trả `localhost` rồi yêu cầu client chữa dữ liệu ở production.
- API lỗi auth phải phân biệt token hết hạn, refresh thất bại và forbidden role.

### Giai đoạn chuyển đổi khỏi BFF web

| Bước | Backend/web | Mobile | Điều kiện rời bước |
| --- | --- | --- | --- |
| A. Baseline | Snapshot response của `/api/buyer/*` hiện có | Không mở rộng feature | Có fixture/contract test cho các flow web |
| B. Buyer API v1 | Implement `/api/v1/buyer-experience/*` dựa trên logic đã xác nhận | Client API mới gọi endpoints v1 | Contract tests và smoke production pass |
| C. Dual run | Web gọi adapter hoặc API v1; so sánh payload | Build commerce core | Không có mismatch blocking |
| D. Cutover | Web/mobile đều dùng API v1 | Phát hành beta mobile | Monitoring ổn định |
| E. Cleanup | Bỏ orchestration Next không còn dùng | Release production | Runbook/rollout hoàn chỉnh |

### Cấu hình mobile production

App chỉ cần các public URLs và app identity:

```env
EXPO_PUBLIC_BUYER_API_BASE_URL=https://api.dt-commerce.site/api/v1/buyer-experience
EXPO_PUBLIC_AUTH_API_BASE_URL=https://api.dt-commerce.site/api/v1/auth
EXPO_PUBLIC_MEDIA_ORIGIN=https://api.dt-commerce.site
EXPO_PUBLIC_CHAT_WS_URL=wss://api.dt-commerce.site/api/v1/chat/ws
EXPO_PUBLIC_LIVE_WS_URL=wss://api.dt-commerce.site/api/v1/live/ws
EXPO_PUBLIC_APP_SCHEME=dtcommercebuyer
```

Không đặt secret OAuth, payment key hoặc service credential vào biến `EXPO_PUBLIC_*`.

### OAuth mobile bắt buộc thiết kế riêng

Callback web hiện tạo HTML bridge ghi token vào `localStorage`; luồng này không thể làm session native ổn định. Mobile cần:

1. App tạo `state`, PKCE verifier/challenge và redirect URI cho native session.
2. Mở Google OAuth bằng `expo-auth-session`/system browser; không nhúng credential vào WebView.
3. Auth service chỉ redirect về URI đã allowlist, ví dụ `dtcommercebuyer://auth/google/callback` hoặc universal link production.
4. App exchange authorization result hoặc one-time login ticket cùng PKCE verifier để lấy access/refresh token.
5. Access token giữ trong memory; refresh token lưu trong `expo-secure-store`, rotate/revoke khi logout.
6. Điều hướng về màn hình trước khi login bằng route state đã validate, không nhận arbitrary external URL.
7. Backend audit success/failure và rate limit authorize/exchange.

### Realtime, media và offline boundary

| Concern | Quyết định dài hạn |
| --- | --- |
| Chat realtime | WS có auth handshake, sequence ID, reconnect exponential backoff và catch-up REST |
| Live state | WS chỉ mang event/state/chat; media protocol được khai báo bằng capability trong session payload |
| Video assets | CDN/public media URL, adaptive format khi backend hỗ trợ; preload một item kế tiếp |
| Live playback | Backend cung cấp HLS/LL-HLS cho mobile hoặc có native WebRTC strategy được chứng minh trên device |
| Offline | Cache read-only home/catalog/product; không giả lập checkout/payment khi offline |
| Cart | Local-first giai đoạn đầu, chuẩn bị API cart sync theo user/device trong roadmap sau parity |

### Security và observability

- Không log token, authorization header, OAuth ticket hoặc dữ liệu payment nhạy cảm trên app.
- Certificate/TLS bắt buộc ở production; không dùng tùy chọn bỏ kiểm tra TLS trong app.
- API requests gắn `requestId`, app version, platform và anonymous device/session analytics ID.
- Crash/error reporting redaction trước khi release; theo dõi API error rate, login funnel, checkout conversion, video playback errors và live startup time.

## Kiến trúc mobile đích

### Công nghệ

| Concern | Lựa chọn đề xuất |
| --- | --- |
| Navigation | Expo Router với tabs + nested stacks và deep linking |
| Server state | TanStack Query để cache/refetch/pagination/mutation |
| Auth tokens | `expo-secure-store` |
| Cart và locale | Store local persist qua `AsyncStorage`, có version/migration; chuẩn bị cart sync API |
| Network client | `src/api/client.ts` gọi Buyer Experience API/Auth API, xử lý refresh/error chung |
| Types | `frontend/packages/buyer-contracts`, dùng chung bởi API adapter, web và mobile |
| Images | `expo-image` + URL normalization |
| Video | `expo-video` |
| Chat/live realtime | Native `WebSocket`, reconnect/backoff và REST fallback |
| Live playback | Spike riêng cho WebRTC/WHEP; không coi fallback thumbnail là hoàn tất parity |
| Forms | React Hook Form + schema validation dùng chung với contract khi phù hợp |
| Analytics | Dispatcher không chặn UI, retry giới hạn và mặc định redaction |

### Module boundaries

```text
UI screen -> feature hook/view model -> API/query/store -> buyer contract -> public API
                                      -> telemetry client -> analytics API
Realtime event -> socket manager -> query/store reconciliation -> UI screen
```

| Module | Ownership | Ví dụ |
| --- | --- | --- |
| `app/` | Route composition, navigation params, guards | `(tabs)/index.tsx`, `products/[productId].tsx` |
| `src/features/` | Use case theo domain và view model | `checkout/use-submit-order.ts`, `video/use-feed.ts` |
| `src/api/` | Typed HTTP clients/query keys | `products.ts`, `orders.ts`, `auth.ts` |
| `src/stores/` | Persistent device state | cart, auth bootstrap, settings |
| `src/components/` | Reusable visual components | product tile, sticky CTA, empty state |
| `src/realtime/` | WS lifecycle/event reconciliation | chat socket, live socket |
| `src/telemetry/` | Screen/event/error analytics | commerce events, playback metrics |
| `buyer-contracts` | Shared client/server types | product/order/live DTOs |

### State ownership

| State | Source of truth | Cache/persistence | Rule |
| --- | --- | --- | --- |
| Auth refresh token | Auth service | SecureStore | Xóa ngay khi refresh/revoke thất bại |
| User profile | Buyer Experience API | Query cache | Mutation success cập nhật cache |
| Catalog/product | Buyer Experience API | Query cache, stale-time ngắn | Cho đọc cache khi mạng yếu |
| Cart trước sync API | Device store | AsyncStorage | Versioned migration, không chứa token |
| Orders/payment/shipping | Buyer Experience API | Query cache | Refetch sau mutation hoặc foreground |
| Chat messages | Chat service/WS sequence | Memory + paged REST | Dedupe theo message ID/client ID |
| Live/video media state | Playback engine | Memory | Cleanup khi route mất focus |
| UI preference/locale | Device | AsyncStorage | Không phụ thuộc auth |

### Route map đề xuất

```text
app/
  _layout.tsx
  (auth)/
    login.tsx
    register.tsx
    oauth-callback.tsx
  (tabs)/
    _layout.tsx
    index.tsx                 # Home
    video.tsx                 # Shoppable video feed
    live.tsx                  # Live sessions
    chat.tsx                  # Conversation list / selected chat
    account.tsx               # Profile hub
  search.tsx
  products/[productId].tsx
  shops/[sellerId].tsx
  cart.tsx
  checkout.tsx
  orders/index.tsx
  orders/[orderId].tsx
  live/[sessionId].tsx
```

Tab dưới ưu tiên hành vi đã có thật trên web:

| Tab | Nội dung |
| --- | --- |
| Trang chủ | Discovery, search entry, cart badge |
| Video | Shoppable short-video feed |
| Live | Livestream discovery |
| Chat | Buyer-seller conversation, yêu cầu đăng nhập |
| Tôi | Profile và entry points vào orders/auth |

Thông báo, voucher, xu và game chỉ hiển thị khi có backend/luồng thực; không tạo nút chết để giống app tham khảo.

## Ma trận feature parity

| Domain | Mobile screen/behavior | API/contract | Ưu tiên |
| --- | --- | --- | --- |
| Bootstrap | Environment, error boundary, offline/retry, token restore | Config + health | P0 |
| Auth | Login, register, logout, guarded route, Google login native | Auth + OAuth ticket exchange | P0 |
| Home | Search bar, categories, deal blocks, mall/top search, product recommendation, video/live entry | Buyer Experience home/videos/live | P0 |
| Product search | Keyword, sort sheet, pagination/infinite list, loading/error/empty | Buyer Experience products | P0 |
| Product detail | Gallery, variant, stock, quantity, add cart, buy now | Buyer Experience product detail | P0 |
| Cart | Persist cart, select/edit/remove, change variant, subtotal, recommendations | Local store + product/cart recommendations | P0 |
| Checkout | Delivery form, COD/online, idempotent order submission | Orders/payments | P0 |
| Orders | Status tabs, detail, cancel, received, buy again | Orders/payment/shipping | P0 |
| Account | Profile load/edit, avatar, locale, logout | Profile/auth | P1 |
| Shop | Shop header/decor, catalog, entry from detail/video | Shop decor/products | P1 |
| Reviews | Summary/list/filter, create after delivered order | Reviews + orders | P1 |
| Chat | List, unread, message send/read, WS/poll fallback, entry from product | Chat REST/WS | P1 |
| Video | Vertical full-screen feed, products, comments, events, like/share | Video + recommendations | P1 |
| Live | Listing, session, products, messages, metrics, actual playback | Live REST/WS/media | P1, playback spike required |
| Locale | VI/EN strings reused consistently | Local state | P2 |

## UI Design Plan

### Design intent

Thiết kế tham khảo nhịp sử dụng quen thuộc của ứng dụng marketplace như Shopee: tìm kiếm và khám phá nhanh ở home, giá/khuyến mãi nổi bật, đường mua hàng ngắn, nội dung video/live kết nối trực tiếp tới sản phẩm. Thiết kế cuối cùng phải là hệ thống `eMall`, không dùng tên, logo, illustration hoặc component sao chép từ Shopee.

Mục tiêu trải nghiệm:

| Goal | Chỉ số chấp nhận ban đầu |
| --- | --- |
| Tìm sản phẩm nhanh | Search có thể chạm trong một lần từ mọi tab commerce chính |
| Mua hàng ít bước | Từ product detail tới submit checkout không quá 3 màn hình |
| Trạng thái rõ | Loading/error/empty/offline/auth-required luôn có UI cụ thể |
| Media-commerce liền mạch | Từ video/live mở product sheet/detail trong một thao tác |
| Thao tác một tay | CTA chính và bottom navigation nằm trong vùng dưới màn hình |
| Hiệu năng cảm nhận | Skeleton xuất hiện tức thời; không để màn hình trắng khi fetch |

### Information architecture

#### Primary navigation

Bottom tab gồm 5 tab cố định:

| Tab | Icon concept | Landing content | Badge |
| --- | --- | --- | --- |
| Trang chủ | Home outline/filled | Discovery feed và search | Không |
| Video | Play rounded | Vertical shoppable feed | Không |
| Live | Broadcast dot | Live listing | Chấm đỏ khi có live active, nếu API hỗ trợ |
| Chat | Bubble | Conversations | Tổng unread buyer |
| Tôi | Person | Account hub/orders | Không |

Quy tắc navigation:

- Tab bar cao `56` cộng safe-area bottom; ẩn ở video/live detail full-screen khi controls cần toàn bộ không gian.
- Cart không chiếm tab; cart icon/badge nằm ở header home/search/product và có route global.
- Back action luôn bảo toàn context: từ product mở qua video/live quay lại media session, từ checkout quay lại cart.
- Auth guard lưu `returnRoute` dạng internal route object đã validate; login thành công quay lại intent trước đó.
- Deep link hỗ trợ product, shop, video item, live session, order detail và OAuth callback.

#### Main shopping journeys

```text
Khám phá: Home -> Search/List -> Product -> Cart -> Checkout -> Order Success -> Orders
Nội dung: Video/Live -> Product Sheet -> Product Detail/Buy Now -> Checkout
Hậu mua: Tôi -> Orders -> Order Detail -> Confirm Received -> Review
Hỗ trợ: Product/Order -> Chat with Seller -> Conversation
```

### Layout system

#### Screen frame

| Element | Phone portrait | Tablet/large screen |
| --- | --- | --- |
| Content max width | Full width | Tối đa `720`, căn giữa; chat có split view |
| Horizontal gutter | `12` ở compact, `16` từ `390px` | `24` |
| Header standard | `52` + safe-area top | `56` + safe-area |
| Sticky bottom action | `64` + safe-area bottom | `72` |
| Bottom tab | `56` + safe-area bottom | `64` hoặc side rail khi có yêu cầu tablet |
| Grid gap | `8` hoặc `12` | `16` |

#### Density rules

- Product list ưu tiên hai cột trên phone; title tối đa hai dòng, giá luôn thấy không cần expand.
- Nội dung dài như description/review/chat được cuộn riêng hoặc xếp dưới fold, không nén CTA.
- Sheet chọn variant, sort, product-in-video và comments dùng snap points `40%`, `75%`, `92%` tùy nội dung.
- Tất cả CTA chạm được có vùng chạm tối thiểu `44x44`; icon nhỏ vẫn có hit slop.

### Design tokens

#### Color tokens

| Token | Value | Role |
| --- | --- | --- |
| `brand.50` | `#fff2ee` | Selected/filter background |
| `brand.100` | `#ffe2d9` | Badge/pressed soft |
| `brand.500` | `#ef5127` | Primary CTA, active tab, price |
| `brand.600` | `#dc3f17` | Pressed CTA |
| `brand.700` | `#bc2f10` | Text highlight on light background |
| `live.500` | `#e11d48` | LIVE badge/status only |
| `success.500` | `#16a34a` | Completed/received/success |
| `warning.500` | `#d97706` | Pending/payment attention |
| `danger.500` | `#dc2626` | Validation/destructive error |
| `surface.page` | `#f5f5f5` | Commerce background |
| `surface.card` | `#ffffff` | Cards/header/sheets |
| `surface.media` | `#090b10` | Video/live background |
| `text.primary` | `#111827` | Heading/body primary |
| `text.secondary` | `#667085` | Supporting/meta |
| `text.disabled` | `#98a2b3` | Disabled/hint |
| `border.default` | `#e5e7eb` | Divider/card outline |

#### Typography tokens

| Token | Size/line height | Weight | Usage |
| --- | --- | --- | --- |
| `display` | `28/34` | `700` | Campaign/header limited use |
| `title.lg` | `22/28` | `700` | Screen title, product price |
| `title.md` | `18/24` | `700` | Section title, dialog title |
| `title.sm` | `16/22` | `600` | Card/title/action |
| `body` | `14/20` | `400` | General copy |
| `body.strong` | `14/20` | `600` | Price metadata/action |
| `caption` | `12/16` | `400/600` | Badge, sold, timestamp |
| `micro` | `10/12` | `600` | Count badges only |

Số tiền dùng tabular numerals khi font hỗ trợ; không dùng kích thước dưới `12` cho nội dung thiết yếu.

#### Shape, spacing, elevation and motion

| Group | Tokens | Usage |
| --- | --- | --- |
| Spacing | `4, 8, 12, 16, 20, 24, 32` | Giữ rhythm nhất quán |
| Radius | `8` control, `12` card, `16` section, `24` sheet/media card, `999` pill | Shapes |
| Border | `1px` default, `2px` focused/selected | Selected state phải có thêm màu/icon |
| Elevation | `none`, `card`, `sticky`, `sheet`, `modal` | Không shadow dày trong product grid |
| Motion | `120ms` press, `180ms` sheet/filter, `240ms` navigation | Tắt/reduce khi OS reduce motion |

### Core component inventory

| Component | Variants/states | Screens |
| --- | --- | --- |
| `AppHeader` | transparent-media, brand-search, plain-back | Home, product, cart, media |
| `SearchPill` | idle, focused, results | Home/search |
| `IconBadgeButton` | cart/unread/notification, pressed | Headers/tabs |
| `BottomTabBar` | active/inactive/badge/hidden | Main routes |
| `ProductTile` | standard, discount, sponsored-reserved | Home/search/shop/recommendations |
| `ProductRow` | cart/order/live pinned | Cart/orders/live sheets |
| `PriceBlock` | price, compare price, discount badge | Product/cards/cart |
| `VariantChip` | available/selected/out-of-stock | Detail/cart sheet |
| `QuantityStepper` | min/max/disabled | Detail/cart |
| `PrimaryButton` | enabled/loading/disabled/destructive | All mutations |
| `StickyActionBar` | cart-buy, checkout-submit, order-actions | Detail/cart/checkout |
| `SectionHeader` | title/action/count | Home/detail |
| `StatusChip` | pending/shipping/delivered/error/live | Orders/live |
| `EmptyState` | no-data/offline/auth-required/error | All fetch screens |
| `Skeleton` | tile/detail/list/media | All async screens |
| `BottomSheet` | snap points/keyboard safe | Sort/variant/product/comment |
| `Toast/Banner` | success/warn/error/offline | App shell |

Component rules:

- Một component luôn có loading/disabled/error behavior xác định nếu tham gia mutation.
- Không dùng màu đơn độc để biểu thị trạng thái; kết hợp label/icon.
- Mỗi tile/card có pressed state và accessibility label chứa tên, giá và discount nếu có.

### Global states

| State | Presentation | Action |
| --- | --- | --- |
| Initial loading | Skeleton theo layout thật | Không hiện spinner toàn màn hình trừ auth bootstrap |
| Pull refresh | Native refresh indicator màu brand | Giữ dữ liệu cũ trong lúc fetch |
| Fetch error | Inline error card trong khu vực lỗi | `Thử lại` |
| Offline với cache | Banner offline + dữ liệu cache | Disable checkout/payment, cho browse |
| Offline không cache | Full empty state | Retry khi có mạng |
| Token expired | Silent refresh một lần | Nếu fail, login sheet/screen giữ return intent |
| Mutation pending | Disable CTA gây duplicate + progress label | Không disable navigation vô lý |
| Empty | Illustration riêng eMall hoặc icon system | CTA điều hướng hợp lý |

### Screen specification: Home

#### Objective

Cho người dùng tìm sản phẩm hoặc chạm vào discovery module trong vài giây đầu, đồng thời đưa Video/Live vào dòng mua sắm thay vì menu phụ.

#### Layout order

```text
[Safe area + orange gradient header]
  [Search pill........................] [Cart badge]
  [keyword chips horizontal / optional]
[Campaign hero carousel]
[Quick category horizontal grid]
[Flash Sale row + countdown nếu backend có thời gian thật]
[Video / Live highlight strip]
[Mall / Top Search modules]
[Gợi ý hôm nay: product grid 2 columns, infinite scroll]
[Bottom tabs]
```

| Area | Detail |
| --- | --- |
| Header | Gradient brand, search pill nền trắng cao `40`, cart icon `44`, collapse nhẹ khi scroll |
| Category | 8-10 shortcut visible qua horizontal paging, icon tròn `48`, label hai dòng |
| Campaign | Aspect ratio khoảng `2.3:1`; không tự tạo voucher/countdown nếu API chưa có |
| Flash Sale | Horizontal card nhỏ với price/discount; `Xem tất cả` dẫn search filter khi được hỗ trợ |
| Video/Live | Preview cards có badge rõ; tap mở đúng item/session |
| Recommend | Hai cột, lazy image, load-more skeleton cuối feed |

Behavior và telemetry:

- Pull-to-refresh refresh home placements và live/video highlights.
- Chạm search mở Search screen với keyboard focus.
- Track `home_view`, `home_section_impression`, `product_clicked` với placement ID do API trả.

### Screen specification: Search and product listing

```text
[Back] [Search input with current query........] [Cart]
[Sort: Liên quan | Mới nhất | Bán chạy | Giá v]
[Active filter chips horizontal]
[Product grid 2 columns]
```

| Interaction | Specification |
| --- | --- |
| Search submit | Debounce suggestion nếu có API; submit rõ khi bàn phím search |
| Sort | Quick sort chips; giá mở sheet chọn thấp-cao/cao-thấp |
| Filters | Phase đầu chỉ render filter API hỗ trợ; không làm filter giả |
| Pagination | Cursor/infinite; tránh mất vị trí khi quay lại từ product |
| Empty | Hiện query, nút xoá lọc và gợi ý quay về home |

### Screen specification: Product detail

```text
[Back overlay]                              [Share] [Cart badge]
[Swipe gallery 1:1.................................]
[Indicator / thumbnail optional]
[Price + compare price + discount badge]
[Title, rating/review count, sold if backed by API]
[Voucher/shipping block only when contract exists]
[Variant row -> selection sheet] [Quantity]
[Shop preview: logo, name, Chat, Xem shop]
[Reviews summary + preview + create eligibility]
[Description/specifications collapsible]
[Recommendations grid]
[Sticky bar: Chat | Thêm vào giỏ | Mua ngay]
```

Functional detail:

| Feature | Behavior |
| --- | --- |
| Gallery | Swipe ảnh, pinch optional later; skeleton/fallback asset on load error |
| Variant | Sheet hiển thị ảnh/SKU/giá/tồn kho; không add-to-cart khi chưa chọn variant bắt buộc |
| Quantity | Giới hạn stock; feedback rõ khi hết hàng |
| Cart | Hiện toast thành công và cập nhật badge tức thời |
| Buy now | Tạo one-item checkout intent hoặc add selected item theo quyết định commerce contract |
| Shop chat | Nếu chưa auth, điều hướng login giữ product context; sau login mở conversation |
| Review | Summary công khai; form create chỉ khi API trả eligible delivered order |
| Sticky actions | Không che safe area; vẫn hiện khi cuộn description dài |

### Screen specification: Shop

- Hero banner aspect ratio `3:1`, logo/name/slogan đặt trong card nổi dưới banner.
- Actions thực: `Chat` và xem catalog; nút `Theo dõi` chỉ triển khai khi backend có follow contract.
- Category/nav của shop là horizontal chips.
- Product grid dùng cùng `ProductTile`; giữ filter/sort theo seller khi API hỗ trợ.
- Nếu metric follower/rating chưa có dữ liệu thật, không hiển thị số dựng sẵn từ web.

### Screen specification: Cart

```text
[Header: Giỏ hàng (count)]
[Seller group]
  [check] [image] [title/variant] [price]
                    [- quantity +] [Xóa]
[Recommendations carousel]
[Sticky footer: check all | Tổng thanh toán | Mua hàng]
```

| Rule | Detail |
| --- | --- |
| Persistence | Restore sau app restart; migrate schema khi CartItem đổi |
| Selection | Checkout chỉ dùng items selected; footer luôn hiển thị tổng selected |
| Variant update | Mở sheet; cập nhật price/stock ngay sau selection |
| Stock stale | Revalidate item trước checkout; báo item thay giá/hết hàng theo từng dòng |
| Empty cart | CTA `Tiếp tục mua sắm`, recommendations nếu API cho phép |

### Screen specification: Checkout and payment

Checkout là flow có rủi ro cao; thiết kế ưu tiên độ rõ và idempotency hơn animation.

```text
[Back] Thanh toán
[Delivery address card + Edit]
[Items grouped by seller]
[Shipping option when backend supports]
[Payment: COD / Online]
[Order note]
[Cost summary]
[Sticky total + Đặt hàng]
```

| Requirement | Detail |
| --- | --- |
| Address | Prefill từ profile, validate phone/address trước submit |
| Submit | Một idempotency key cho một intent; nút chuyển `Đang đặt hàng...` và khóa double tap |
| Online payment | Mở browser/app action URL; resume app refetch payment/order status |
| Success | Điều hướng order confirmation/detail, không chỉ toast rồi mất context |
| Failure | Giữ input/cart, show retryable/non-retryable message theo error code |

### Screen specification: Orders and order detail

#### Orders list

- Header Account/Orders; search đơn ở dưới header.
- Status chips scroll ngang: `Tất cả`, `Chờ xử lý`, `Đang giao`, `Chờ nhận`, `Hoàn thành`, `Đã huỷ`, `Trả/Hoàn`.
- Card order gồm shop, status, product summary, total và action phù hợp trạng thái.
- Actions: `Chi tiết`, `Thanh toán`, `Hủy`, `Đã nhận hàng`, `Mua lại`.

#### Order detail

```text
[Order status banner]
[Shipment timeline: latest event emphasized]
[Recipient/address]
[Product items + prices]
[Payment status/action]
[Total breakdown]
[Status history]
[Context actions: Chat / Review / Buy again]
```

- Mutation hủy/xác nhận dùng confirmation dialog.
- Tracking events sắp xếp mới nhất hoặc timeline theo chiều trực quan nhất quán.
- Review entry chỉ bật sau trạng thái `DELIVERED`/confirmed received theo server policy.

### Screen specification: Authentication and Account

#### Login/register

| Area | Specification |
| --- | --- |
| Header | Logo eMall gọn, có back khi mở từ guarded action |
| Inputs | Email/password/native autofill; password visibility toggle |
| Social | Nút Google qua system browser; loading và error OAuth rõ |
| Legal | Links terms/privacy thật trước release |
| Return intent | Sau login trở lại checkout/chat/review đang yêu cầu auth |

#### Account hub/profile

- Header gradient nhẹ với avatar/name/email masked.
- Order shortcut row hiển thị status count chỉ khi API cung cấp.
- Menu: Đơn mua, Hồ sơ, Chat, Ngôn ngữ, Đăng xuất.
- Profile edit form có name/phone/address/gender/date/avatar; ảnh tương lai nên dùng upload, không buộc user nhập URL.
- Logout xác nhận khi có pending checkout/payment state.

### Screen specification: Chat

#### Conversation list

- Danh sách theo thời gian cập nhật, mỗi item có shop name, preview, timestamp, unread badge.
- Search local list; tạo conversation mới chỉ từ seller/product/order context, không yêu cầu user nhập raw seller ID như web debug UI.

#### Message screen

```text
[Back] [Shop title / product or order context] [Connection status]
[Scrollable message list]
[Context product mini-card optional]
[Composer: attachment reserved | input | Send]
```

| Behavior | Requirement |
| --- | --- |
| Optimistic send | Bubble pending rồi map qua saved message bằng `clientMessageId` |
| Realtime | WS connected indicator chỉ hiện khi degraded; normal state không gây nhiễu |
| Reconnect | Backoff + catch-up REST; không duplicate tin |
| Safety | Dùng validation hiện có trước submit, show inline message |
| Keyboard | Composer bám keyboard/safe area; scroll tới tin mới hợp lý |

### Screen specification: Shoppable Video

```text
[Video / Đang theo dõi header overlay]                 [Search optional]
[Full viewport vertical video]
  [Shop avatar + Follow reserved]
  [Title/description]
  [Tagged product pill -> sheet]
                           [Like]
                           [Comment]
                           [Share]
[Bottom tabs hidden or translucent according to test]
```

| Area | Specification |
| --- | --- |
| Playback | Active item autoplay muted policy theo OS; pause item rời viewport; preload kế tiếp giới hạn |
| Product sheet | Bottom sheet list tagged product, price, quick cart và detail |
| Comments | Sheet có list + composer; auth gate khi gửi |
| Like | Giữ behavior local parity ban đầu; chuyển server persisted khi API có |
| Share | Deep link vào video item; fallback native share URL |
| Analytics | View start sau playback; qualified theo threshold contract; product/carts event idempotent |
| Failure | Thumbnail + retry + vẫn cho mở product khi video lỗi |

### Screen specification: Live Shopping

#### Live discovery

- Hero đơn giản nêu live shopping, không chiếm quá một viewport.
- Live cards hai cột hoặc horizontal featured + list; thumbnail, LIVE badge, title, viewer count/metrics thật.
- Session ended không xuất hiện trong active listing trừ khi có replay contract.

#### Live room

```text
[Media full-screen or top-stage]
  [LIVE] [Viewer count]                            [Close]
  [Host/shop]
  [Transient chat overlay optional]
[Pinned product floating card / open product sheet]
[Chat composer + hearts/reactions if API supports]
```

| Requirement | Detail |
| --- | --- |
| Playback | Chọn protocol theo server capability; startup/error/reconnect được đo |
| Pinned products | Nhận event WS, reorder chính xác, tap ghi product-click metric |
| Chat | Message history + realtime, auth gate khi send |
| Orientation | Portrait là mặc định; landscape media có thể để phase sau |
| State | `SCHEDULED`, `LIVE`, `PAUSED`, `ENDED`, playback unavailable đều có panel rõ |
| Purchase | Mở product sheet/detail mà không làm mất live context; picture-in-picture là enhancement sau |

### Accessibility, localization and content rules

- Tất cả icon-only button có accessibility label; focus order đi theo nội dung đọc.
- Hỗ trợ dynamic font tới mức không che CTA; kiểm tra layout tại font scale `1.3x`.
- Giá và ngày tháng format theo locale nhưng currency theo payload, không hardcode `đ` cho mọi order.
- Copy trạng thái ngắn, hành động cụ thể: `Thử lại`, `Đăng nhập để chat`, `Sản phẩm đã hết hàng`.
- Hình ảnh có fallback; video/live có caption status text để trạng thái không phụ thuộc hình ảnh.
- Contrast CTA/text theo WCAG AA cho nội dung chính.

### Design deliverables trước implementation diện rộng

| Artifact | Scope | Gate |
| --- | --- | --- |
| Token/component inventory | Colors, type, buttons, cards, sheet, tabs, states | Review trước Phase UI shell |
| Low-fidelity flows | Home-to-checkout, order-to-review, product-to-chat, video/live-to-product | Chốt IA/navigation |
| High-fidelity screens | Home, product, cart, checkout, orders, account, chat, video, live | Chốt UI trước build feature |
| Interactive prototype | Commerce core + video/live sheet interactions | Usability test trên phone |
| State matrix | Loading/error/empty/offline/auth/disabled cho mỗi screen | Không bỏ sót error UI |
| Handoff spec | Tokens, dimensions, assets, analytics events, API fields | Ready for implementation |

## Livestream technical decision gate

Production hiện trả playback WebRTC/WHEP. Web triển khai `RTCPeerConnection` và luồng media realtime, trong khi mobile preview hiện tại dùng `expo-video` và không phát WHEP.

Trước khi cam kết live playback, thực hiện spike:

| Phương án | Kiểm tra | Kết quả quyết định |
| --- | --- | --- |
| React Native WebRTC + signaling hiện tại | Phát stream production, cleanup, reconnect, iOS/Android permissions | Dùng nếu ổn định trên device |
| Backend cung cấp HLS/LL-HLS song song | `expo-video` phát được, latency chấp nhận | Ưu tiên nếu backend hỗ trợ đơn giản |
| Chỉ WHEP qua native integration | Chi phí custom dev client và EAS build | Chỉ dùng nếu hai hướng trên không đạt |

Không đưa livestream playback vào definition of done của phase UI trước khi gate này có quyết định.

## Lộ trình triển khai

### Phase 0 - Product definition, design system và baseline contracts

Mục tiêu: khóa phạm vi và chất lượng thiết kế trước khi code màn hình hàng loạt.

- Snapshot chức năng/response thực tế của buyer web; đánh dấu rõ feature thật và placeholder.
- Hoàn thiện flow maps, wireframe, token/component inventory và state matrix nêu trên.
- Chốt route/deep-link map và event taxonomy cho commerce, video, live.
- Chốt Buyer Experience API resources, envelope, pagination, error codes và idempotency.
- Chuẩn hóa Node native ARM64 `>=20.19.4`, Expo SDK, workspace install và CI commands.

Deliverables:

- Design handoff bản đầu cho commerce core và media-commerce.
- OpenAPI/schema hoặc contract types được review.
- Danh sách BFF logic phải chuyển vào backend.

Nghiệm thu:

- Không còn quyết định nền tảng bị bỏ ngỏ cho home/product/checkout/auth.
- Backend, web và mobile đồng ý contract target, navigation và DoD.

### Phase 1 - Buyer Experience API và shared contracts

Mục tiêu: tạo backend boundary dài hạn trước khi app phụ thuộc vào payload.

- Tạo `buyer-contracts` package hoặc schema generator có versioning.
- Implement API public cho home, product search/detail, shop và recommendation.
- Chuyển normalization/composition đang nằm ở Next BFF sang API target.
- Bổ sung media URL public cleanup; backend không phát hành URL `localhost`.
- Implement contract tests, API smoke tests và response comparison với web BFF baseline.
- Bổ sung metrics/error tracing cho endpoints mới.

Nghiệm thu:

- App hoặc script có thể gọi `buyer-experience` API production-like và nhận DTO đã thống nhất.
- Payload catalog/home quan trọng tương đương hành vi web hiện hữu.
- Không yêu cầu mobile import hoặc gọi Next BFF để render commerce discovery.

### Phase 2 - Mobile foundation và design shell

Mục tiêu: biến Expo smoke test thành ứng dụng có cấu trúc release được.

- Thêm Expo Router, tabs/stacks, safe-area, linking và validated route intents.
- Tạo API client, Query provider, stores, telemetry adapter và runtime config validation.
- Xây design tokens và core components: header, tabs, tile, button, sheet, states, sticky bar.
- Cấu hình image/media loading, asset fallback, offline banner và global error boundary.
- Dựng Story/sandbox screens hoặc preview route cho mọi component state quan trọng.

Nghiệm thu:

- App mở trên iOS/Android device, navigate qua shell mà không lỗi.
- Component states khớp handoff thiết kế và accessible labels/touch targets đạt yêu cầu.
- Config production/staging phân tách rõ.

### Phase 3 - Auth, native OAuth và account identity

- Implement login, register, logout, refresh lifecycle và guarded navigation.
- Implement Google OAuth native với system browser, PKCE/state, deep link và SecureStore.
- Implement bootstrap session, retry/refetch user profile và expired-session handling.
- Build login/register/account hub layout theo spec; thêm locale/settings cơ bản.
- Backend rate limit/audit OAuth và test redirect allowlist.

Nghiệm thu:

- Email login và Google login hoạt động end-to-end trên physical iOS/Android.
- Token không được lưu ở plain storage hoặc xuất hiện trong logs.
- Auth-required action quay lại đúng context sau login.

### Checkpoint triển khai Phase 0-3 - 2026-05-25

| Phase | Đã triển khai trong repo | Kiểm thử đã thêm | Còn lại trước khi đạt nghiệm thu phase |
| --- | --- | --- | --- |
| Phase 0 | Package `@frontend/buyer-contracts` cho envelope, home/catalog và auth DTO; runtime config validation mobile | Contract envelope/query unit tests; mobile runtime config tests | Design handoff hình ảnh, event taxonomy chính thức và CI chạy Node ARM64 `>=20.19.4` |
| Phase 1 | Gateway public boundary `/api/v1/buyer-experience/home`, `/products`, `/products/{productId}`, `/shops/{sellerId}`; mobile không gọi Next BFF cho discovery mới | Go unit tests mapping/query/upstream error và public route mounting | Recommendation endpoint chuyên biệt, metrics/comparison fixtures, migrate buyer-web sang boundary mới |
| Phase 2 | Expo Router shell với Home, Khám phá, Giỏ hàng guard, Tài khoản; Query provider, core tiles/buttons/states, API client và Metro single-React resolution cho monorepo | Typecheck mobile; config/session/media unit tests; iOS Metro bundle | Offline/error boundary, telemetry, component gallery và QA trên thiết bị |
| Phase 3 | Email login/register UI; Google system-browser flow; deep link `dtcommercebuyer://auth/google/callback`; SecureStore; session bootstrap/refresh/logout; backend allowlist và PKCE ticket binding | OAuth deep-link/PKCE mobile tests; auth-service OAuth/controller tests và TypeScript build | Rollout auth/gateway mới, cấu hình Google production, end-to-end login trên thiết bị và return-context hoàn chỉnh |

Checkpoint này là implementation slice đầu tiên của lộ trình dài hạn. Không đánh dấu toàn bộ nghiệm thu production là hoàn tất khi chưa rollout API mới và chạy device E2E.

### Phase 4 - Discovery, catalog, product và shop

- Implement Home với placement DTO thật: categories, deals, top search, recommendation, video/live entry.
- Implement Search/List với query, sort/filter capabilities thực và cursor pagination.
- Implement Product Detail với gallery, variants, stock, shop preview, reviews summary và sticky CTA.
- Implement Shop decor/catalog chỉ hiển thị metrics/action có backend support.
- Track impressions/click/navigation events theo placement/context.

Nghiệm thu:

- Luồng `Home -> Search/Product -> Shop -> Product` hoạt động trên production-like API.
- Giá, variant, ảnh và trạng thái tồn kho đồng nhất giữa web đã migrate và mobile.
- Không có module giao diện quảng cáo chức năng chưa tồn tại.

### Phase 5 - Cart, checkout, orders và payment

- Implement local-first cart store versioned; chuẩn bị interface cho server-sync sau này.
- Implement cart selection, variant revalidation, recommendation và sticky total.
- Implement checkout form, address prefill, COD/online payment, idempotent order submission.
- Implement order confirmation, order list/detail, payment action, shipment timeline.
- Implement order mutations: cancel, confirm received, buy again.

Nghiệm thu:

- User hoàn tất được flow `Product -> Cart -> Checkout -> Order Detail`.
- Retry/double tap không tạo duplicate order hoặc payment intent.
- App resume sau online payment hiển thị trạng thái order/payment đúng.

### Phase 6 - Profile và reviews

- Implement full profile update/validation, avatar strategy và account shortcuts.
- Implement review summary/list/filter trong product detail.
- Implement review creation dựa trên delivered-order eligibility do backend xác nhận.
- Bổ sung entry từ order detail tới viết review.

Nghiệm thu:

- Thông tin profile nhất quán sau restart/re-login.
- Không thể gửi review cho item chưa đủ điều kiện.

### Phase 7 - Realtime chat

- Chuẩn hóa chat endpoint và WS event sequence trong Buyer Experience/API Gateway boundary.
- Implement conversation list và message screen; loại bỏ thao tác nhập raw seller ID khỏi UI production.
- Implement open/create conversation từ product/order/shop context.
- Implement optimistic sends, read state, unread badges, reconnect/backoff và REST catch-up.
- Test song song web/mobile trên cùng conversation.

Nghiệm thu:

- Message không duplicate/mất khi disconnect/reconnect.
- Buyer chat được với seller từ product/order trong tối đa hai thao tác sau khi đã login.

### Checkpoint triển khai Phase 4-7 - 2026-05-25

| Phase | Đã triển khai trong repo | Kiểm thử đã thêm/chạy | Còn lại trước khi đạt nghiệm thu phase |
| --- | --- | --- | --- |
| Phase 4 | Product detail mobile có gallery, variant, stock, review preview, sticky cart/buy CTA và entry shop/chat; shop decor/catalog; gateway product detail trả `defaultSku`, `stock`, `attributes` thật | Gateway product inventory/default SKU mapping test; shared query filter test; mobile typecheck và iOS Metro bundle | Video/live placement ở Home, analytics impression/click, infinite pagination và comparison fixture với buyer-web |
| Phase 5 | Cart local-first persist bằng `AsyncStorage` versioned; select/quantity/remove/totals; checkout address prefill; stable idempotency key khi submit/retry; online payment intent/action; order list/detail/cancel/confirm received/buy again | Cart reducer/persistence/order-payload unit tests; `order-service` và `payment-service` Go test suites | Contract COD, shipment timeline, product stale-price/stock UI revalidation, recommendations, resume payment E2E trên device |
| Phase 6 | Profile fetch/update và validation; review summary/list ở detail; order-detail entry viết review; gateway `/api/v1/buyer-experience/reviews` bắt buộc order `DELIVERED` chứa product trước khi forward | Profile validation tests; review eligibility mobile tests; gateway authorization/eligibility tests | Avatar upload strategy, filter/pagination review UI, migrate web sang cùng eligibility boundary và production rollout |
| Phase 7 | Tab conversation list không nhập seller ID; tạo conversation từ product; message UI; optimistic send theo `clientMessageId`; REST catch-up, unread/read, reconnect backoff; native WS auth subprotocol được chat-service hỗ trợ | Chat merge/reconnect/message-limit unit tests; chat-service native-origin/browser-origin tests và toàn suite | Entry chat từ order/shop, namespace Buyer Experience đồng nhất cho toàn bộ chat REST, test web/mobile đồng thời và disconnect trên thiết bị thật |

Checkpoint này là implementation slice chạy được trong source tree. Commerce/profile/chat vẫn dùng một số gateway route `/api/v1/*` hiện có trong khi boundary Buyer Experience được hoàn thiện dần; không coi các phase đạt production DoD cho tới khi rollout và device E2E hoàn tất.

### Phase 8 - Shoppable video

- Implement vertical feed, player lifecycle, thumbnail/retry/error states và memory controls.
- Implement product sheet, quick add-to-cart/detail, comments, share deep links và local-like parity.
- Gửi analytics view/product/add-cart theo contract, bảo đảm không chặn playback UI.
- Tối ưu preloading và kiểm thử mạng yếu/device tầm trung.

Nghiệm thu:

- Video production phát ổn định trên thiết bị mục tiêu.
- Product purchase journey từ video không làm mất feed position.
- Playback/event failures quan sát được qua monitoring.

### Phase 9 - Livestream capability và live shopping

- Kết thúc technical spike và chốt HLS/LL-HLS hoặc native WebRTC playback path.
- Implement live listing/room, player status, pinned products, messages, viewer/pin events và metric tracking.
- Giữ live context khi mở product; đánh giá enhancement picture-in-picture sau parity.
- Load test/reconnect test cho realtime và playback.

Nghiệm thu:

- Xem được livestream production thực trên ít nhất một thiết bị iOS và Android được hỗ trợ.
- Chat/pinned product/purchase interaction hoạt động trong phòng live.
- Có dashboard theo dõi startup latency, buffering và playback error.

### Phase 10 - Web migration, hardening và release

- Migrate `buyer-web` sang Buyer Experience API; thu hẹp/xóa BFF orchestration không còn cần.
- Chạy parity regression web/mobile và E2E smoke flows.
- Audit security, privacy, token redaction, analytics consent và terms/privacy links.
- Test accessibility, low network, memory/media, crash recovery và app upgrades/store migrations.
- Thiết lập build/signing/release channels, staging/prod config, rollout và rollback runbook.

Nghiệm thu:

- Web/mobile dùng chung public contract đã version hóa.
- Release candidate đạt manual device checklist và monitoring/rollback sẵn sàng.

### Checkpoint triển khai Phase 8-10 - 2026-05-25

| Phase | Đã triển khai trong repo | Kiểm thử đã thêm/chạy | Còn lại trước khi đạt nghiệm thu phase |
| --- | --- | --- | --- |
| Phase 8 | Tab video dọc dùng feed thật, lifecycle play/pause, product click/quick add, comments, local like, share deep link giữ `videoId`, analytics view/qualified/product/cart; Home có entry Video/Live | Unit tests domain video/playback; mobile typecheck và unit suite | Product sheet dạng overlay đầy đủ, prefetch/memory tuning, slow-network và playback thực trên device production |
| Phase 9 | Tab live discovery và room; player HLS/LL-HLS, pinned products, realtime message/viewer/pin refresh, reconnect/backoff, metric tracking; live-service cho phép native WS không có browser `Origin` | Unit tests live capability/message/reconnect; live-service handler/service/full suite; mobile typecheck và unit suite | Backend production hiện có thể trả WHEP/WebRTC; cần tích hợp native WebRTC hoặc chốt HLS trước khi tính playback parity, sau đó device/load test và dashboard |
| Phase 10 | Gateway có namespace `/api/v1/buyer-experience/videos` và `/live` rewrite sang service contracts; comment video giữ JWT gate; các BFF route Video/Live của `buyer-web` chuyển sang boundary gateway chung | Gateway router/handler/full suite; buyer-web lint; contracts typecheck/unit tests | Migrate các BFF commerce/profile/chat còn lại, comparison fixtures/E2E, security/accessibility/performance audit, signing/staging rollout/rollback |

Checkpoint này xác nhận source code slice cho Video/Live và bước migration web liên quan đã có trong repo. Không đánh dấu Phase 8-10 đạt production DoD: playback WHEP trên mobile, test thiết bị thật và quy trình release vẫn là blocker bắt buộc.

## File/module structure đề xuất

```text
frontend/packages/buyer-contracts/
  src/
    envelope.ts
    auth.ts
    catalog.ts
    commerce.ts
    engagement.ts
    realtime.ts
frontend/apps/buyer-mobile/
  app/
    (auth)/
    (tabs)/
    products/
    orders/
    live/
  src/
    api/
      client.ts
      auth.ts
      home.ts
      products.ts
      cart-recommendations.ts
      orders.ts
      payments.ts
      shipping.ts
      reviews.ts
      chat.ts
      videos.ts
      live.ts
      types.ts
    components/
      core/
      commerce/
      product/
      order/
      chat/
      video/
      live/
    features/
      auth/
      cart/
      checkout/
      home/
      account/
    stores/
      auth-store.ts
      cart-store.ts
      settings-store.ts
    hooks/
    realtime/
    telemetry/
    theme/
    utils/
```

Backend cần bổ sung ownership tương ứng tại API gateway hoặc service mới:

```text
services/api-gateway/ or services/buyer-experience-service/
  buyer-experience/
    home
    catalog
    commerce
    engagement
```

Không import component Next/Tailwind từ `buyer-web`; chỉ chia sẻ contract, validation và domain helper thuần TypeScript khi phù hợp. Khi tạo service/module backend, chọn theo patterns hiện có của repo và tránh tách service mới chỉ để di chuyển code mà chưa có boundary vận hành rõ.

## Testing strategy

| Layer | Kiểm thử |
| --- | --- |
| Domain unit | Cart totals, price/URL normalization, status mapping, playback source, chat safety, OAuth return/deep-link validation |
| API contract | Schema/envelope cho Buyer Experience API; comparison fixtures với behavior web baseline |
| Backend integration | Auth, review eligibility, order/payment idempotency, media URLs public và WS authorization |
| Component | Loading/error/empty states; sticky actions; auth guard; product variant; order actions |
| Realtime | WS reconnect, duplicate message handling, fallback polling, live pin/status events |
| Device manual | Android + iOS: auth, checkout, order, chat, video, live |
| Performance | Product feed scroll, video feed memory, app resume/token restore, slow network |
| Release regression | Web và mobile cùng contract, staging/prod configuration, rollback smoke tests |

## Definition of Done cho parity

- Tất cả route/chức năng thực đang dùng trên buyer web có màn hình hoặc hành vi mobile tương đương.
- Web và mobile dùng Buyer Experience API version hóa, không yêu cầu app native phụ thuộc vào Next BFF routes.
- Auth email/password, cart, checkout, orders, profile, reviews, chat, video và live hoạt động với production API contract.
- Google OAuth mobile có native callback/session flow an toàn; đây là yêu cầu release, không phải enhancement tùy chọn.
- Livestream production phát được trên device; fallback UI đơn thuần không tính là parity.
- API production không trả asset URL `localhost`; client normalization chỉ là safety fallback.
- Unit tests, typecheck, contract smoke tests và manual device checklist đều pass.
- UI dùng brand eMall riêng và chỉ áp dụng pattern mobile commerce tham khảo, không sao chép tài sản Shopee.

## Rủi ro và blocker cần giải quyết sớm

| Rủi ro | Ảnh hưởng | Giảm thiểu |
| --- | --- | --- |
| Giữ logic experience trong Next BFF | Native phụ thuộc web deployment, contract phân mảnh | Xây Buyer Experience API và migrate cả hai client |
| API v1 mới không tương đương hành vi web | Regression commerce khi migration | Snapshot fixtures, dual-run comparison, E2E parity |
| OAuth callback web không dùng được cho native | Không login Google trên app | Thiết kế deep link + ticket exchange riêng |
| Production live chỉ có WHEP/WebRTC | Không xem live bằng `expo-video` | Technical gate trước khi build UI sâu |
| Node/dependency không đồng kiến trúc máy | Metro/tooling lỗi | Chuẩn hóa Node ARM64 và lockfile install |
| Media/product trả URL local | Ảnh/video hỏng trên phone | Sửa backend media origin + safety normalize ở app |
| Cart local khác session/server | Mất cart khi đổi thiết bị | Local-first rõ ràng, thêm sync contract sau commerce core |
| Thiết kế dày đặc nhưng không đo được | UI đẹp nhưng conversion kém | Prototype/device test và event metrics theo journey |

## Trình tự thực hiện khuyến nghị

1. Chốt design handoff và Buyer Experience API contract trước khi xây thêm màn hình production.
2. Đưa logic orchestration/normalization đang nằm trong web BFF về backend boundary và kiểm tra parity.
3. Xây mobile shell/auth rồi hoàn thành luồng mua hàng chính `Home -> Product -> Cart -> Checkout -> Orders`.
4. Migrate profile/reviews/chat, sau đó shoppable video.
5. Chỉ hoàn tất live khi playback path được chứng minh trên thiết bị thật.
6. Migrate web sang contract chung trước khi release mobile production rộng.
