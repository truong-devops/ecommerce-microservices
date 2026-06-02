# Livestream Service Diagrams

Last updated: 2026-05-16  
Scope: `live-service` livestream commerce MVP and future translation flow

## 1) Technology Architecture

```mermaid
graph LR
  Seller[Seller Web] --> Gateway[API Gateway]
  Buyer[Buyer Web] --> Gateway
  Gateway --> Live[Live Service]

  Live --> Mongo[(MongoDB)]
  Live --> Redis[(Redis)]
  Live --> Kafka[(Kafka)]
  Live --> Product[Product Service]

  Kafka --> Analytics[Analytics Service]
  Buyer --> Commerce[Product Cart Order Flow]
```

Ghi chú:

- `api-gateway` là entrypoint duy nhất cho frontend.
- `live-service` sở hữu live session, room realtime, pinned products và live messages.
- `product-service` chỉ cung cấp product truth như status, seller owner, price, image.
- `analytics-service` nhận event bất đồng bộ từ Kafka để tính KPI.

## 2) MVP Demo Flow

```mermaid
sequenceDiagram
  participant Seller
  participant SellerApp as Seller Web App
  participant Gateway as API Gateway
  participant Live as Live Service
  participant Product as Product Service
  participant BuyerApp as Buyer Web App
  participant Buyer
  participant Kafka as Kafka
  participant Analytics as Analytics Service

  Seller->>SellerApp: Create live session
  SellerApp->>Gateway: Create session request
  Gateway->>Live: Forward request
  Live-->>SellerApp: Draft session

  Seller->>SellerApp: Start live
  SellerApp->>Gateway: Start session request
  Gateway->>Live: Start session
  Live->>Kafka: live.session.started
  Live-->>SellerApp: Live status

  Buyer->>BuyerApp: Open live page
  BuyerApp->>Gateway: Get live detail
  Gateway->>Live: Load live session
  Live-->>BuyerApp: Playback and pinned products
  BuyerApp->>Gateway: Connect WebSocket
  Gateway->>Live: WebSocket upgrade
  Live->>Kafka: live.viewer.joined
  Live-->>BuyerApp: Viewer count

  Seller->>SellerApp: Pin product
  SellerApp->>Gateway: Pin product request
  Gateway->>Live: Pin product
  Live->>Product: Verify product
  Product-->>Live: Product snapshot
  Live->>Kafka: live.product.pinned
  Live-->>BuyerApp: Pinned product update

  Buyer->>BuyerApp: Send live chat
  BuyerApp->>Live: Create live message
  Live->>Kafka: live.message.created
  Live-->>SellerApp: New live message

  Buyer->>BuyerApp: Click pinned product
  BuyerApp->>Gateway: Track product click
  Gateway->>Live: Track product click
  Live->>Kafka: live.product.clicked
  BuyerApp-->>Buyer: Product detail or cart

  Kafka->>Analytics: Consume events
  Analytics-->>SellerApp: KPI summary
```

## 3) Realtime And Event Tracking

```mermaid
graph TB
  subgraph Realtime
    BuyerWS[Buyer WebSocket] --> LiveWS[Live WS Handler]
    SellerWS[Seller WebSocket] --> LiveWS
    LiveWS --> Hub[Room Hub]
    Hub --> BuyerWS
    Hub --> SellerWS
    LiveWS --> RedisPresence[Redis Presence]
  end

  subgraph Persistence
    LiveWS --> MongoMessages[(Live Messages)]
    LiveAPI[Live REST API] --> MongoSessions[(Live Sessions)]
    LiveAPI --> MongoProducts[(Pinned Products)]
  end

  subgraph Events
    LiveWS --> KafkaAnalytics[(Analytics Events)]
    LiveAPI --> KafkaLive[(Live Events)]
    KafkaAnalytics --> Analytics[Analytics Service]
    KafkaLive --> Workers[Future Workers]
  end
```

Ghi chú:

- WebSocket dùng cho thao tác cần realtime: viewer count, chat, pinned product update.
- MongoDB lưu state chính để reload page vẫn lấy lại được dữ liệu.
- Kafka dùng cho analytics/audit/worker để không làm chậm live interaction.

## 4) Future Translation Flow

```mermaid
graph LR
  Streamer[Streamer Audio] --> Audio[Audio Chunks]
  Audio --> ASR[ASR Worker]
  ASR --> Transcript[(Transcript)]
  Transcript --> Translate[Translation Worker]
  Translate --> Translation[(Vietnamese Caption)]
  Translation --> LiveService[Live Service]
  LiveService --> BuyerCaption[Buyer Caption]

  Translation --> TTS[TTS Worker]
  TTS --> AudioSegment[(Translated Audio)]
  AudioSegment --> Delivery[Audio Delivery]
  Delivery --> BuyerAudio[Buyer Audio]
```

Triển khai theo thứ tự:

1. Text caption demo: nhập transcript English giả lập, dịch sang Vietnamese caption.
2. ASR caption thật: tách audio chunk, chạy speech-to-text, gửi caption realtime.
3. Voice dubbing: thêm TTS và delivery audio tiếng Việt.

## 5) Service Boundary

```mermaid
graph LR
  Live[Live Service] --> LiveData[Live Data]
  Chat[Chat Service] --> ChatData[Chat Data]
  Product[Product Service] --> ProductData[Product Data]
  CartOrder[Cart Order Payment] --> CommerceData[Commerce Data]

  Live --> Product
  Live --> CartOrder
```

Ghi chú:

- `live-service` không xử lý checkout.
- `chat-service` không xử lý live room.
- `product-service` là nguồn sự thật về sản phẩm.
