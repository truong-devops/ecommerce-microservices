# Video And Livestream Comments Implementation Plan

Status: phase 1-3 implemented
Last updated: 2026-05-19

## 1. Goal

Implement production-like comments for buyer video and livestream surfaces without using `chat-service`.

Scope:

- Video comments are owned by `services/product-service`.
- Livestream comments are owned by `services/live-service`.
- `chat-service` remains focused on buyer-seller 1:1 conversations.
- API Gateway and frontend app routes proxy the new APIs.
- Buyer Web can read and create comments for videos and load livestream comment history before realtime updates continue through the existing live WebSocket.

Non-goals for the first implementation:

- Nested replies.
- Emoji reactions.
- Like/dislike on comments.
- Full moderation workflow UI.
- Cross-instance live WebSocket fanout beyond the current live-service hub behavior, unless Redis pub/sub is already required for deployment.

## 2. Current State

### 2.1 Video

Current owner: `services/product-service`.

Existing behavior:

- `product_videos` stores video metadata and metrics.
- Public video feed/detail is available.
- Existing metrics include:
  - `viewStartedCount`
  - `qualifiedViewCount`
  - `productClickCount`
  - `addToCartCount`
  - `ctr`
  - `addToCartRate`
  - `lastAggregatedAt`
- Existing tracking events:
  - `view-started`
  - `view-qualified`
  - `product-clicked`
  - `add-to-cart`

Missing:

- Comment storage.
- Comment list API.
- Comment create API.
- `commentCount` metric.
- Buyer Web comment UI for videos.

### 2.2 Livestream

Current owner: `services/live-service`.

Existing behavior:

- `live_sessions` stores session metadata and `metricsSnapshot.messageCount`.
- `live_messages` exists and stores live chat messages.
- WebSocket event `live:message:create` creates a live message.
- Server broadcasts `live:message:new`.
- Buyer Web live detail page already has realtime chat UI.

Missing:

- REST API to load live message history on page refresh.
- Increment `live_sessions.metricsSnapshot.messageCount` when a message is created.
- API Gateway and buyer-web route proxy for message history.
- Optional server-side pagination for live message history.

## 3. Architecture Decision

Do not use `chat-service` for video/live comments.

Reason:

- `chat-service` models buyer-seller 1:1 conversations.
- Public video comments and livestream room comments are not buyer-seller private conversations.
- Reusing `chat-service` as-is would force fake recipients, unread counts, and conversation access rules that do not match public comment behavior.

Ownership:

| Feature | Owner service | Storage | Write path | Read path |
|---|---|---|---|---|
| Video comments | `product-service` | `product_video_comments` | REST | REST pagination |
| Livestream comments | `live-service` | `live_messages` | WebSocket | REST history + WebSocket realtime |

## 4. Data Model

### 4.1 Video Comments

Add Mongo collection in the product database:

```txt
product_video_comments
```

Document shape:

```json
{
  "_id": "ObjectId",
  "commentId": "uuid",
  "videoId": "uuid",
  "userId": "uuid",
  "userRole": "BUYER",
  "text": "string",
  "status": "VISIBLE",
  "clientCommentId": "optional-string",
  "createdAt": "datetime",
  "updatedAt": "datetime",
  "hiddenAt": "optional-datetime",
  "deletedAt": "optional-datetime"
}
```

Status values:

- `VISIBLE`
- `HIDDEN`
- `DELETED`

Indexes:

- Unique: `{ commentId: 1 }`
- Read path: `{ videoId: 1, status: 1, createdAt: -1 }`
- Idempotency: sparse unique `{ videoId: 1, userId: 1, clientCommentId: 1 }`
- Moderation/admin lookup: `{ status: 1, createdAt: -1 }`

Update `product_videos.metricsSnapshot`:

```txt
commentCount int64
```

### 4.2 Livestream Comments

Reuse existing collection:

```txt
live_messages
```

Current document shape is already suitable:

