<p align="center">
  <img src="https://img.shields.io/badge/Go-microservices-00ADD8?style=for-the-badge&logo=go&logoColor=white" />
  <img src="https://img.shields.io/badge/NestJS-auth--service-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-web--apps-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Expo-mobile--app-000020?style=for-the-badge&logo=expo&logoColor=white" />
</p>

<h1 align="center">Ecommerce Microservices Platform</h1>

<p align="center">
  A production-like ecommerce platform built as a microservices monorepo, with Go services, a NestJS authentication service, Next.js web apps, an Expo mobile app, event-driven workflows, and realtime commerce features.
</p>

---

## Overview

This project is an end-to-end ecommerce platform designed to demonstrate how a modern commerce system can be built and operated using microservices.

The platform includes:

- Buyer web and mobile experiences.
- Seller dashboard for product, order, video, live, and analytics workflows.
- Moderator dashboard for content moderation.
- API Gateway as the single public API entry point.
- Authentication with email/password, Google OAuth, JWT sessions, refresh tokens, and role-based access control.
- Commerce services for catalog, cart, checkout, order, payment, inventory, shipping, and review flows.
- Realtime services for buyer-seller chat and livestream commerce.
- Media storage and playback through MinIO and MediaMTX.
- Analytics and recommendation features, including FP-Growth association-rule mining.
- Local Docker Compose runtime with optional monitoring and logging configuration.

## High-Level Runtime Architecture

![Ecommerce microservices runtime architecture](./docs/diagram/ecommerce-runtime-architecture.png)

## DevSecOps Code Deployment Flow

The target delivery model uses GitLab CI for validation and artifact publishing, Harbor for trusted images, Argo CD for GitOps deployment, Kyverno for runtime admission control, Prometheus/Grafana for metrics, and ELK/Filebeat for logs.

```mermaid
flowchart LR
  dev[Developer<br/>writes code] -->|Push code| repo[GitLab Repository<br/>source code]

  subgraph ci["GitLab CI - Code, Test, Build, and Security Gates"]
    repo -->|Trigger pipeline| detect[Detect changed<br/>services]
    detect --> lint[Lint + unit tests]
    lint --> gitleaks[Gitleaks<br/>secret scan]
    gitleaks --> semgrep[Semgrep<br/>SAST scan]
    semgrep --> trivyfs[Trivy<br/>dependency + filesystem scan]
    trivyfs --> docker[Docker build<br/>service image]
    docker --> trivyimg[Trivy<br/>image scan]
    trivyimg --> sbom[Generate SBOM]
    sbom --> cosign[Cosign<br/>sign image]
  end

  cosign -->|Push signed image<br/>tag + digest| harbor[(Harbor Registry)]

  subgraph gitops["GitOps CD Flow"]
    release[GitLab CI<br/>release job] -->|Update image digest| values[GitOps config<br/>Helm values]
    values -->|Pull desired state| argocd[Argo CD]
  end

  ci -->|Main/develop passed| release
  argocd -->|Sync application| kyverno[Kyverno<br/>admission policies]
  kyverno -->|Allow compliant workload| k8s[Kubernetes Cluster<br/>ecommerce microservices]
  k8s -.->|Pull signed image<br/>by digest| harbor
  k8s --> smoke[Smoke tests<br/>API Gateway + frontends]

  subgraph metrics["Metrics Observability"]
    k8s -.->|Scrape /metrics| prometheus[Prometheus]
    prometheus --> grafana[Grafana<br/>dashboards + alerts]
  end

  subgraph logs["ELK Logging"]
    k8s -.->|Container logs| filebeat[Filebeat]
    filebeat --> logstash[Logstash<br/>parse + enrich]
    logstash --> elastic[(Elasticsearch)]
    elastic --> kibana[Kibana<br/>search + dashboards]
  end

  release -.->|Pipeline/deploy result| notify[Email / Slack notification]
```

Security gates are split across the pipeline and the cluster:

- GitLab CI runs Gitleaks, Semgrep, Trivy filesystem scan, Trivy image scan, SBOM generation, and Cosign image signing.
- Harbor stores signed internal images.
- Argo CD deploys from Git instead of applying manifests directly from CI.
- Kyverno blocks non-compliant workloads, such as images outside Harbor, `latest` tags, privileged containers, missing resource limits, or unsigned images.

## Repository Organization

```txt
ecommerce-microservices/
├── services/
│   ├── api-gateway/              # Go API gateway and public API router
│   ├── auth-service/             # NestJS authentication, OAuth, JWT, sessions, MFA
│   ├── user-service/             # User profiles and addresses
│   ├── product-service/          # Product catalog, shops, shoppable videos
│   ├── media-service/            # Media upload/download and MinIO integration
│   ├── cart-service/             # Shopping cart and price snapshots
│   ├── order-service/            # Order lifecycle and checkout orchestration
│   ├── payment-service/          # Payment intent and payment event handling
│   ├── inventory-service/        # Stock, reservation, and inventory events
│   ├── shipping-service/         # Shipment and delivery tracking
│   ├── notification-service/     # Email/notification delivery
│   ├── analytics-service/        # Metrics, events, reports, FP-Growth recommendations
│   ├── review-service/           # Product ratings and reviews
│   ├── chat-service/             # Buyer-seller realtime chat
│   └── live-service/             # Livestream commerce sessions and live events
│
├── frontend/
│   ├── apps/
│   │   ├── buyer-web/            # Buyer-facing Next.js web application
│   │   ├── seller/               # Seller dashboard
│   │   ├── moderator/            # Moderator dashboard
│   │   └── buyer-mobile/         # Expo / React Native buyer mobile application
│   └── packages/                 # Shared frontend contracts and utilities
│
├── packages/backend-shared/      # Shared NestJS/backend utilities
├── shared/                       # Shared contracts, Kafka topics, proto files, types
├── infrastructure/               # Docker, Kafka, monitoring, and logging assets
└── docs/                         # Architecture, API docs, operations docs, runbooks
```

