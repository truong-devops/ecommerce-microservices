# Security Architecture

This document describes the security controls and mechanisms implemented across the platform.

## 1. Authentication

- **API Gateway**: Acts as the first line of defense. It rejects unauthenticated requests for protected routes before they even reach the microservices.
- **JWT (JSON Web Tokens)**: `auth-service` issues RS256 signed JWTs. Downstream services verify the signature independently using the public key, eliminating the need for synchronous calls to the auth service.
- **MFA / TOTP**: The `auth-service` supports Time-Based One-Time Passwords for privileged accounts (e.g., Sellers, Admins).

## 2. Authorization (RBAC)

- **Role-Based Access Control**: Users possess roles (`CUSTOMER`, `SELLER`, `ADMIN`, `SUPPORT`, `SUPER_ADMIN`).
- **Middleware Enforcement**: 
  - In Go services, `internal/middleware` intercepts requests and enforces role requirements.
  - In `auth-service` (NestJS), `RolesGuard` and `@Roles()` decorators enforce access.
- **Resource Ownership**: Services validate that a user owns a resource before modifying it (e.g., `cart-service` ensures user A cannot modify user B's cart).

## 3. Network Security

- **Internal VPC**: Microservices and databases are not exposed to the public internet. Only the API Gateway is exposed via an Ingress controller.
- **TLS/HTTPS**: All external traffic is encrypted via HTTPS. Internal traffic between the gateway and services runs within the trusted Kubernetes network.
- **CORS**: Enforced at the API Gateway to only allow requests from approved frontend origins.

## 4. Data Protection

- **Password Hashing**: `auth-service` uses `bcrypt` with a strong work factor for storing user passwords.
- **Environment Variables**: Secrets (DB passwords, API keys) are injected via environment variables at runtime, never hardcoded in the repository.
- **Input Validation**: All incoming HTTP requests are validated strictly at the boundary (Go: handler layer, NestJS: `ValidationPipe` + DTOs) to prevent Injection attacks.

## 5. Rate Limiting and Abuse Prevention

- **Token Bucket Rate Limiting**: Implemented at the API Gateway to protect against brute-force attacks and DDoS. Rate limits are applied per IP address or User ID depending on the endpoint.
- **Idempotency Keys**: Critical endpoints (e.g., `POST /payments/intents`, `POST /orders`) require an `Idempotency-Key` header. Services cache the response to prevent duplicate charges or orders if a client retries a request.
