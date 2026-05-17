# Livestream Flow, Technology, And Algorithms

Tài liệu này mô tả luồng hoạt động livestream hiện tại của hệ thống eMall theo hướng production-like: `live-service` quản lý nghiệp vụ live, còn `MediaMTX` xử lý video/audio realtime.

## 1. Sơ đồ tổng quan

```mermaid
flowchart LR
    Seller["Seller Browser<br/>Seller Web App"]
    Buyer["Buyer Browser<br/>Buyer Web App"]

    SellerAPI["Seller Next API Routes"]
    BuyerAPI["Buyer Next API Routes"]

    LiveService["Live Service<br/>Go + Chi + WebSocket"]
    AuthService["Auth Service<br/>NestJS + JWT Session"]
    ProductService["Product Service"]
    MediaService["Media Service<br/>File/Thumbnail/Replay"]

    MediaMTX["MediaMTX<br/>WHIP/WHEP/WebRTC Media Engine"]

    Mongo[("MongoDB<br/>live_sessions<br/>live_messages<br/>live_products")]
    Redis[("Redis<br/>presence/count/rate-limit")]
    Kafka["Kafka<br/>analytics events"]

    Seller -- "REST: create/start/pause/end live" --> SellerAPI
    SellerAPI -- "REST + Bearer JWT" --> LiveService
    SellerAPI -- "JWT validation" --> AuthService

    Buyer -- "REST: list/get live/products/metrics" --> BuyerAPI
    BuyerAPI -- "REST + optional JWT" --> LiveService
    BuyerAPI -- "Product detail" --> ProductService

    Seller -- "WHIP publish camera/screen" --> MediaMTX
    Buyer -- "WHEP playback stream" --> MediaMTX

    Seller -- "WebSocket signaling/control" --> LiveService
    Buyer -- "WebSocket chat/events" --> LiveService

    LiveService --> Mongo
    LiveService --> Redis
    LiveService --> Kafka
    LiveService --> ProductService
    MediaService --> Mongo
```

## 2. Phân tách control plane và media plane

```mermaid
flowchart TB
    subgraph ControlPlane["Control Plane - nghiệp vụ livestream"]
        C1["Tạo phiên live"]
        C2["Start/Pause/End"]
        C3["Pin/Bỏ pin sản phẩm"]
        C4["Chat realtime"]
        C5["Viewer count + media metrics"]
        C6["Event analytics"]
    end

    subgraph MediaPlane["Media Plane - video/audio realtime"]
        M1["Seller capture camera/screen"]
        M2["WHIP publish to MediaMTX"]
        M3["MediaMTX relay WebRTC"]
        M4["Buyer WHEP playback"]
    end

    subgraph StorageAndInfra["Storage + Infrastructure"]
        S1[("MongoDB")]
        S2[("Redis")]
        S3["Kafka"]
    end

    ControlPlane --> S1
    ControlPlane --> S2
    ControlPlane --> S3
    MediaPlane --> M4

    C1 -. "Trả media publish/playback URL" .-> M2
    C5 -. "Buyer gửi metric playback" .-> ControlPlane
```

## 3. Luồng seller tạo và phát livestream

```mermaid
sequenceDiagram
    autonumber
    actor Seller
    participant SellerWeb as Seller Web App
    participant SellerAPI as Seller Next API
    participant Auth as Auth Service
    participant Live as Live Service
    participant Product as Product Service
    participant Media as MediaMTX
    participant Mongo as MongoDB
    participant Kafka as Kafka

    Seller->>SellerWeb: Mở trang Live & Video
    SellerWeb->>SellerAPI: Login hoặc dùng session hiện tại
    SellerAPI->>Auth: Validate JWT/session
    Auth-->>SellerAPI: User role SELLER

    Seller->>SellerWeb: Tạo phiên live
    SellerWeb->>SellerAPI: POST /seller/live/sessions
    SellerAPI->>Live: POST /live/sessions
    Live->>Mongo: Lưu live session
    Live-->>SellerAPI: Session + media URL
    SellerAPI-->>SellerWeb: Phiên live đã tạo

    Seller->>SellerWeb: Bấm Bắt đầu LIVE
    SellerWeb->>SellerAPI: PATCH /live/sessions/{id}/start
    SellerAPI->>Live: Start session
    Live->>Mongo: Update status LIVE
    Live->>Kafka: Publish live.started
    Live-->>SellerWeb: Status LIVE

    Seller->>SellerWeb: Bấm Bắt đầu phát
    SellerWeb->>SellerWeb: getUserMedia camera/micro hoặc getDisplayMedia
    SellerWeb->>Media: WHIP publish WebRTC offer
    Media-->>SellerWeb: WHIP answer
    SellerWeb-->>Seller: Preview đang phát

    Seller->>SellerWeb: Chọn sản phẩm để pin
    SellerWeb->>SellerAPI: GET seller products
    SellerAPI->>Product: List products by seller
    Product-->>SellerAPI: Product list
    SellerWeb->>SellerAPI: POST /live/sessions/{id}/products
    SellerAPI->>Live: Pin product
    Live->>Mongo: Lưu live product
    Live-->>SellerWeb: Product pinned
```

