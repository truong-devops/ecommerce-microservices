export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'payment-service',
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3006),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1'
  },
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true'
  },
  redis: {
    url: process.env.REDIS_URL
  },
  jwt: {
    access: {
      secret: process.env.JWT_ACCESS_SECRET
    }
  },
  idempotency: {
    recordTtlMinutes: Number(process.env.IDEMPOTENCY_RECORD_TTL_MINUTES ?? 60),
    lockTtlSeconds: Number(process.env.IDEMPOTENCY_LOCK_TTL_SECONDS ?? 30)
  },
  webhookIdempotency: {
    ttlMinutes: Number(process.env.WEBHOOK_IDEMPOTENCY_TTL_MINUTES ?? 1440)
  },
  outbox: {
    dispatcherIntervalMs: Number(process.env.OUTBOX_DISPATCH_INTERVAL_MS ?? 3000),
    batchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 50),
    maxRetry: Number(process.env.OUTBOX_MAX_RETRY ?? 10)
  },
  gateway: {
    provider: (process.env.PAYMENT_GATEWAY ?? 'mock').trim().toLowerCase()
  },
  vnpay: {
    tmnCode: process.env.VNPAY_TMN_CODE ?? '',
    hashSecret: process.env.VNPAY_HASH_SECRET ?? '',
    payUrl: process.env.VNPAY_PAY_URL ?? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: process.env.VNPAY_RETURN_URL ?? 'http://localhost:3000/payment/vnpay-return',
    ipnUrl: process.env.VNPAY_IPN_URL ?? 'http://localhost:3006/api/v1/payments/webhooks/vnpay',
    locale: process.env.VNPAY_LOCALE ?? 'vn',
    orderType: process.env.VNPAY_ORDER_TYPE ?? 'other',
    refundSimulation: process.env.VNPAY_REFUND_SIMULATION !== 'false'
  },
  kafka: {
    enabled: process.env.KAFKA_ENABLED !== 'false',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((value) => value.trim()),
    orderEventsTopic: process.env.ORDER_EVENTS_TOPIC ?? 'order.events',
    orderEventsConsumerGroup: process.env.ORDER_EVENTS_CONSUMER_GROUP ?? 'payment-service-order-events-group',
    paymentEventsTopic: process.env.PAYMENT_EVENTS_TOPIC ?? 'payment.events',
    notificationEventsTopic: process.env.NOTIFICATION_EVENTS_TOPIC ?? 'notification.events',
    analyticsEventsTopic: process.env.ANALYTICS_EVENTS_TOPIC ?? 'analytics.events'
  }
});
