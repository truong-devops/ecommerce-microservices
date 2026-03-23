const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;

export function isValidProductId(value: string): boolean {
  return PRODUCT_ID_PATTERN.test(value.trim());
}