## 4. Luồng buyer xem livestream

```mermaid
sequenceDiagram
    autonumber
    actor Buyer
    participant BuyerWeb as Buyer Web App
    participant BuyerAPI as Buyer Next API
    participant Live as Live Service
    participant Media as MediaMTX
    participant Mongo as MongoDB
    participant WS as Live WebSocket Hub
    participant Kafka as Kafka

    Buyer->>BuyerWeb: Mở danh sách live
    BuyerWeb->>BuyerAPI: GET /buyer/live/sessions?status=LIVE
    BuyerAPI->>Live: GET /live/sessions
    Live->>Mongo: Query live_sessions
    Live-->>BuyerAPI: Live sessions
    BuyerAPI-->>BuyerWeb: Render live list

    Buyer->>BuyerWeb: Vào trang /live/{sessionId}
    BuyerWeb->>BuyerAPI: GET /buyer/live/sessions/{sessionId}
    BuyerAPI->>Live: GET /live/sessions/{sessionId}
    Live->>Mongo: Query session + pinned products
    Live-->>BuyerAPI: Session detail
    BuyerAPI-->>BuyerWeb: Render live detail

    BuyerWeb->>Media: WHEP playback WebRTC offer
    Media-->>BuyerWeb: WHEP answer
    BuyerWeb-->>Buyer: Hiển thị video live

    BuyerWeb->>WS: Connect /live/ws?sessionId=...
    WS-->>BuyerWeb: WebSocket connected

    BuyerWeb->>BuyerAPI: POST media metric
    BuyerAPI->>Live: Track playback metric
    Live->>Kafka: Publish live.media.metric

    Buyer->>BuyerWeb: Gửi chat
    BuyerWeb->>WS: live:message:create
    WS->>Live: SendMessage
    Live->>Mongo: Insert live_messages
    Live->>Kafka: Publish live.message.created
    Live->>WS: Broadcast live:message:new
    WS-->>BuyerWeb: Message realtime
```

## 5. Thuật toán gửi chat realtime

```mermaid
flowchart TD
    Start["Buyer/Seller gửi live:message:create"] --> AuthCheck{"Có JWT hợp lệ?"}
    AuthCheck -- "Không" --> RejectAuth["Trả error UNAUTHORIZED"]
    AuthCheck -- "Có" --> SessionCheck["Load live session từ MongoDB"]

    SessionCheck --> LiveCheck{"Session status = LIVE?"}
    LiveCheck -- "Không" --> RejectStatus["Trả error CONFLICT"]
    LiveCheck -- "Có" --> TextValidate{"Text 1..1000 ký tự?"}

    TextValidate -- "Không" --> RejectText["Trả validation error"]
    TextValidate -- "Có" --> RateLimit{"Qua rate limit Redis/in-memory?"}

    RateLimit -- "Không" --> RejectRate["Trả 429 RATE_LIMITED"]
    RateLimit -- "Có" --> Idempotent{"clientMessageId đã tồn tại?"}

    Idempotent -- "Có" --> ReturnExisting["Trả lại message cũ"]
    Idempotent -- "Không" --> CreateMsg["Tạo messageId + metadata"]

    CreateMsg --> SaveMongo["Insert live_messages MongoDB"]
    SaveMongo --> PublishKafka["Publish live.message.created"]
    PublishKafka --> Broadcast["Broadcast live:message:new qua WebSocket Hub"]
    Broadcast --> Ack["Trả ack cho client gửi"]
```

Ghi chú hiện tại: message đã được lưu vào `live_messages`, nhưng UI chưa có API load lịch sử chat khi refresh trang. Chat hiện đang hiển thị realtime message trong state của trang.

## 6. Thuật toán phát và xem WebRTC qua MediaMTX

