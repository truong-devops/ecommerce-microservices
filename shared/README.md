# shared

Cross-platform contracts and schemas.

This package should contain only transport-neutral definitions:

- gRPC proto contracts
- Kafka event schemas and topic contracts
- DTO/type contracts shared by backend and frontend

Avoid service runtime code here. Runtime helpers belong in `services/shared`.
