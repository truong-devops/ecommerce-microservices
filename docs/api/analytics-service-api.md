# Analytics Service API

## Tổng quan

- Service: `services/analytics-service`
- Không set global prefix.
- Controller expose 2 alias path:
  - `/api/v1/analytics/*`
  - `/api/analytics/*`
- Quyền: `SELLER | ADMIN | SUPPORT | SUPER_ADMIN`

## Health

| Method | Path |
|---|---|
| GET | `/api/v1/health` hoặc `/api/health` |
| GET | `/api/v1/ready` hoặc `/api/ready` |
| GET | `/api/v1/live` hoặc `/api/live` |

## Analytics endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| GET | `/api/v1/analytics/overview` | Roles(`SELLER`,`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Tổng quan KPI |
| GET | `/api/v1/analytics/events/timeseries` | Roles(`SELLER`,`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Time-series theo event |
| GET | `/api/v1/analytics/payments/summary` | Roles(`SELLER`,`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Tổng hợp payment |
| GET | `/api/v1/analytics/shipping/summary` | Roles(`SELLER`,`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Tổng hợp shipping |

`/api/...` là alias tương đương.

## Query DTO

### Base query (`QueryAnalyticsBaseDto`)

- `from` (optional, ISO8601)
- `to` (optional, ISO8601)
- `sellerId` (optional UUID v4)

### `events/timeseries` thêm:

- `interval` (optional): `hour | day`
- `eventType` (optional string)

## Error code nổi bật

- `ANALYTICS_INVALID_TIME_RANGE`
- `ANALYTICS_QUERY_FAILED`
