import { ok } from '@/lib/server/buyer-api-response';

function readBooleanEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
    return false;
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
    return true;
  }
  return fallback;
}

export async function GET() {
  return ok({
    onlinePaymentEnabled: readBooleanEnv('BUYER_ONLINE_PAYMENT_ENABLED', readBooleanEnv('NEXT_PUBLIC_BUYER_ONLINE_PAYMENT_ENABLED', true))
  });
}
