export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'cart-service',
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3004)
  },
  redis: {
    enabled: process.env.REDIS_ENABLED !== 'false',
    url: process.env.REDIS_URL ?? 'redis://localhost:6379'
  },
  cart: {
    ttlSeconds: Number(process.env.CART_TTL_SECONDS ?? 259200),
    maxQtyPerItem: Number(process.env.CART_MAX_QTY_PER_ITEM ?? 99),
    defaultCurrency: process.env.CART_DEFAULT_CURRENCY ?? 'USD',
    persistenceEnabled: process.env.CART_PERSISTENCE_ENABLED === 'true'
  },
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true'
  },
  jwt: {
    access: {
      secret: process.env.JWT_ACCESS_SECRET
    }
  },
  kafka: {
    enabled: process.env.KAFKA_ENABLED === 'true',
    clientId: process.env.KAFKA_CLIENT_ID ?? 'cart-service',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((value) => value.trim()),
    cartEventsTopic: process.env.CART_EVENTS_TOPIC ?? 'cart.events'
  },
  dependencies: {
    validationEnabled: process.env.CART_VALIDATE_EXTERNAL === 'true',
    productServiceBaseUrl: process.env.PRODUCT_SERVICE_BASE_URL ?? '',
    inventoryServiceBaseUrl: process.env.INVENTORY_SERVICE_BASE_URL ?? '',
    timeoutMs: Number(process.env.DEPENDENCY_TIMEOUT_MS ?? 5000)
  }
});
