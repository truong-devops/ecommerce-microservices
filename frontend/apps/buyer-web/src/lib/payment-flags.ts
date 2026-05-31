export function isOnlinePaymentEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_BUYER_ONLINE_PAYMENT_ENABLED;
  if (!raw) {
    return true;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off' && normalized !== 'no';
}
