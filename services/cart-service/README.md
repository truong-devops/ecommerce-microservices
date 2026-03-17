# cart-service

Cart service for buyer shopping cart in the `ecommerce-microservices` monorepo.

## Features

- NestJS + TypeScript service structure.
- Redis as primary cart store (`cart:{userId}` with sliding TTL).
- Optional PostgreSQL persistence (`CART_PERSISTENCE_ENABLED=true`).
- JWT-protected cart APIs for buyer.
- Standard response/error envelope.
- Best-effort Kafka cart events.
- External product/inventory validation abstraction (optional).

## API routes

Service supports both versioned and gateway-compatible routes:

- Versioned: `/api/v1/cart*`, `/api/v1/health`, `/api/v1/ready`, `/api/v1/live`
- Gateway-compatible: `/api/cart*`, `/api/health`, `/api/ready`, `/api/live`

Main cart APIs:

- `GET /api/v1/cart`
- `POST /api/v1/cart/items`
- `PATCH /api/v1/cart/items/:itemId`
- `DELETE /api/v1/cart/items/:itemId`
- `DELETE /api/v1/cart`
- `POST /api/v1/cart/validate`

## Environment variables

Copy from `.env.example` and adjust:

- Core: `APP_NAME`, `APP_ENV`, `PORT`
- Redis: `REDIS_ENABLED`, `REDIS_URL`
- Cart: `CART_TTL_SECONDS`, `CART_MAX_QTY_PER_ITEM`, `CART_DEFAULT_CURRENCY`
- Optional persistence:
  - `CART_PERSISTENCE_ENABLED`
  - `DATABASE_URL`, `DB_SSL`
- Auth: `JWT_ACCESS_SECRET`
- Kafka (optional): `KAFKA_ENABLED`, `KAFKA_BROKERS`, `CART_EVENTS_TOPIC`
- External validation (optional):
  - `CART_VALIDATE_EXTERNAL`
  - `PRODUCT_SERVICE_BASE_URL`
  - `INVENTORY_SERVICE_BASE_URL`

## Run locally (without Docker)

From repo root:

```bash
npm install
npm run dev --workspace services/cart-service
```

Build and run:

```bash
npm run build --workspace services/cart-service
npm run start --workspace services/cart-service
```

## Run with Docker

From repo root:

```bash
docker compose -f services/cart-service/docker-compose.dev.yml up -d --build
```

Stop:

```bash
docker compose -f services/cart-service/docker-compose.dev.yml down --remove-orphans
```

## Run tests

E2E tests:

```bash
npm run test:e2e --workspace services/cart-service
```

Smoke test (Docker + API flow + e2e):

```bash
bash scripts/test-cart-service.sh
```

On Windows PowerShell (Git Bash path):

```powershell
& "C:\Program Files\Git\bin\bash.exe" scripts/test-cart-service.sh
```

## Optional PostgreSQL persistence

When `CART_PERSISTENCE_ENABLED=true`, apply migration:

```bash
cat services/cart-service/migrations/0001_init_cart_service.sql | \
  docker compose -f services/cart-service/docker-compose.dev.yml exec -T postgres \
  psql -U ecommerce -d ecommerce
```