## Backend Service Inventory

| Service | Runtime | Responsibility |
|---|---|---|
| `api-gateway` | Go | Public API routing, JWT validation, CORS, rate limiting, metrics |
| `auth-service` | NestJS / TypeScript | Login, registration, Google OAuth, JWT, refresh tokens, sessions, MFA |
| `user-service` | Go | Buyer/seller profile and address management |
| `product-service` | Go | Product catalog, shops, product assets, shoppable video metadata |
| `media-service` | Go | Media object storage integration through MinIO |
| `cart-service` | Go | Buyer cart, item snapshots, cart validation |
| `order-service` | Go | Checkout, order status lifecycle, order audit logs |
| `payment-service` | Go | Payment intents, payment status, payment events |
| `inventory-service` | Go | Stock levels, reservations, inventory outbox events |
| `shipping-service` | Go | Shipment creation and tracking events |
| `notification-service` | Go | Notification and email event processing |
| `analytics-service` | Go | Business events, dashboards, seller KPIs, recommendation rules |
| `review-service` | Go | Ratings, reviews, review summaries |
| `chat-service` | Go | Conversations, messages, WebSocket delivery, chat events |
| `live-service` | Go | Live sessions, product pinning, live chat, viewer presence, live events |

## Frontend Applications

| Application | Runtime | Main users |
|---|---|---|
| `frontend/apps/buyer-web` | Next.js | Buyers browsing products, videos, livestreams, cart, checkout, orders, chat |
| `frontend/apps/buyer-mobile` | Expo / React Native | Mobile buyer experience |
| `frontend/apps/seller` | Next.js | Sellers managing products, orders, videos, livestreams, analytics |
| `frontend/apps/moderator` | Next.js | Moderators reviewing products, videos, and safety-related chat issues |

## Core Business Flows

### Authentication And Authorization

The authentication flow is handled by `auth-service`.

- Email/password login issues an internal JWT session.
- Google OAuth verifies the user's Google identity first, then the system issues its own JWT tokens.
- `accessToken` is sent as `Authorization: Bearer <token>` when calling protected APIs.
- `refreshToken` is used to rotate sessions and obtain a new access token.
- The API Gateway validates JWTs before forwarding protected requests to downstream services.
- Role-based access control separates buyer, seller, moderator, support, admin, and super admin access.

### Buyer Checkout

```txt
Buyer -> API Gateway -> Cart Service -> Order Service
      -> Inventory Service -> Payment Service -> Shipping Service
      -> Notification Service -> Analytics Service
```

The checkout workflow is designed around explicit state transitions and event-driven side effects. Orders are stored in PostgreSQL, while inventory, payment, shipping, notification, and analytics workflows can react through Kafka events and outbox records.

### Shoppable Video

Seller video content is managed through the product and media services:

```txt
Seller Web -> API Gateway -> Product Service -> Media Service -> MinIO
Moderator approval -> Published video feed
Buyer watches video -> product click/comment/cart/order events -> Analytics
```

This allows buyers to discover products through short videos and move directly from content to product detail, cart, or checkout.

### Livestream Commerce

Livestream commerce combines live media playback, realtime room state, product pinning, chat, and analytics:

```txt
Seller Web -> Live Service -> Live Session / Product Pinning
Seller media publish -> MediaMTX
Buyer playback -> MediaMTX
Buyer/Seller realtime state -> Live WebSocket -> Live Service
Live events -> Kafka -> Analytics
```

### Buyer-Seller Chat

Chat is built around conversation documents, message persistence, Redis Pub/Sub, WebSocket delivery, and Kafka events:

```txt
Buyer/Seller -> API Gateway -> Chat Service
Chat Service -> MongoDB for messages
Chat Service -> Redis Pub/Sub for realtime fan-out
Chat Service -> Kafka for notification and analytics events
```

### FP-Growth Recommendations

The analytics service includes an FP-Growth recommendation module. Completed orders are transformed into product baskets, then frequent itemsets and association rules are mined to recommend products commonly purchased together.

```txt
Completed Orders -> Recommendation Transactions -> FP-Growth Trainer
-> Association Rules -> Product/Cart Recommendations -> Buyer UI + Seller Analytics
```

The main implementation is in:

```txt
services/analytics-service/internal/recommendation/fpgrowth.go
```

## Local Runtime

The default local stack is managed through Docker Compose:

```bash
docker compose up
```

Service-specific Dockerfiles remain under `services/*/Dockerfile`, and shared local infrastructure assets remain under `infrastructure/docker`, `infrastructure/kafka`, `infrastructure/monitoring`, and `infrastructure/logging`.

## Documentation

Key documents:

- [System design](./docs/architecture/system-design.md)
- [Data flow](./docs/architecture/data-flow.md)
- [Kafka events](./docs/architecture/kafka-events.md)
- [Security](./docs/architecture/security.md)
- [DevSecOps platform design](./docs/devsecops/new-platform-design.md)
- [API documentation](./docs/api/README.md)
- [Development standards](./docs/development/code-standards.md)

## License

Licensed under the [MIT License](./LICENSE).
