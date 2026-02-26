export interface OrderCreatedEvent {
  orderId: string;
  userId: string;
  totalAmount: number;
}
