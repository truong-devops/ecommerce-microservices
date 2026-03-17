export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'inventory-service',
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3007)
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
  reservation: {
    defaultTtlMinutes: Number(process.env.RESERVATION_DEFAULT_TTL_MINUTES ?? 10),
    expireCheckIntervalMs: Number(process.env.RESERVATION_EXPIRE_CHECK_INTERVAL_MS ?? 15000),
    expireBatchSize: Number(process.env.RESERVATION_EXPIRE_BATCH_SIZE ?? 200)
  },
  outbox: {
    dispatcherIntervalMs: Number(process.env.OUTBOX_DISPATCH_INTERVAL_MS ?? 3000),
    batchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 50),
    maxRetry: Number(process.env.OUTBOX_MAX_RETRY ?? 10)
  },
  kafka: {
    enabled: process.env.KAFKA_ENABLED === 'true',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((value) => value.trim()),
    inventoryEventsTopic: process.env.INVENTORY_EVENTS_TOPIC ?? 'inventory.events',
    consumerGroupId: process.env.KAFKA_CONSUMER_GROUP_ID ?? 'inventory-service-group'
  }
});
