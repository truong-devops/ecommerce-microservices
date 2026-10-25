export interface WalletEventMetadata {
  requestId?: string;
  occurredAt: string;
}

export interface WalletAmountEvent {
  walletId: string;
  amount: number;
  currency: 'VND';
}

export interface WalletOwnerAmountEvent extends WalletAmountEvent {
  ownerId: string;
  ownerType: 'SELLER' | 'CUSTOMER';
  sellerId?: string;
  customerId?: string;
}

export interface WalletFundsHeldEvent extends WalletAmountEvent {
  sellerId: string;
  paymentId: string;
  orderId: string;
  releaseAt: string | null;
}

export interface WalletFundsReleasedEvent extends WalletAmountEvent {
  sellerId: string;
  paymentId: string;
  orderId: string;
}

export interface WalletPayoutEvent extends WalletOwnerAmountEvent {
  payoutId: string;
  payoutType: 'SELLER_WITHDRAWAL' | 'CUSTOMER_REFUND';
  providerReference?: string;
  failureCode?: string;
}

export interface WalletCustomerRefundCreditedEvent extends WalletOwnerAmountEvent {
  ownerType: 'CUSTOMER';
  customerId: string;
  paymentId: string;
  orderId: string;
  refundedAmount: number;
}
