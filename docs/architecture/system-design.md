# System Design

This document provides a high-level overview of the e-commerce microservices platform.

## 1. Architectural Style

The system employs a **Microservices Architecture**. The domain is split into 12 independently deployable services to achieve organizational scaling, fault isolation, and independent technical choices (polyglot backend).

- **Go Services (9)**: `api-gateway`, `user`, `cart`, `order`, `payment`, `inventory`, `notification`, `review`, `analytics`. Go was chosen for its high performance, low memory footprint, and excellent concurrency support, which is ideal for high-throughput domains.
- **NestJS/TypeScript Services (3)**: `auth`, `product`, `shipping`. NestJS remains for services that benefit from the rich Node.js ecosystem (e.g., complex third-party API integrations, robust existing codebases).

## 2. Component Layout

### 2.1 Edge Layer
- **API Gateway (Go)**: Acts as the single entry point. Handles routing, rate limiting, JWT validation, and CORS. It prevents downstream services from being overwhelmed and unifies the client interface.

### 2.2 Domain Services
Services are divided by business capability:
- **Core Commerce**: `product-service`, `cart-service`, `inventory-service`, `order-service`.
- **Fulfillment & Payment**: `payment-service`, `shipping-service`.
- **Customer & UGC**: `user-service`, `review-service`.
- **Cross-cutting**: `auth-service`, `notification-service`, `analytics-service`.

### 2.3 Data Layer (Polyglot Persistence)
- **PostgreSQL**: Used by the majority of transactional services (`user`, `order`, `payment`, `cart`, `inventory`, `shipping`, `notification`) for ACID compliance and relational integrity.
- **MongoDB**: Used by `product` and `review` for flexible schema capabilities (e.g., dynamic product attributes, varied review metadata).
- **Redis**: Used as a fast, ephemeral store for session caching, token blacklisting, and cart state.
- **ClickHouse**: Used by `analytics` for fast aggregations over large event datasets (OLAP).

### 2.4 Messaging Backbone
- **Apache Kafka**: Used for asynchronous event-driven communication. Decouples services, allowing them to react to domain events (e.g., `order.created`, `user.registered`) without synchronous tight coupling.

## 3. Communication Patterns

- **Synchronous (REST/HTTP)**: Used for client-to-gateway and gateway-to-service communication. Also used for critical internal lookups (e.g., an order service synchronously fetching a product price).
- **Asynchronous (Kafka)**: Used for state changes that trigger side effects in other domains. Implements the **Outbox Pattern** to guarantee reliable message delivery from a database transaction.

## 4. Deployment Architecture
The system is designed to be deployed on **Kubernetes (K3s)** using Kustomize. Each service runs in its own pod, managed by Deployments and exposed via Services. Kafka, Redis, and databases are typically run as managed services or via stateful operators.
