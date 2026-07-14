export function isProductionUnsafeStripePriceId(priceId: string): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  const normalized = priceId.trim().toLowerCase();
  if (!normalized.startsWith('price_')) {
    return true;
  }

  const placeholderTokens = [
    'placeholder',
    'replace',
    'example',
    'mock',
    'todo',
    'starter',
    'growth',
    'scale',
    'enterprise',
    'standard',
    'teams',
  ];

  return normalized.length < 14 || placeholderTokens.some((token) => normalized.includes(token));
}
