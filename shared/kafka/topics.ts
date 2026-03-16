export const KAFKA_TOPICS = {
  ORDER_CREATED: 'order.created',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_STATUS_UPDATED: 'order.status-updated',
  ORDER_DELIVERED: 'order.delivered',
  PAYMENT_COMPLETED: 'payment.completed',
  INVENTORY_RESERVED: 'inventory.reserved',
  USER_REGISTERED: 'user.registered',
  ORDER_EVENTS: 'order.events',
  INVENTORY_EVENTS: 'inventory.events',
  PAYMENT_EVENTS: 'payment.events',
  USER_EVENTS: 'user.events',
  NOTIFICATION_EVENTS: 'notification.events',
  ANALYTICS_EVENTS: 'analytics.events',
  AUDIT_EVENTS: 'audit.events'
} as const;
