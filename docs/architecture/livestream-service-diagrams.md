# Livestream Service Diagrams

Last updated: 2026-05-16  
Scope: `live-service` livestream commerce MVP and future translation flow

## 1) Technology Architecture

```mermaid
flowchart LR
  Seller[Seller Web App<br/>Next.js] -->|REST: create/start/end/pin| Gateway[API Gateway<br/>Go chi reverse proxy]
  Buyer[Buyer Web App<br/>Next.js] -->|REST: list/detail/products| Gateway
  Buyer -->|WebSocket live.v1| Gateway
  Seller -->|WebSocket live.v1| Gateway

  Gateway --> Live[Live Service<br/>Go chi + gorilla/websocket]

  Live --> Mongo[(MongoDB<br/>live_sessions<br/>live_session_products<br/>live_messages)]
  Live --> Redis[(Redis<br/>presence count<br/>pub/sub cache)]
  Live --> Kafka[(Kafka<br/>live.events<br/>analytics.events)]
  Live -->|REST verify product| Product[Product Service<br/>product status/price/image]

  Kafka --> Analytics[Analytics Service<br/>event ingest + KPI summary]
  Buyer -->|product detail/add-to-cart| Commerce[Product/Cart/Order Flow]
```

Ghi chú:

- `api-gateway` là entrypoint duy nhất cho frontend.
- `live-service` sở hữu live session, room realtime, pinned products và live messages.
- `product-service` chỉ cung cấp product truth như status, seller owner, price, image.
- `analytics-service` nhận event bất đồng bộ từ Kafka để tính KPI.

## 2) MVP Demo Flow

```mermaid
sequenceDiagram
  autonumber
  actor Seller
  participant SellerApp as Seller Web App
  participant Gateway as API Gateway
  participant Live as Live Service
  participant Product as Product Service
  participant BuyerApp as Buyer Web App
  actor Buyer
  participant Kafka as Kafka
  participant Analytics as Analytics Service

  Seller->>SellerApp: Nhập title + playbackUrl
  SellerApp->>Gateway: POST /api/v1/live/sessions
  Gateway->>Live: Forward create session
  Live-->>SellerApp: sessionId, status=DRAFT

  Seller->>SellerApp: Bấm Start
  SellerApp->>Gateway: PATCH /api/v1/live/sessions/:id/start
  Gateway->>Live: Start session
  Live->>Kafka: live.session.started
  Live-->>SellerApp: status=LIVE

  Buyer->>BuyerApp: Mở /live/:sessionId
  BuyerApp->>Gateway: GET /api/v1/live/sessions/:id
  Gateway->>Live: Get session detail
  Live-->>BuyerApp: playbackUrl + pinnedProducts
  BuyerApp->>Gateway: WS /api/v1/live/ws?sessionId=:id
  Gateway->>Live: WebSocket upgrade
  Live->>Kafka: live.viewer.joined
  Live-->>BuyerApp: live:viewer:count

  Seller->>SellerApp: Pin product
  SellerApp->>Gateway: POST /api/v1/live/sessions/:id/products
  Gateway->>Live: Pin product
  Live->>Product: GET /api/v1/products/:productId
  Product-->>Live: ACTIVE product snapshot
  Live->>Kafka: live.product.pinned
  Live-->>BuyerApp: WS live:product:pinned

  Buyer->>BuyerApp: Chat trong live
  BuyerApp->>Live: WS live:message:create
  Live->>Kafka: live.message.created
  Live-->>SellerApp: WS live:message:new

  Buyer->>BuyerApp: Click sản phẩm pinned
  BuyerApp->>Gateway: POST /api/v1/live/sessions/:id/events/product-clicked
  Gateway->>Live: Track product click
  Live->>Kafka: live.product.clicked
  BuyerApp-->>Buyer: Điều hướng product detail/add-to-cart

  Kafka->>Analytics: Consume analytics.events
  Analytics-->>SellerApp: KPI summary sau demo
```

## 3) Realtime And Event Tracking

```mermaid
flowchart TB
  subgraph Realtime["Realtime path"]
    BuyerWS[Buyer WebSocket] --> LiveWS[Live Service WS Handler]
    SellerWS[Seller WebSocket] --> LiveWS
    LiveWS --> Hub[In-memory Room Hub]
    Hub --> BuyerWS
    Hub --> SellerWS
    LiveWS --> RedisPresence[Redis Presence Counter]
  end

  subgraph Persistence["Persistence path"]
    LiveWS --> MongoMessages[(MongoDB live_messages)]
    LiveAPI[Live REST API] --> MongoSessions[(MongoDB live_sessions)]
    LiveAPI --> MongoProducts[(MongoDB live_session_products)]
  end

  subgraph Events["Async event path"]
    LiveWS --> KafkaAnalytics[(Kafka analytics.events)]
    LiveAPI --> KafkaLive[(Kafka live.events)]
    KafkaAnalytics --> Analytics[Analytics Service]
    KafkaLive --> AuditOrWorkers[Future workers / audit / moderation]
  end
```

Ghi chú:

- WebSocket dùng cho thao tác cần realtime: viewer count, chat, pinned product update.
- MongoDB lưu state chính để reload page vẫn lấy lại được dữ liệu.
- Kafka dùng cho analytics/audit/worker để không làm chậm live interaction.

## 4) Future Translation Flow

```mermaid
flowchart LR
  Streamer[Streamer nói tiếng Anh] --> Audio[Audio chunks<br/>3-5 seconds]
  Audio --> ASR[ASR Worker<br/>Whisper/faster-whisper]
  ASR --> Transcript[(live_transcripts<br/>English text)]
  Transcript --> Translate[Translation Worker<br/>English -> Vietnamese]
  Translate --> Translation[(live_translations<br/>Vietnamese caption)]
  Translation --> LiveService[Live Service]
  LiveService -->|WS live:caption:new| BuyerCaption[Buyer sees Vietnamese captions]

  Translation --> TTS[TTS Worker<br/>Vietnamese speech]
  TTS --> AudioSegment[(Translated audio segments)]
  AudioSegment --> Delivery[HLS alternate audio<br/>or WebRTC audio]
  Delivery --> BuyerAudio[Buyer hears Vietnamese audio]
```

Triển khai theo thứ tự:

1. Text caption demo: nhập transcript English giả lập, dịch sang Vietnamese caption.
2. ASR caption thật: tách audio chunk, chạy speech-to-text, gửi caption realtime.
3. Voice dubbing: thêm TTS và delivery audio tiếng Việt.

## 5) Service Boundary

```mermaid
flowchart LR
  Live[Live Service] -->|owns| LiveData[Live sessions<br/>Live messages<br/>Pinned products<br/>Viewer presence<br/>Transcript/translation]
  Chat[Chat Service] -->|owns| ChatData[Private buyer-seller chat<br/>Support chat<br/>Order conversation]
  Product[Product Service] -->|owns| ProductData[Product status<br/>Price<br/>Image<br/>Seller ownership]
  CartOrder[Cart/Order/Payment] -->|owns| CommerceData[Cart<br/>Order<br/>Payment]

  Live -->|verify snapshot only| Product
  Live -->|track click only| CartOrder
```

Ghi chú:

- `live-service` không xử lý checkout.
- `chat-service` không xử lý live room.
- `product-service` là nguồn sự thật về sản phẩm.
