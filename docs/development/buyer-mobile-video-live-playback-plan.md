# Buyer Mobile Video & Livestream Playback Plan

## Context

Buyer mobile already has Video and Live routes wired, but playback is not reliable on physical devices yet. The likely root causes are media URLs not being reachable from the phone, inconsistent playback source fields, and missing fallback UI when a stream or video has no playable source.

This plan focuses on making video and livestream playback work reliably on Expo 54, then improving the Shopee-like viewing experience.

## Goals

- Videos play on physical devices through Expo Go over LAN.
- Livestream sessions play HLS when a live playback URL exists.
- Invalid, missing, or unreachable media sources show clear fallback UI instead of blank screens.
- Product drawer, chat/comment, and tracking remain usable even when playback is unavailable.
- Playback source selection and URL normalization are covered by unit tests.

## Non-Goals

- Native custom dev client work.
- Full WebRTC livestream playback.
- Production CDN migration.
- Backend media ingestion rewrite.

## Phase 1: Playback Source Foundation

### Scope

- Add shared media URL normalization for video/live playback.
- Rewrite `localhost`, `127.0.0.1`, `0.0.0.0`, and `::1` media hosts to the API host from `EXPO_PUBLIC_API_BASE_URL`.
- Add source selection helpers:
  - Video: prefer HLS URL, then MP4/video URL, then fallback thumbnail only.
  - Live: prefer HLS playback URL, then fallback playback URL, then thumbnail only.
- Add explicit source status:
  - `playable`
  - `thumbnail-only`
  - `missing`
  - `invalid`

### Expected Files

- `frontend/apps/buyer-mobile/src/domain/media-playback.ts`
- `frontend/apps/buyer-mobile/src/domain/media-playback.test.ts`
- Possible small updates in:
  - `frontend/apps/buyer-mobile/src/domain/videos.ts`
  - `frontend/apps/buyer-mobile/src/domain/live.ts`

### Unit Tests

- Normalizes localhost media URLs to LAN API host.
- Keeps public HTTPS URLs unchanged.
- Selects HLS before MP4 for video.
- Selects HLS before fallback URL for live.
- Returns `missing` when no playable URL exists.

### Validation

```bash
npm --workspace @frontend/buyer-mobile run test
npm --workspace @frontend/buyer-mobile run lint
npm --workspace @frontend/buyer-mobile run build
```

## Phase 2: Video Feed Playback

### Scope

- Extract a reusable `BuyerVideoPlayer` component.
- Use `expo-video` with:
  - active video autoplay.
  - pause/cleanup when switching videos.
  - loading state.
  - retry action.
  - thumbnail fallback.
  - mute/unmute control if supported cleanly by Expo Go.
- Track `view-started` and `view-qualified` only after a playable source is selected.
- Avoid blank full-screen feed when media is missing.

### Expected Files

- `frontend/apps/buyer-mobile/src/components/video/buyer-video-player.tsx`
- `frontend/apps/buyer-mobile/app/(tabs)/videos.tsx`
- `frontend/apps/buyer-mobile/src/domain/videos.ts`
- `frontend/apps/buyer-mobile/src/domain/videos.test.ts`

### Unit Tests

- Builds video event payload without requiring playback.
- Active video index wraps correctly.
- Missing media source does not produce a playback URL.
- Invalid comment/like behavior remains unchanged.

### Manual Test

- Open `Live & Video` tab on phone.
- Confirm first video either plays or shows a clear thumbnail fallback.
- Tap next/previous.
- Like/comment actions do not crash.
- Product drawer product opens product detail.

## Phase 3: Livestream Playback

### Scope

- Extract a reusable `BuyerLivePlayer` component.
- Implement live state rendering:
  - `LIVE` with HLS URL: play stream.
  - `LIVE` without HLS URL: show thumbnail fallback and “Live chưa có nguồn phát”.
  - `PAUSED`: show paused state.
  - `ENDED`: show ended state.
- Poll live session status every 5-10 seconds while on live detail.
- Keep pinned products visible even if playback is unavailable.
- Keep chat input usable when access token exists.

### Expected Files

- `frontend/apps/buyer-mobile/src/components/live/buyer-live-player.tsx`
- `frontend/apps/buyer-mobile/app/live/[sessionId].tsx`
- `frontend/apps/buyer-mobile/app/(tabs)/live.tsx`
- `frontend/apps/buyer-mobile/src/domain/live.ts`
- `frontend/apps/buyer-mobile/src/domain/live.test.ts`

### Unit Tests

- Maps live status to UI state.
- Selects HLS before fallback playback URL.
- Missing stream uses thumbnail fallback.
- Pinned product mapping remains stable.
- Chat message normalization still blocks unsafe text.

### Manual Test

- Open Live tab.
- Open a live session.
- Confirm stream plays when HLS exists.
- Confirm fallback state is readable when HLS does not exist.
- Tap pinned product and verify product detail opens.

## Phase 4: Backend Media Contract Check

### Scope

Confirm API Gateway and upstream services return enough media fields for mobile playback.

### Required Video Fields

- `videoId`
- `title`
- `thumbnailUrl`
- `videoUrl` or `hlsUrl`
- `durationSec`
- `seller`
- `products`

### Required Live Fields

- `sessionId`
- `status`
- `title`
- `thumbnailUrl`
- `hlsPlaybackUrl`
- `fallbackPlaybackUrl`
- `metricsSnapshot`
- `pinnedProducts`

### Checks

- Curl list video endpoint from Mac.
- Curl live session endpoint from Mac.
- Open returned media URLs in phone browser.
- Verify returned URLs are not `localhost`.

### Example Commands

```bash
curl -i "$EXPO_PUBLIC_API_BASE_URL/videos/feed?page=1&pageSize=3"
curl -i "$EXPO_PUBLIC_API_BASE_URL/live/sessions?page=1&pageSize=3&status=LIVE"
```

## Phase 5: Shopee-Like UX Finish

### Scope

- Video feed:
  - Full-screen video layout.
  - Top tabs: Video, Live, Cho bạn.
  - Creator row.
  - Right-side action rail.
  - Product/voucher drawer.
  - Bottom comment input.
- Live detail:
  - Full-screen stream.
  - Host info overlay.
  - Viewer count.
  - Reward/pinned product panel.
  - Chat overlay/input.
- Product click from Video/Live routes to product detail.
- Loading and error states must not block product or chat controls unnecessarily.

### Manual Test

- Video feed fits mobile viewport.
- Text does not overlap action rail or product drawer.
- Live overlay remains readable.
- Bottom tab bar remains usable.
- Product drawer does not cover comment input.

## Definition of Done

- `npm --workspace @frontend/buyer-mobile run test` passes.
- `npm --workspace @frontend/buyer-mobile run lint` passes.
- `npm --workspace @frontend/buyer-mobile run build` passes.
- Physical phone can open Video tab without blank screen.
- Physical phone can open Live tab and see either playback or explicit fallback.
- All newly added playback selection logic has unit tests.

## Run Command

```bash
cd /Users/maccuatruong/workspace/ecommerce-microservices/frontend/apps/buyer-mobile
npm run dev -- --host lan --port 8081 --clear
```

## Commit Command

```bash
git add docs/development/buyer-mobile-video-live-playback-plan.md
git commit -m "docs(buyer-mobile): add video live playback plan"
```
