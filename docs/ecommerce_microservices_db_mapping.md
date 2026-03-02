# E-commerce Microservices - Database Mapping

_Danh sách service sử dụng DB và giải thích Elasticsearch/OpenSearch_

## 1. Service -> Database

| Service | Database sử dụng |
|---|---|
| API Gateway | Redis |
| User Service | PostgreSQL |
| Auth Service | PostgreSQL, Redis |
| Product Service | MongoDB, Elasticsearch/OpenSearch, Redis (optional) |
| Review Service | MongoDB, Elasticsearch/OpenSearch (optional), Redis (optional) |
| Cart Service | Redis, PostgreSQL (optional - lưu cart lâu dài) |
| Order Service | PostgreSQL |
| Payment Service | PostgreSQL, Redis |
| Inventory Service | PostgreSQL |
| Shipping Service | PostgreSQL |
| Notification Service | PostgreSQL, Redis (optional) |
| Analytics Service | ClickHouse, Redis (optional) |

## 2. Elasticsearch/OpenSearch là gì?

- Elasticsearch và OpenSearch là hệ thống search engine (công cụ tìm kiếm) dùng để tạo index và truy vấn tìm kiếm cực nhanh.
- Chúng phù hợp cho: tìm kiếm full-text, lọc (filter), faceted search (lọc theo danh mục/giá/brand/rating), sắp xếp theo độ liên quan, autocomplete/suggest.
- Dữ liệu “chuẩn” (source of truth) vẫn nằm trong MongoDB/PostgreSQL; Elasticsearch/OpenSearch chỉ giữ index để phục vụ truy vấn tìm kiếm.
- OpenSearch là một dự án tách nhánh (fork) từ Elasticsearch, API và cách dùng khá tương đồng trong đa số use-case.
