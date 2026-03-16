export const KAFKA_TOPICS = {
  ORDER_CREATED: 'order.created',
  PAYMENT_COMPLETED: 'payment.completed',
  INVENTORY_RESERVED: 'inventory.reserved',
  USER_REGISTERED: 'user.registered',
  USER_EVENTS: 'user.events',
  NOTIFICATION_EVENTS: 'notification.events',
  AUDIT_EVENTS: 'audit.events'
} as const;
