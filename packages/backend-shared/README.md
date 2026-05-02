# packages/backend-shared

Runtime utilities for backend services.

This package is for NestJS-oriented backend runtime components. It is used ONLY by the remaining NestJS services (`auth-service`, `product-service`, `shipping-service`). Go services do not use this package.

- guards, pipes, interceptors, filters
- base entities and shared database abstractions
- config loaders, decorators, common error handling

Do not place cross-platform transport contracts here; keep those in `/shared`.
