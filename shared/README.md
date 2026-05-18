# Shared Contracts

Language-neutral cross-service contracts for the monorepo.

| Path | Purpose |
|---|---|
| `proto/` | gRPC / Protocol Buffer definitions |
| `kafka/` | Topic names and event shape constants |
| `contracts/` | TypeScript API contracts |
| `types/` | Shared TypeScript types |
| `constants/` | Cross-service constants (e.g. error codes) |
| `utils/` | Shared utilities |

**Rules**

- No service runtime code here.
- NestJS-only helpers belong in `packages/backend-shared/` (`auth-service`).
- Go services consume Kafka/proto constants as needed; HTTP remains primary for gateway traffic.
