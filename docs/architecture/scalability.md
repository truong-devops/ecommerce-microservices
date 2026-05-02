# Scalability & Performance

This document outlines the strategies used to ensure the platform can scale to handle high traffic loads.

## 1. Application Layer Scaling

- **Stateless Services**: All microservices are completely stateless. Session data is stored in Redis, and business data in databases. This allows any service to be horizontally scaled simply by adding more pods in Kubernetes.
- **API Gateway**: Written in Go for extremely high throughput and low overhead. It can handle tens of thousands of concurrent connections and route them efficiently.
- **Go Migration**: 9 out of 12 backend services were migrated to Go. Go's goroutines and efficient garbage collection significantly reduce CPU and memory usage compared to Node.js/NestJS, allowing higher density of containers per node.

## 2. Database Scaling

- **Connection Pooling**: `pgx` (Go) and TypeORM (NestJS) maintain connection pools to prevent overwhelming PostgreSQL.
- **Read Replicas**: For read-heavy services (e.g., `product-service`), read operations can be directed to MongoDB replica sets or PostgreSQL read replicas.
- **OLAP Separation**: Analytical queries are offloaded to ClickHouse (`analytics-service`), preventing expensive aggregations from locking or slowing down operational databases (OLTP).

## 3. Caching Strategy

- **Redis Cache**: Used extensively for hot paths. For example, `cart-service` uses Redis as its primary store (`cart_cache_repository`), writing to Postgres only as a fallback/persistence layer.
- **Gateway Caching**: Static assets and public catalog endpoints can be aggressively cached at the CDN or Gateway level.

## 4. Asynchronous Processing

- **Kafka Buffering**: Spiky traffic (e.g., flash sales) translates into messages in Kafka rather than immediate database locks. The `order`, `inventory`, and `payment` workers process these queues at a safe, controlled rate.
- **Background Jobs**: Tasks like expiring old inventory reservations or sending bulk emails run as background goroutines/workers, keeping the main HTTP threads free.
