const CODE_MOD = 10_000_000;

export function formatOrderCode(orderNumber: string | null | undefined, fallbackId?: string): string {
  const source = (orderNumber ?? '').trim() || (fallbackId ?? '').trim();
  return formatCode(source, 'EMX');
}

export function formatCustomerCode(userId: string | null | undefined): string {
  return formatCode((userId ?? '').trim(), 'CUS');
}

export function formatSellerCode(sellerId: string | null | undefined): string {
  return formatCode((sellerId ?? '').trim(), 'SEL');
}

function formatCode(raw: string, prefix: string): string {
  if (!raw) {
    return `${prefix}0000000`;
  }

  const normalized = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const exactPattern = new RegExp(`^${prefix}(\\d{7})$`);
  const exactMatch = normalized.match(exactPattern);
  if (exactMatch) {
    return `${prefix}${exactMatch[1]}`;
  }

  const digits = normalized.replace(/\D/g, '');
  if (digits.length >= 7) {
    return `${prefix}${digits.slice(-7)}`;
  }

  const hashedValue = stableHash(raw);
  return `${prefix}${String(hashedValue).padStart(7, '0')}`;
}

function stableHash(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % CODE_MOD;
  }

  return hash;
}
