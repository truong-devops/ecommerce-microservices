const vndPriceFormatter = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

export function formatPrice(value: number, _currency = 'VND'): string {
  const amount = Number.isFinite(value) ? Math.round(value) : 0;
  return `${vndPriceFormatter.format(amount)}đ`;
}