```json
{
  "_id": "ObjectId",
  "messageId": "uuid",
  "sessionId": "uuid",
  "senderId": "uuid",
  "senderRole": "BUYER",
  "text": "string",
  "clientMessageId": "optional-string",
  "language": "vi",
  "status": "VISIBLE",
  "createdAt": "datetime"
}
```

Required additions:

- Repository list method for messages by `sessionId`.
- Ensure list index supports history query:

```txt
{ sessionId: 1, status: 1, createdAt: -1 }
```

Update `live_sessions.metricsSnapshot.messageCount`:

- Increment when a new, non-idempotent message is created.
- Do not increment when returning an existing message by `clientMessageId`.

## 5. API Contract

### 5.1 Product Service Video Comment APIs

#### List video comments

```txt
GET /api/v1/videos/{videoId}/comments?page=1&pageSize=20
```

Auth:

- Public read is allowed for published videos.

Validation:

- `videoId` required.
- `page >= 1`.
- `pageSize` default `20`, max `100`.
- Video must exist and be `published`.

Response:

```json
{
  "success": true,
  "data": [
    {
      "commentId": "uuid",
      "videoId": "uuid",
      "userId": "uuid",
      "userRole": "BUYER",
      "text": "Hay qua",
      "status": "VISIBLE",
      "createdAt": "2026-05-19T10:00:00Z",
      "updatedAt": "2026-05-19T10:00:00Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 1,
      "totalPages": 1
    }
  }
}
```

#### Create video comment

```txt
POST /api/v1/videos/{videoId}/comments
```

Auth:

- JWT required.
- Allowed roles: `BUYER`, `CUSTOMER`, `SELLER`, `ADMIN`, `MODERATOR`, `SUPER_ADMIN`.
- For first implementation, sellers can comment like normal users. If product-owner restriction is desired later, add it as a separate moderation rule.

Request:

```json
{
  "text": "Hay qua",
  "clientCommentId": "browser-generated-uuid"
}
```

Validation:

- Video must exist and be `published`.
- `text` after trim must be between `1` and `1000` characters.
- `clientCommentId` optional, max `128` chars.
- Apply per-user rate limit if a reusable limiter exists in `product-service`; otherwise add a small in-memory limiter only if needed.

Behavior:

- Insert comment with `VISIBLE` status.
- If `(videoId, userId, clientCommentId)` already exists, return existing comment and do not increment `commentCount`.
- Increment `product_videos.metricsSnapshot.commentCount` only for newly created comments.
- Publish analytics event only if event publisher support is added in this phase.

Response:

```json
{
  "success": true,
  "data": {
    "commentId": "uuid",
    "videoId": "uuid",
    "userId": "uuid",
    "userRole": "BUYER",
    "text": "Hay qua",
    "status": "VISIBLE",
    "createdAt": "2026-05-19T10:00:00Z",
    "updatedAt": "2026-05-19T10:00:00Z"
  }
}
```

Status code: `201`.

#### Hide/delete video comment

Phase 1 can skip this if buyer UI only creates/lists comments.

Recommended later APIs:

```txt
DELETE /api/v1/videos/{videoId}/comments/{commentId}
PATCH /api/v1/videos/{videoId}/comments/{commentId}/hide
```

Rules:

- Comment owner can delete own comment.
- Staff can hide comment.
- `commentCount` should decrement only when a visible comment becomes deleted/hidden.

### 5.2 Live Service Comment APIs

#### List live message history

```txt
GET /api/v1/live/sessions/{sessionId}/messages?page=1&pageSize=50
```

Auth:

- Optional JWT.
- Public can read messages if session is `LIVE`, `PAUSED`, or `ENDED`.
- Draft/scheduled sessions can be read only by seller owner or staff.

Validation:

- `sessionId` required.
- `page >= 1`.
- `pageSize` default `50`, max `100`.

Behavior:

