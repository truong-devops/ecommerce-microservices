# Review Service API

## Tổng quan

- Service: `services/review-service`
- Prefix mặc định: `/api/v1`
- Base path: `/api/v1/reviews`

## Health

| Method | Path |
|---|---|
| GET | `/api/v1/health` |
| GET | `/api/v1/ready` |
| GET | `/api/v1/live` |

## Review endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| POST | `/api/v1/reviews` | Roles(`CUSTOMER`) | Tạo review |
| GET | `/api/v1/reviews` | Public | Danh sách review (public + filter) |
| GET | `/api/v1/reviews/products/:productId/summary` | Public | Summary rating theo product |
| GET | `/api/v1/reviews/:id` | Public | Chi tiết review |
| PATCH | `/api/v1/reviews/:id` | Roles(`CUSTOMER`) | Sửa review của buyer |
| DELETE | `/api/v1/reviews/:id` | Roles(`CUSTOMER`) | Xóa review |
| PATCH | `/api/v1/reviews/:id/moderation` | Roles(`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Moderation review |
| POST | `/api/v1/reviews/:id/reply` | Roles(`SELLER`,`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Reply review |

## DTO chính

### `CreateReviewDto`

- `orderId`, `productId`, `sellerId` (UUID, required)
- `rating` (required, int 1..5)
- `title` (optional, max 120)
- `content` (required, max 2000)
- `images` (optional, max 10 URLs/string)

### `ListReviewsDto` (query)

- `page`, `pageSize` (max 100)
- `productId`, `sellerId`, `buyerId` (UUID optional)
- `rating` (1..5)
- `status`: `PUBLISHED | HIDDEN | REJECTED | DELETED`
- `search`
- `sortBy`: `createdAt | updatedAt | rating`
- `sortOrder`: `ASC | DESC`

### `UpdateReviewDto`

- `rating` (optional 1..5)
- `title` (optional)
- `content` (optional)
- `images` (optional, max 10)

### `ModerateReviewDto`

- `status` (required): `PUBLISHED | HIDDEN | REJECTED | DELETED`
- `reason` (optional, max 500)

### `ReplyReviewDto`

- `content` (required, max 1000)

## Error code nổi bật

- `REVIEW_NOT_FOUND`
- `REVIEW_ALREADY_EXISTS`
- `REVIEW_MODERATION_REASON_REQUIRED`
