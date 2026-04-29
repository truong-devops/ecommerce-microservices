# API Reference - Ecommerce Microservices

Tài liệu này được tổng hợp trực tiếp từ source code trong `services/*` (controller, DTO, enum, gateway router) tại thời điểm hiện tại.

## Danh sách tài liệu

- [API Gateway](./api-gateway-api.md)
- [Auth Service](./auth-service-api.md)
- [User Service](./user-service-api.md)
- [Product Service](./product-service-api.md)
- [Cart Service](./cart-service-api.md)
- [Order Service](./order-service-api.md)
- [Payment Service](./payment-service-api.md)
- [Inventory Service](./inventory-service-api.md)
- [Shipping Service](./shipping-service-api.md)
- [Review Service](./review-service-api.md)
- [Notification Service](./notification-service-api.md)
- [Analytics Service](./analytics-service-api.md)

## Quy ước đọc nhanh

- `Public`: không cần JWT.
- `Auth`: cần JWT hợp lệ.
- `Roles(...)`: yêu cầu role cụ thể theo decorator `@Roles`.
- Với các service Nest có `apiPrefix = api/v1`, đường dẫn mặc định là `/api/v1/...`.
- Một số service có thêm route alias legacy (`/api/...`) như cart/inventory/analytics.

## Ghi chú quan trọng

- Các endpoint được liệt kê là endpoint HTTP từ controller trong từng service.
- API Gateway có thể expose thêm/ít path hơn đường dẫn nội bộ service.
- Field validate được lấy từ DTO (`class-validator`). Nếu gửi field ngoài DTO thường bị reject do `forbidNonWhitelisted: true`.
