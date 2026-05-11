# Media Service API

## Tổng quan

- Service: `services/media-service`
- Prefix mặc định: `/api/v1`
- Base path: `/api/v1/media`
- Chức năng: cấp `presigned URL` upload/download ảnh qua MinIO và xoá object theo `objectKey`.

## Health

| Method | Path |
|---|---|
| GET | `/api/v1/health` |
| GET | `/api/v1/ready` |
| GET | `/api/v1/live` |

## Media endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| POST | `/api/v1/media/presign-upload` | Roles(`SELLER`,`ADMIN`,`MODERATOR`,`SUPER_ADMIN`) | Cấp URL upload (PUT) + trả `objectKey` |
| POST | `/api/v1/media/presign-download` | Roles(`CUSTOMER`,`SELLER`,`ADMIN`,`MODERATOR`,`SUPER_ADMIN`) | Cấp URL download (GET) theo `objectKey` |
| DELETE | `/api/v1/media` | Roles(`SELLER`,`ADMIN`,`MODERATOR`,`SUPER_ADMIN`) | Xoá object theo `objectKey` |

## DTO chính

### `PresignUploadRequest`

- `entityType` (required, ví dụ `product`)
- `entityId` (required, ví dụ productId)
- `fileName` (required)
- `contentType` (required, chỉ nhận `image/*`)
- `expiresInSeconds` (optional, 60..`MEDIA_MAX_EXPIRY_SECONDS`)

### `PresignDownloadRequest`

- `objectKey` (required)
- `expiresInSeconds` (optional, 60..`MEDIA_MAX_EXPIRY_SECONDS`)

### `DeleteObjectRequest`

- `objectKey` (required)

## Cấu trúc objectKey

`{OBJECT_KEY_PREFIX}/{entityType}/{entityId}/{uuid}.{ext}`

Ví dụ: `products/product/6820fa.../d66a31a0-4f8c-4d64-a4f7-7f5f8e46d0d2.webp`
