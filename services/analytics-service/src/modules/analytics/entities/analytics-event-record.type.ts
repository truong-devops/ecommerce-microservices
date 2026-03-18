export interface AnalyticsEventRecord {
  eventKey: string;
  eventType: string;
  sourceService: string | null;
  occurredAt: string;
  sellerId: string | null;
  userId: string | null;
  orderId: string | null;
  paymentId: string | null;
  shipmentId: string | null;
  amount: number | null;
  refundedAmount: number | null;
  currency: string | null;
  status: string | null;
  payloadJson: string;
  createdAt: string;
}

export interface AnalyticsDateRange {
  from: string;
  to: string;
  sellerId: string;
}
