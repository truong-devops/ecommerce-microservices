# Chat Realtime Design (MongoDB-first)

## Scope MVP

- 1-1 chat Buyer ↔ Seller.
- Text messages only.
- Realtime via WebSocket.
- Fallback via polling.

## Data Model

### conversations

- `_id`
- `key` (unique)
- `type` = `BUYER_SELLER`
- `buyerId`, `sellerId`
- `context.productId?`, `context.orderId?`, `context.shopId?`
- `lastMessage`
- `unread.buyer`, `unread.seller`
- `nextSeq`
- `status`
- `createdAt`, `updatedAt`

### messages

- `_id`
- `conversationId`
- `seq`
- `clientMessageId` (idempotency)
- `senderId`, `senderRole`
- `kind` = `TEXT`
- `text`
- `sentAt`
- `readByBuyerAt?`, `readBySellerAt?`

### outbox_events

- `_id`
- `aggregateId`
- `eventType`
- `payload`
- `status` (`PENDING|PUBLISHED|FAILED`)
- `retryCount`
- `nextRetryAt?`
- `createdAt`, `publishedAt?`

## Indexes

- `conversations(key)` unique
- `conversations(buyerId, updatedAt desc)`
- `conversations(sellerId, updatedAt desc)`
- `messages(conversationId, seq desc)`
- `messages(conversationId, clientMessageId)` unique (partial)
- `outbox_events(status, nextRetryAt, createdAt)`

## Realtime Flow

1. Client kết nối `GET /api/v1/chat/ws` với `conversationId` + `accessToken`.
2. Server auth JWT, authorize participant ownership.
3. Chat service subscribe Redis channel `chat:conversation:{id}`.
4. Khi có message mới, service publish Redis + push WS tới clients.
5. Nếu WS down, client polling `GET /messages`.

## Kafka Outbox

- Event phát ra:
  - `chat.conversation.created`
  - `chat.message.created`
  - `chat.message.read`
- Dispatcher worker publish Kafka theo retry backoff.
- `chat.message.created` payload có `recipientId` để downstream notification gửi đúng người nhận.
- `chat.message.*` payload có `metadata.requestId|occurredAt|actorId|actorRole`.

## Gateway

- Mount `/api/chat/*` và `/api/v1/chat/*` tới `chat-service`.
- Public pass-through cho `GET /api/chat/ws` và `GET /api/v1/chat/ws`.
- Timeout middleware bỏ qua WebSocket upgrade để tránh cắt kết nối realtime.

## Hardening

- Service rate-limit gửi tin nhắn theo user (`SEND_MESSAGE_RATE_RPS`, `SEND_MESSAGE_RATE_BURST`).
- Guard ownership conversation ở cả REST và WS.
