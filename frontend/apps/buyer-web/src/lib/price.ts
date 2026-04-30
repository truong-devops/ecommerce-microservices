const vndPriceFormatter = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

export function formatPrice(value: number, currency = 'VND'): string {
  const amount = Number.isFinite(value) ? Math.round(value) : 0;
  const normalizedCurrency = currency.trim().toUpperCase();

  if (normalizedCurrency !== 'VND') {
    return `${vndPriceFormatter.format(amount)} ${normalizedCurrency}`;
  }

  return `${vndPriceFormatter.format(amount)}đ`;
}
