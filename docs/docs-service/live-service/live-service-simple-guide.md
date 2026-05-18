# Live Service - Simple Guide

Go live-commerce service (`services/live-service/`). MongoDB + Redis + Kafka; media via **MediaMTX** (WHIP/WebRTC).

## 1) Gốc service

`services/live-service/`

## 2) Đọc nhanh

1. `cmd/server/main.go`
2. `internal/router/router.go`
3. `internal/handler/` (sessions, WebSocket, events)
4. `internal/service/`
5. `internal/events/` (Kafka publisher)

## 3) Tích hợp

| Thành phần | Vai trò |
|---|---|
| MongoDB | `ecommerce_live` — sessions, chat overlay state |
| MediaMTX | Ingest/playback (`LIVE_MEDIA_*` env, port `12089` in compose) |
| Kafka | `live.events`, `analytics.events`, `audit.events` |
| product-service | Product pinning / catalog lookups |

## 4) Gateway

Public: browse live sessions, WebSocket `/api/v1/live/ws`.  
Protected: seller session management under JWT.

## 5) Chạy local

```bash
docker compose up -d live-service mongo redis kafka mediamtx product-service
```

Port: **12023**.

```bash
cd services/live-service && go test ./...
```