- Query `live_messages` by `sessionId`, `status = VISIBLE`.
- Sort `createdAt desc`.
- Return newest first. Buyer UI can reverse locally for chronological display.

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "mongo-object-id",
      "messageId": "uuid",
      "sessionId": "uuid",
      "senderId": "uuid",
      "senderRole": "BUYER",
      "text": "Shop oi con hang khong",
      "clientMessageId": "browser-generated-uuid",
      "language": "vi",
      "status": "VISIBLE",
      "createdAt": "2026-05-19T10:00:00Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 50,
      "totalItems": 1,
      "totalPages": 1
    }
  }
}
```

#### Create live message

Keep existing WebSocket event:

```txt
live:message:create
```

Payload:

```json
{
  "type": "live:message:create",
  "text": "Shop oi con hang khong",
  "clientMessageId": "browser-generated-uuid",
  "language": "vi"
}
```

Required behavior update:

- If a new message is inserted, increment `live_sessions.metricsSnapshot.messageCount`.
- If existing message is returned by `clientMessageId`, do not increment.
- Continue broadcasting:

```txt
live:message:new
```

## 6. Kafka And Analytics Events

### 6.1 Video

Add shared event type:

```txt
video.comment_created
```

Suggested payload:

```json
{
  "videoId": "uuid",
  "sellerId": "uuid",
  "commentId": "uuid",
  "actor": {
    "userId": "uuid",
    "role": "BUYER"
  },
  "context": {
    "source": "buyer_video_feed",
    "clientCommentId": "browser-generated-uuid"
  }
}
```

Implementation note:

- This can be added after core persistence if event publisher changes expand scope too much.
- Metrics must not depend on Kafka success.

### 6.2 Livestream

Existing live event:

```txt
live.message.created
```

Keep using it.

Optional shared TS event contract can be added later if analytics service needs typed live event payloads.

## 7. Backend Implementation Plan

### Phase 1 - Product Service Video Comment Backend

Files likely touched:

- `services/product-service/internal/domain/video.go`
- `services/product-service/internal/repository/video_repository.go`
- `services/product-service/internal/service/video_service.go`
- `services/product-service/internal/handler/video_handler.go`
- `services/product-service/internal/router/router.go`
- `services/product-service/internal/service/video_service_test.go`
- `services/product-service/internal/router/router_test.go`

Steps:

1. Add domain types:
   - `VideoCommentStatus`
   - `VideoComment`
   - `VideoCommentResponse`
   - `PaginatedVideoComments`
2. Add `CommentCount` to:
   - `VideoMetricsSnapshot`
   - `VideoMetricsResponse`
   - response mapping.
3. Add repository methods:
   - `CreateComment`
   - `FindCommentByClientID`
   - `ListComments`
   - `IncrementCommentCount`
4. Add Mongo document mapping for `product_video_comments`.
5. Add indexes in `EnsureIndexes`.
6. Add service methods:
   - `ListComments`
   - `CreateComment`
7. Add handler methods:
   - `ListComments`
   - `CreateComment`
8. Add routes:
   - `GET /videos/{videoId}/comments`
   - `POST /videos/{videoId}/comments`
9. Add tests:
   - happy path create comment increments count.
   - duplicate `clientCommentId` returns existing comment and does not increment twice.
   - validation failure for empty/too-long text.
   - not found/unpublished video rejects comment creation/list.
   - route registration test.

Validation:

```txt
cd services/product-service && go test ./...
```

### Phase 2 - Live Service Message History Backend

Files likely touched:

- `services/live-service/internal/domain/live.go`
- `services/live-service/internal/repository/live_repository.go`
- `services/live-service/internal/service/live_service.go`
- `services/live-service/internal/handler/live_handler.go`
- `services/live-service/internal/router/router.go`
- `services/live-service/internal/service/live_service_test.go`
- `services/live-service/internal/handler/ws_handler_test.go`

Steps:

1. Add repository methods:
   - `ListMessages`
   - `IncrementMessageCount`
2. Update message indexes:
   - `{ sessionId: 1, status: 1, createdAt: -1 }`
3. Update `SendMessage`:
   - new insert increments `messageCount`.
   - idempotent existing message does not increment.
4. Add service method:
   - `ListMessages`
5. Add handler:
   - `ListMessages`
6. Add route:
   - `GET /live/sessions/{sessionId}/messages`
7. Add tests:
   - list live messages returns visible messages only.
   - public can list messages for `LIVE`, `PAUSED`, `ENDED`.
   - unauthenticated cannot list messages for `DRAFT`/`SCHEDULED`.
   - send message increments `messageCount`.
   - idempotent message does not double increment.

Validation:

```txt
cd services/live-service && go test ./...
```

### Phase 3 - API Gateway Routes

Files likely touched:

- `services/api-gateway/internal/router/router.go`
- `services/api-gateway/internal/router/router_test.go`

Routes:

Video comments:

```txt
GET  /api/v1/videos/{videoId}/comments
POST /api/v1/videos/{videoId}/comments
```

Live message history:

```txt
GET /api/v1/live/sessions/{sessionId}/messages
```

Rules:

- Video comment list can be public.
- Video comment create must require auth.
- Live message history can be public route with optional auth handled by `live-service`, or private/public duplicated route if gateway does not support optional auth.

Validation:

```txt
cd services/api-gateway && go test ./...
```

### Phase 4 - Buyer Web API Proxy And Types

Files likely touched:

- `frontend/apps/buyer-web/src/lib/api/types.ts`
- `frontend/apps/buyer-web/src/lib/api/videos.ts`
- `frontend/apps/buyer-web/src/lib/api/live.ts`
- `frontend/apps/buyer-web/src/app/api/buyer/videos/[videoId]/comments/route.ts`
- `frontend/apps/buyer-web/src/app/api/buyer/live/sessions/[sessionId]/messages/route.ts`

Video API client:

- `listBuyerVideoComments(videoId, { page, pageSize })`
- `createBuyerVideoComment(videoId, payload, accessToken)`

Live API client:

- `listLiveMessages(sessionId, { page, pageSize }, accessToken?)`

Proxy route behavior:

- Preserve auth header where needed.
- Validate JSON body shape lightly at app route.
- Let backend enforce ownership/status.

Validation:

```txt
npm --workspace frontend/apps/buyer-web run build
```

If no workspace build script exists, run the smallest available lint/typecheck script for `buyer-web`.

### Phase 5 - Buyer Web UI

Files likely touched:

- `frontend/apps/buyer-web/src/app/videos/page.tsx`
- `frontend/apps/buyer-web/src/app/live/[sessionId]/page.tsx`

Video UI:

- Add comment count next to view count.
- Add comment panel for current video.
- On video switch:
  - reset comment list.
  - load first page.
- On submit:
  - require login.
  - generate `clientCommentId`.
  - optimistically append comment or append after success.
  - clear input on success.
  - show compact error on failure.

Live UI:

- On page load:
  - fetch recent messages with REST.
  - set `messages` state from history.
- Continue appending WebSocket `live:message:new`.
- Preserve duplicate protection by `messageId`.

UX constraints:

- Keep chat/comment panels scrollable with stable height.
- Do not block video playback if comment fetch fails.
- Avoid large in-app explanatory text.

Validation:

- Run buyer-web build/typecheck.
- Manually verify:
  - video comments load.
  - video comment submit requires login.
  - live history appears after refresh.
  - live realtime comments still append.

### Phase 6 - Seller Metrics And Admin Follow-up

This phase can be delayed until buyer-facing behavior works.

Seller UI:

- Surface `commentCount` in video metrics.
- Surface live `messageCount` from `metricsSnapshot`.

Moderation follow-up:

- Add hide/delete comment endpoints.
- Add moderator UI queue for reported/hidden comments.
- Add basic profanity/spam hook if needed.

Analytics follow-up:

- Add `video.comment_created` to shared Kafka contract.
- Ensure analytics-service can consume comment events if dashboards require trend data.

## 8. Consistency And Scaling Notes

### 8.1 Counters

Counters are denormalized snapshots:

- `product_videos.metricsSnapshot.commentCount`
- `live_sessions.metricsSnapshot.messageCount`

Rules:

- Increment only after successful new insert.
- Do not increment for idempotent duplicate client IDs.
- If moderation hides/deletes comments later, decrement only when a visible item leaves visible state.

### 8.2 Feed Cache

Video feed currently has Redis cache.

Decision:

- Do not invalidate video feed cache on every comment.
- Accept comment count staleness up to feed cache TTL.
- Video detail/comment panel should fetch fresh comments separately.

### 8.3 Rate Limiting

Video comments:

- Start with validation and idempotency.
- Add in-memory rate limiter only if spam risk is immediate.

Live comments:

- Keep existing `SendRateLimiter`.
- Ensure limiter key uses `user.UserID`.

### 8.4 Multi-instance Live WebSocket

Current live-service hub is process-local.

For multi-instance deployment:

- REST history will be consistent through Mongo.
- Realtime broadcast only reaches viewers connected to the same instance unless Redis pub/sub fanout is added.
- If C10K live deployment is targeted, add Redis pub/sub fanout for `live:message:new`, `live:viewer:count`, product pin/unpin, and session status broadcasts.

This can be a separate scaling phase after core comments are implemented.

## 9. Rollout Plan

1. Deploy backend with additive Mongo indexes and routes.
2. Verify existing video feed/live room behavior remains unchanged.
3. Deploy buyer-web proxy/API types.
4. Enable video comment UI.
5. Enable live history load.
6. Monitor:
   - Mongo write latency.
   - comment create error rate.
   - live WebSocket error rate.
   - message/comment count drift.

Rollback:

- Hide frontend comment UI first.
- Keep backend additive routes in place.
- If backend issue occurs, disable new route forwarding in app/gateway.
- Existing video/live playback paths are independent and should continue working.

## 10. Validation Ladder

L1 service checks:

```txt
cd services/product-service && go test ./...
cd services/live-service && go test ./...
```

L1 gateway check if routes change:

```txt
cd services/api-gateway && go test ./...
```

Frontend check:

```txt
npm --workspace frontend/apps/buyer-web run build
```

Escalate to broader monorepo checks only if shared contracts or cross-service behavior fails unexpectedly.

## 11. Implementation Checklist

Use this section to mark progress during implementation.

### Phase 1 - Product Service Video Comment Backend

- [x] Add video comment domain models.
- [x] Add `commentCount` to video metrics domain/response.
- [x] Add `product_video_comments` repository methods and mappings.
- [x] Add Mongo indexes for video comments.
- [x] Add video comment service methods.
- [x] Add video comment handlers.
- [x] Add video comment routes.
- [x] Add product-service tests.
- [x] Run `cd services/product-service && go test ./...`.

### Phase 2 - Live Service Message History Backend

- [x] Add live message list repository method.
- [x] Add live message history index.
- [x] Add live message count increment method.
- [x] Update `SendMessage` to increment `messageCount` only on new insert.
- [x] Add live message list service method.
- [x] Add live message list handler.
- [x] Add live message history route.
- [x] Add live-service tests.
- [x] Run `cd services/live-service && go test ./...`.

### Phase 3 - API Gateway

- [x] Add video comment list route.
- [x] Add video comment create route.
- [x] Add live message history route.
- [x] Add gateway router tests.
- [x] Run `cd services/api-gateway && go test ./...`.

### Phase 4 - Buyer Web API Proxy And Types

- [ ] Add video comment types.
- [ ] Add live message history output types if needed.
- [ ] Add buyer video comment API client methods.
- [ ] Add buyer live message history API client method.
- [ ] Add buyer video comment proxy route.
- [ ] Add buyer live message history proxy route.

### Phase 5 - Buyer Web UI

- [ ] Add video comment count display.
- [ ] Add video comment list panel.
- [ ] Add video comment input and submit flow.
- [ ] Load video comments when current video changes.
- [ ] Load live message history on live detail page open.
- [ ] Preserve realtime live comment append behavior.
- [ ] Run buyer-web build/typecheck.

### Phase 6 - Follow-up

- [ ] Surface video `commentCount` in seller metrics where applicable.
- [ ] Surface live `messageCount` in seller live dashboard where applicable.
- [ ] Add moderation hide/delete endpoints if needed.
- [ ] Add `video.comment_created` shared Kafka event if analytics requires it.
- [ ] Evaluate Redis pub/sub fanout for multi-instance live WebSocket broadcast.
