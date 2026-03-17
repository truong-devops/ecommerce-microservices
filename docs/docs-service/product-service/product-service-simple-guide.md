# Product Service - Simple Guide

Tai lieu nay giai thich ngan gon `product-service` trong monorepo de de onboard va maintain.

## 1) Goc service o dau?

Goc cua service la:

`services/product-service/`

Moi duong dan ben duoi deu tinh tu thu muc nay.

## 2) Doc tu dau de hieu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/products/controllers/products.controller.ts`
4. `src/modules/products/services/products.service.ts`
5. `src/modules/products/repositories/products.repository.ts`

Chi can nam 5 file nay la hieu phan lon luong nghiep vu.

## 3) Thu muc/file dung de lam gi?

### Khoi dong va wiring

- `src/main.ts`: khoi dong NestJS, gan middleware/filter/interceptor/validation global.
- `src/app.module.ts`: noi Config, MongoDB (Mongoose), guard global, `HealthModule`, `ProductsModule`.

### Cau hinh

- `src/config/configuration.ts`: map bien moi truong thanh object config cho app/db/redis/jwt/kafka/search.
- `src/config/env.validation.ts`: validate env bang Joi, thieu env quan trong se fail startup.

### Common (dung chung)

- `src/common/middlewares/request-id.middleware.ts`: tao/gan `x-request-id`.
- `src/common/interceptors/logging.interceptor.ts`: log request co cau truc.
- `src/common/interceptors/response.interceptor.ts`: boc response chuan `success/data/meta`.
- `src/common/filters/http-exception.filter.ts`: chuan hoa loi JSON.
- `src/common/guards/jwt-auth.guard.ts`: check JWT cho private route.
- `src/common/guards/roles.guard.ts`: check role voi `@Roles(...)`.
- `src/common/decorators/public.decorator.ts`: danh dau route public.
- `src/common/decorators/current-user.decorator.ts`: lay user context tu request.

### Products module (nghiep vu chinh)

- `src/modules/products/products.module.ts`: gom controller/service/repository/search/events.
- `src/modules/products/controllers/products.controller.ts`: dinh nghia REST API product.
- `src/modules/products/services/products.service.ts`: logic create/list/get/update/status/delete.
- `src/modules/products/repositories/products.repository.ts`: truy cap MongoDB qua Mongoose.
- `src/modules/products/entities/product.schema.ts`: schema `products` + indexes.
- `src/modules/products/entities/product-status.enum.ts`: enum trang thai product.
- `src/modules/products/dto/*.dto.ts`: validate input cho tung endpoint.
- `src/modules/products/services/product-search.service.ts`: tich hop OpenSearch (co the tat bang env).
- `src/modules/products/services/product-events-publisher.service.ts`: publish Kafka events.

### Health module

- `src/modules/health/controllers/health.controller.ts`: `/health`, `/ready`, `/live`.
- `src/modules/health/services/health.service.ts`: check mongo/redis readiness.

### Test

- `test/app.e2e-spec.ts`: e2e test luong chinh (auth, CRUD, validation, not found).
- `scripts/test-product-service.sh` (o root repo): smoke test full API flow voi Docker.

### Docker

- `docker-compose.dev.yml`: stack local `product-service + mongo + redis`.
- `Dockerfile`, `Dockerfile.prod`: image cho local/prod.

## 4) Luong request tong quat

1. Request vao API voi prefix mac dinh `/api/v1`.
2. `request-id.middleware` gan `x-request-id`.
3. `jwt-auth.guard` kiem tra token (neu route khong `@Public`).
4. `roles.guard` kiem tra role theo decorator.
5. Controller goi `products.service.ts`.
6. Service validate nghiep vu, goi repository doc/ghi MongoDB.
7. Sau write thanh cong, service sync search va publish event (best-effort).
8. `response.interceptor` tra envelope thanh cong.
9. Neu loi, `http-exception.filter` tra envelope loi.

## 5) API chinh

Base prefix: `/api/v1`

- `GET /health` (public)
- `GET /ready` (public)
- `GET /live` (public)
- `POST /products` (`SELLER|ADMIN|SUPER_ADMIN`)
- `GET /products` (public list ACTIVE)
- `GET /products/my` (`SELLER|ADMIN|MODERATOR|SUPER_ADMIN`)
- `GET /products/:id` (public detail ACTIVE)
- `PATCH /products/:id` (`SELLER|ADMIN|SUPER_ADMIN`)
- `PATCH /products/:id/status` (`ADMIN|MODERATOR|SUPER_ADMIN`)
- `DELETE /products/:id` (`SELLER|ADMIN|SUPER_ADMIN`, soft delete)

## 6) Rule nghiep vu quan trong

- Seller tao product moi mac dinh `DRAFT`.
- Seller khong duoc doi owner (`sellerId`) sang nguoi khac.
- Status update tach endpoint rieng (`PATCH /products/:id/status`).
- Chi staff (admin/moderator/super admin) duoc doi status.
- Public API chi thay product `ACTIVE`.
- Delete la soft delete: set `deletedAt` va status `ARCHIVED`.
- `slug` phai unique (bo qua product da xoa mem).
- SKU khong duoc trung (ca trong payload va trong DB).

## 7) Data model chinh (MongoDB)

Collection: `products`

- `sellerId`, `name`, `slug`, `description`, `categoryId`, `brand`
- `status` (`DRAFT|ACTIVE|HIDDEN|ARCHIVED`)
- `attributes` (object), `images` (string[])
- `variants[]`: `sku`, `name`, `price`, `currency`, `compareAtPrice`, `isDefault`, `metadata`
- `minPrice`
- `createdAt`, `updatedAt`, `deletedAt`

Indexes quan trong:

- unique index cho `slug` voi dieu kien `deletedAt = null`
- index cho list query theo `sellerId/status/createdAt`
- text index cho `name/description/brand/slug`

## 8) Search va Event

### Search

- Bat bang `SEARCH_ENABLED=true`.
- `product-search.service.ts` tu tao index OpenSearch neu can.
- Neu search loi, service fallback ve query MongoDB.

### Event

- Bat Kafka bang `KAFKA_ENABLED=true`.
- Events duoc publish: `product.created`, `product.updated`, `product.status-changed`, `product.deleted`.
- Publish la best-effort, fail publish khong rollback transaction chinh.

## 9) File nen doc theo thu tu

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/products/controllers/products.controller.ts`
4. `src/modules/products/services/products.service.ts`
5. `src/modules/products/repositories/products.repository.ts`
6. `src/modules/products/services/product-search.service.ts`
7. `src/modules/products/services/product-events-publisher.service.ts`
8. `src/modules/products/entities/product.schema.ts`
9. `test/app.e2e-spec.ts`
10. `scripts/test-product-service.sh`
