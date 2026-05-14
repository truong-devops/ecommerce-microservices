# Shoppable Video Demo Script

Last updated: 2026-05-15
Scope: seller upload video, buyer watch video, moderation, analytics/KPI.

## 1) Demo goal

Show that eMall can support short-form commerce video similar to a real marketplace:

- Seller uploads a video and attaches active products.
- Moderator can approve/reject submitted videos when review mode is enabled.
- Buyer sees published videos on home and `/videos`.
- Buyer view/click events update video metrics and can flow into analytics.

## 2) Required services

Run the local stack before demo:

```bash
docker compose up -d
```

Recommended apps:

- Buyer web: `http://localhost:8888`
- Seller web: `http://localhost:6789`
- Moderator web: `http://localhost:1111`
- API gateway: `http://localhost:12000/api/v1`

## 3) Environment notes

For fast local demo, keep review bypass disabled or enabled depending on the story:

```env
VIDEO_REVIEW_REQUIRED=false
KAFKA_ENABLED=true
ANALYTICS_EVENTS_TOPIC=analytics.events
MEDIA_PUBLIC_BASE_URL=http://localhost:12030/ecommerce-media
```

Use `VIDEO_REVIEW_REQUIRED=true` only when you want to demo moderator approval before buyer visibility.

## 4) Demo data checklist

Before recording or presenting:

| Item | Expected state | Where to check |
|---|---|---|
| Seller account | Can login to seller app | Seller web |
| Moderator account | Role is `MODERATOR`, `ADMIN`, or `SUPER_ADMIN` | Moderator web |
| Product | At least one active product owned by seller | Seller products |
| Video file | `mp4` or `webm`, short local sample | Local machine |
| Media service | Upload accepts `video/mp4` or `video/webm` | Seller video upload |
| Product service | `/api/v1/videos` routes available | API gateway/product-service |

## 5) 8-10 minute presentation flow

1. Introduce business problem: seller needs richer product storytelling than static images.
2. Open Seller Center and go to `Marketing -> Video bán hàng`.
3. Create a video draft with title, description, and one active product.
4. Upload `mp4/webm`, wait for upload confirmation, then publish or submit review.
5. If review is enabled, open Moderator app at `/videos/review`, approve the video.
6. Open Buyer web home and point out `Video nổi bật` uses backend feed when published videos exist.
7. Open `/videos`, play the video for at least 3 seconds.
8. Click a product card in the video rail and verify navigation to product detail.
9. Return to seller video management and show views/click metrics updated.
10. Explain architecture boundary: media-service stores file, product-service owns video metadata/state, analytics-service ingests events, gateway owns public/private routing.

## 6) Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Upload fails | MIME not `video/mp4` or `video/webm` | Use supported file or check media policy |
| Video created but not visible to buyer | Status is not `published` | Publish from seller or approve in moderator |
| Buyer `/videos` empty | No published video or wrong API gateway env | Check `PRODUCT_SERVICE_BASE_URL` / gateway route `/api/v1/videos/feed` |
| Event metrics do not increase | Video not played for 3 seconds or duplicate client event key | Replay with new session or click product |
| Moderator sees `FORBIDDEN` | Account role is not staff/moderator | Login with `MODERATOR`, `ADMIN`, or `SUPER_ADMIN` |
| Analytics summary empty | Kafka disabled or analytics consumer not running | Check `KAFKA_ENABLED`, `ANALYTICS_EVENTS_TOPIC`, analytics-service logs |
| Media URL 404 | `MEDIA_PUBLIC_BASE_URL` mismatch or object key wrong | Verify MinIO/media public URL and object key stored in video |

## 7) Smoke test checklist

| Step | Expected result |
|---|---|
| Seller creates draft | New item appears in seller video table |
| Seller uploads video | Status moves to `processing` and video preview loads |
| Seller publishes/submits | Status is `published` or `review_pending` |
| Moderator approves | Status moves to `published` |
| Buyer opens `/videos` | Published video appears with product rail |
| Buyer plays 3 seconds | Qualified view event accepted |
| Buyer clicks product | Product detail opens and click metric increases |

## 8) Known demo tradeoffs

- Local demo serves direct `mp4/webm`; no HLS/adaptive bitrate yet.
- Event snapshot metrics are in product-service for immediate UI feedback; analytics-service also supports video aggregate queries from raw events.
- Cleanup orphan media is documented as operational policy, not a scheduled background job yet.
