# Chat Service API

- Service: `services/chat-service` (Go)
- Base path: `/api/v1/chat`
- Auth: JWT bắt buộc với các role `CUSTOMER|BUYER|SELLER|ADMIN|SUPPORT|SUPER_ADMIN`

## Endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| POST | `/api/v1/chat/conversations` | Roles(`CUSTOMER`,`BUYER`,`SELLER`,`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Tạo hoặc lấy hội thoại 1-1 buyer/seller |
| GET | `/api/v1/chat/conversations` | Roles(`CUSTOMER`,`BUYER`,`SELLER`,`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Danh sách hội thoại |
| GET | `/api/v1/chat/conversations/{id}/messages` | Roles(`CUSTOMER`,`BUYER`,`SELLER`,`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Lịch sử tin nhắn |
| POST | `/api/v1/chat/conversations/{id}/messages` | Roles(`CUSTOMER`,`BUYER`,`SELLER`,`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Gửi tin nhắn text |
| POST | `/api/v1/chat/conversations/{id}/read` | Roles(`CUSTOMER`,`BUYER`,`SELLER`,`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Đánh dấu đã đọc |
| GET | `/api/v1/chat/ws?conversationId=...&accessToken=...` | JWT query/header | WebSocket realtime |

## Payload mẫu

### 1) Tạo hội thoại

`POST /api/v1/chat/conversations`

```json
{
  "sellerId": "uuid-seller",
  "productId": "product-id-optional",
  "shopId": "shop-id-optional",
  "firstMessage": "Xin chao shop"
}
```

### 2) Gửi tin nhắn

`POST /api/v1/chat/conversations/{id}/messages`

```json
{
  "text": "Shop oi cho minh hoi tinh trang don",
  "clientMessageId": "buyer-1714700000-abcd"
}
```

### 3) Đánh dấu đã đọc

`POST /api/v1/chat/conversations/{id}/read`

```json
{}
```

## Realtime events (WS)

- `chat.message.created`
- `chat.message.read`
- `ack`
- `error`

## Kafka events (outbox)

- `chat.conversation.created`: `conversationId`, `buyerId`, `sellerId`, `context`, `metadata`.
- `chat.message.created`: `conversationId`, `buyerId`, `sellerId`, `senderId`, `senderRole`, `recipientId`, `message`, `metadata`.
- `chat.message.read`: `conversationId`, `buyerId`, `sellerId`, `readerId`, `readerRole`, `readAt`, `modifiedCount`, `metadata`.

## Notes

- Chat hiện tại MVP chỉ hỗ trợ `TEXT`.
- `clientMessageId` được dùng để idempotency chống gửi trùng.
- Khi WS mất kết nối, client nên fallback polling `GET /messages` theo chu kỳ.
- `POST /messages` có rate-limit nội bộ service theo user (`SEND_MESSAGE_RATE_RPS`, `SEND_MESSAGE_RATE_BURST`).
