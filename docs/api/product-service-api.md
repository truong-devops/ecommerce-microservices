# Product Service API

## Tổng quan

- Service: `services/product-service`
- Prefix mặc định: `/api/v1`
- Base path: `/api/v1/products`
- Có static assets: `/api/v1/products/assets/*`

## Health

| Method | Path |
|---|---|
| GET | `/api/v1/health` |
| GET | `/api/v1/ready` |
| GET | `/api/v1/live` |

## Product endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| POST | `/api/v1/products` | Roles(`SELLER`,`ADMIN`,`SUPER_ADMIN`) | Tạo sản phẩm |
| GET | `/api/v1/products` | Public | List sản phẩm public |
| GET | `/api/v1/products/my` | Roles(`SELLER`,`ADMIN`,`MODERATOR`,`SUPER_ADMIN`) | List sản phẩm quản trị |
| GET | `/api/v1/products/:id` | Public | Chi tiết sản phẩm public |
| PATCH | `/api/v1/products/:id` | Roles(`SELLER`,`ADMIN`,`SUPER_ADMIN`) | Sửa sản phẩm |
| PATCH | `/api/v1/products/:id/status` | Roles(`ADMIN`,`MODERATOR`,`SUPER_ADMIN`) | Đổi trạng thái sản phẩm |
| DELETE | `/api/v1/products/:id` | Roles(`SELLER`,`ADMIN`,`SUPER_ADMIN`) | Xóa sản phẩm |

## DTO chính

### `CreateProductDto`

- `sellerId` (UUID, optional)
- `name` (1..255, required)
- `slug` (optional, `kebab-case`)
- `description` (optional, max 5000)
- `categoryId` (required)
- `brand` (optional, max 128)
- `attributes` (optional, object)
- `images` (optional, array URL)
- `variants` (required, min 1 item)
  - `sku` (1..64, regex `[A-Za-z0-9._-]+`)
  - `name` (1..255)
  - `price` (>=0)
  - `currency` (`[A-Z]{3}`)
  - `compareAtPrice` (optional)
  - `isDefault` (optional)
  - `metadata` (optional)
- `status` (optional): `DRAFT | ACTIVE | HIDDEN | ARCHIVED`

### `UpdateProductDto`

- Cùng schema với create, tất cả optional.

### `UpdateProductStatusDto`

- `status` (required): `DRAFT | ACTIVE | HIDDEN | ARCHIVED`
- `reason` (optional, max 500)

### `ListProductsDto` (query)

- `page`, `pageSize` (max 100)
- `search`
- `status`: `DRAFT | ACTIVE | HIDDEN | ARCHIVED`
- `categoryId`, `brand`, `sellerId`
- `sortBy`: `createdAt | updatedAt | name | minPrice`
- `sortOrder`: `ASC | DESC`

## Error code nổi bật

- `PRODUCT_NOT_FOUND`
- `PRODUCT_SLUG_EXISTS`
- `PRODUCT_SKU_CONFLICT`
