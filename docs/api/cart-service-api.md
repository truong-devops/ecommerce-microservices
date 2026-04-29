# Cart Service API

## Tổng quan

- Service: `services/cart-service`
- Không dùng global prefix, controller tự khai báo 2 alias:
  - `/api/v1/cart`
  - `/api/cart`
- Role hợp lệ: `BUYER`, `CUSTOMER`.

## Health

| Method | Path |
|---|---|
| GET | `/api/v1/health` hoặc `/api/health` |
| GET | `/api/v1/ready` hoặc `/api/ready` |
| GET | `/api/v1/live` hoặc `/api/live` |

## Cart endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| GET | `/api/v1/cart` (hoặc `/api/cart`) | Roles(`BUYER`,`CUSTOMER`) | Lấy giỏ hàng hiện tại |
| POST | `/api/v1/cart/items` | Roles(`BUYER`,`CUSTOMER`) | Thêm item vào giỏ |
| PATCH | `/api/v1/cart/items/:itemId` | Roles(`BUYER`,`CUSTOMER`) | Cập nhật số lượng item |
| DELETE | `/api/v1/cart/items/:itemId` | Roles(`BUYER`,`CUSTOMER`) | Xóa item khỏi giỏ |
| DELETE | `/api/v1/cart` | Roles(`BUYER`,`CUSTOMER`) | Xóa toàn bộ giỏ |
| POST | `/api/v1/cart/validate` | Roles(`BUYER`,`CUSTOMER`) | Validate giỏ (inventory/logic) |

## DTO chính

### `AddCartItemDto`

- `productId` (required)
- `variantId` (optional)
- `sku` (required)
- `name` (required)
- `image` (optional, URL)
- `unitPrice` (required, number >= 0, max 2 decimals)
- `quantity` (required, int 1..10000)
- `sellerId` (required)
- `metadata` (optional, object)
- `currency` (optional, 3 ký tự in hoa)
- `expectedVersion` (optional, int >= 1)

### `UpdateCartItemDto`

- `quantity` (required, int 0..10000)
- `expectedVersion` (optional, int >=1)

### `ValidateCartDto`

- `includeExternalChecks` (optional, boolean)

## Error code nổi bật

- `CART_NOT_FOUND`
- `CART_ITEM_NOT_FOUND`
- `CART_VERSION_CONFLICT`
- `CART_QUANTITY_INVALID`
- `CART_QUANTITY_EXCEEDED`
- `CART_DEPENDENCY_UNAVAILABLE`
