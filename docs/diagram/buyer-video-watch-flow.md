# Buyer Video Watch Flow

Last updated: 2026-06-01

```mermaid
graph LR
  A[Buyer opens Video] --> B[Buyer Web]
  B --> C[API Gateway]
  C --> D[Product Service]
  D --> E[Published Video Feed]

  E --> F[Watch Video]
  F --> G[Track View Event]
  G --> H[Analytics KPI]

  E --> I[Click Product]
  I --> J[Product Detail]
  J --> K[Add To Cart or Buy Now]

  E --> L[Comment]
  L --> D
```

## Main Idea

- `Product Service` owns published video feed, video product tags, metrics, and comments.
- `Analytics` receives view/click events for video KPI.
- Buyer can watch, click product, buy, or comment from the video flow.

## Note

`add-to-cart` tracking endpoint exists, but `buyer-web` currently does not auto-send that event after local cart add.
