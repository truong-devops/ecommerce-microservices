export interface WalletEventMetadata {
  requestId?: string;
  occurredAt: string;
}

export interface WalletAmountEvent {
  walletId: string;
  sellerId: string;
  amount: number;
  currency: 'VND';
}

export interface WalletFundsHeldEvent extends WalletAmountEvent {
  paymentId: string;
  orderId: string;
  releaseAt: string | null;
}

export interface WalletFundsReleasedEvent extends WalletAmountEvent {
  paymentId: string;
  orderId: string;
}

export interface WalletPayoutEvent extends WalletAmountEvent {
  payoutId: string;
  providerReference?: string;
  failureCode?: string;
}
