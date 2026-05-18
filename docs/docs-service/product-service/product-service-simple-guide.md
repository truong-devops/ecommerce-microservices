# Product Service - Simple Guide

Go catalog service (`services/product-service/`). Default stack: MongoDB + Redis; Kafka/OpenSearch optional.

## 1) Gốc service

`services/product-service/`

Legacy NestJS implementation: `services/product-service-nest/` (shadow/compare only, not in root `docker compose up`).

## 2) Đọc nhanh (5 file)

1. `cmd/server/main.go`
2. `internal/router/router.go`
3. `internal/handler/product_handler.go`
4. `internal/service/product_service.go` (và `video_service.go` cho shoppable video)
5. `internal/repository/product_repository.go`

## 3) Cấu trúc thư mục

| Path | Vai trò |
|---|---|
| `internal/config/` | Env: Mongo URI, Redis, Kafka, `SEARCH_ENABLED` |
| `internal/auth/` | JWT middleware, role checks |
| `internal/handler/` | HTTP: products, shops/decor, videos, health |
| `internal/service/` | Business logic |
| `internal/repository/` | MongoDB access |
| `internal/search/` | OpenSearch client (khi bật search) |
| `internal/middleware/` | Request ID, logging, recovery |
| `internal/httpx/` | Response envelope, errors |

## 4) Luồng request

1. Request `/api/v1/*` qua gateway.
2. JWT + RBAC (public routes: catalog browse, video feed).
3. Handler → service → repository (MongoDB).
4. Optional: index/search qua OpenSearch; publish Kafka khi `KAFKA_ENABLED=true`.

## 5) Chạy local

```bash
docker compose up -d product-service mongo redis
# hoặc full stack
./scripts/test-product-service.sh
```

Port mặc định (compose): **12012**.

## 6) Test

```bash
cd services/product-service && go test ./...
```
