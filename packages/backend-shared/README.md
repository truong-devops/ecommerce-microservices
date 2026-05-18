# Backend Shared (NestJS)

NestJS runtime helpers: guards, interceptors, pipes, decorators, DTO utilities.

**Used only by `auth-service`** in the default production/compose stack.

Go microservices implement equivalent logic under each service's `internal/` package and do **not** import this package.

Legacy `product-service-nest` may still reference shared types during shadow tests; it is not deployed by root `docker compose up`.
