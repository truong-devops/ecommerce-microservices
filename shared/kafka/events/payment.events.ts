export interface PaymentCompletedEvent {
  paymentId: string;
  orderId: string;
  status: string;
}