```mermaid
flowchart LR
    subgraph SellerPublish["Seller publish"]
        S1["Chọn camera/screen"]
        S2["Tạo RTCPeerConnection"]
        S3["Add local tracks"]
        S4["Create WebRTC offer"]
        S5["POST offer đến MediaMTX WHIP endpoint"]
        S6["Nhận answer"]
        S7["Set remote description"]
        S8["Đang phát"]
    end

    subgraph BuyerPlayback["Buyer playback"]
        B1["Load session detail"]
        B2["Lấy playback/WHEP URL"]
        B3["Tạo RTCPeerConnection"]
        B4["Create receive-only offer"]
        B5["POST offer đến MediaMTX WHEP endpoint"]
        B6["Nhận answer"]
        B7["Set remote description"]
        B8["Hiển thị remote stream"]
    end

    S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7 --> S8
    B1 --> B2 --> B3 --> B4 --> B5 --> B6 --> B7 --> B8
```

## 7. Thuật toán reconnect phía buyer

```mermaid
flowchart TD
    Load["Buyer mở trang live"] --> Fetch["Fetch session detail"]
    Fetch --> TryWHEP["Thử kết nối WHEP/WebRTC"]
    TryWHEP --> Connected{"Kết nối thành công?"}
    Connected -- "Có" --> Playing["Video playing"]
    Connected -- "Không" --> Fallback{"Có playbackUrl MP4/HLS fallback?"}
    Fallback -- "Có" --> PlayFallback["Play fallback URL bằng video player"]
    Fallback -- "Không" --> Retry["Set trạng thái đang kết nối và retry"]
    Retry --> TryWHEP
    Playing --> Metric["Gửi media metric về live-service"]
```

## 8. Công nghệ sử dụng

| Thành phần | Công nghệ | Vai trò |
| --- | --- | --- |
| Buyer Web | Next.js, React, WebRTC WHEP, WebSocket | Xem livestream, chat, click sản phẩm, gửi media metrics |
| Seller Web | Next.js, React, WebRTC WHIP, Media Capture API | Tạo phiên live, publish camera/screen, pin sản phẩm |
| Live Service | Go, Chi router, Gorilla WebSocket | Quản lý session live, chat, product pin, metrics, event tracking |
| Media Engine | MediaMTX | Nhận WHIP stream từ seller và phát WHEP stream cho buyer |
| Auth Service | NestJS, JWT, session revocation | Xác thực buyer/seller và kiểm soát session đăng nhập |
| Product Service | Go service | Cung cấp sản phẩm để seller pin trong live |
| MongoDB | Document database | Lưu live sessions, pinned products, live messages |
| Redis | Cache/presence/rate limit | Viewer presence, rate limit, session/token revocation hỗ trợ |
| Kafka | Event broker | Gửi event analytics như live started, message created, product clicked, media metric |

## 9. Ranh giới trách nhiệm

```mermaid
flowchart TB
    LiveService["Live Service"]
    MediaMTX["MediaMTX"]
    ProductService["Product Service"]
    AuthService["Auth Service"]
    MediaService["Media Service"]

    LiveService --> L1["Tạo/quản lý phiên live"]
    LiveService --> L2["Chat realtime"]
    LiveService --> L3["Pin sản phẩm"]
    LiveService --> L4["Viewer count + metrics"]
    LiveService --> L5["Publish analytics event"]

    MediaMTX --> M1["Nhận media từ seller"]
    MediaMTX --> M2["Relay video/audio cho buyer"]
    MediaMTX --> M3["Giảm tải upload phía seller"]

    ProductService --> P1["Danh sách sản phẩm của shop"]
    ProductService --> P2["Thông tin sản phẩm được pin"]

    AuthService --> A1["Login/JWT/session"]
    AuthService --> A2["Một user chỉ có một session active"]

    MediaService --> MS1["Thumbnail/file/replay nếu mở rộng recording"]
```

## 10. Trạng thái hiện tại và phần có thể mở rộng

| Hạng mục | Trạng thái hiện tại |
| --- | --- |
| Seller publish video | Đã có luồng WHIP lên MediaMTX |
| Buyer xem video | Đã có luồng WHEP từ MediaMTX |
| Live session lifecycle | Đã có create/start/pause/end |
| Pin sản phẩm | Đã có chọn sản phẩm và pin vào live |
| Chat realtime | Đã có WebSocket và lưu MongoDB |
| Load lịch sử chat | Chưa có API load history sau refresh |
| Metrics playback | Đã có endpoint media metric |
| Analytics event | Đã publish Kafka theo các event chính |
| Recording/replay | Chưa triển khai đầy đủ |
| CDN/HLS quy mô lớn | Chưa triển khai, hiện ưu tiên WebRTC low-latency |
