# media-service

Go media service for S3-compatible object storage. The default Docker Compose stack uses RustFS while retaining the existing `MINIO_*` client variables for compatibility. The service provides endpoints to generate presigned upload/download URLs and delete objects by `objectKey`.

## Main endpoints

- `POST /api/v1/media/presign-upload`
- `POST /api/v1/media/presign-download`
- `DELETE /api/v1/media`
- `GET /api/v1/health`
- `GET /api/v1/ready`
- `GET /api/v1/live`
