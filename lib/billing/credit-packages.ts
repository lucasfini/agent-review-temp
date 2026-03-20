export type CreditPackage = { amount: number; price: number; bonus: number };

export const CREDIT_PACKAGES = {
  basic: { amount: 25, price: 25, bonus: 2 },
  pro: { amount: 50, price: 50, bonus: 5 },
  enterprise: { amount: 100, price: 100, bonus: 15 },
} as const satisfies Record<string, CreditPackage>;

export type CreditPackageId = keyof typeof CREDIT_PACKAGES | 'custom';

export function resolveCreditPackage(packageId: string, customAmount?: number | null): CreditPackage | null {
  if (packageId === 'custom') {
    const amount = Number(customAmount);
    if (!Number.isFinite(amount) || amount < 5) {
      return null;
    }
    return { amount, price: amount, bonus: 0 };
  }

  if (!(packageId in CREDIT_PACKAGES)) {
    return null;
  }

  return CREDIT_PACKAGES[packageId as keyof typeof CREDIT_PACKAGES];
}

export function getTotalCredits(pkg: CreditPackage): number {
  return pkg.amount + pkg.bonus;
}
