export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'product-service',
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3003),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1'
  },
  database: {
    url: process.env.DATABASE_URL,
    name: process.env.DATABASE_NAME ?? 'ecommerce_product'
  },
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    url: process.env.REDIS_URL
  },
  jwt: {
    access: {
      secret: process.env.JWT_ACCESS_SECRET
    }
  },
  kafka: {
    enabled: process.env.KAFKA_ENABLED === 'true',
    clientId: process.env.KAFKA_CLIENT_ID ?? 'product-service',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((value) => value.trim()),
    productEventsTopic: process.env.PRODUCT_EVENTS_TOPIC ?? 'product.events',
    auditEventsTopic: process.env.AUDIT_EVENTS_TOPIC ?? 'audit.events'
  },
  search: {
    enabled: process.env.SEARCH_ENABLED === 'true',
    url: process.env.OPENSEARCH_URL,
    index: process.env.OPENSEARCH_INDEX ?? 'products',
    username: process.env.OPENSEARCH_USERNAME,
    password: process.env.OPENSEARCH_PASSWORD,
    timeoutMs: Number(process.env.OPENSEARCH_TIMEOUT_MS ?? 5000)
  }
});
