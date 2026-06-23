export type CreditPackage = {
  credits: number;
  price: number;
  expiresAfterMonths: number;
};

export const CREDIT_PACKAGES = {
  top_up_1000: { credits: 1000, price: 19, expiresAfterMonths: 12 },
  top_up_5000: { credits: 5000, price: 79, expiresAfterMonths: 12 },
  top_up_15000: { credits: 15000, price: 229, expiresAfterMonths: 12 },
} as const satisfies Record<string, CreditPackage>;

export type CreditPackageId = keyof typeof CREDIT_PACKAGES;

export function resolveCreditPackage(packageId: string): CreditPackage | null {
  if (!(packageId in CREDIT_PACKAGES)) {
    return null;
  }

  return CREDIT_PACKAGES[packageId as keyof typeof CREDIT_PACKAGES];
}

export function getTotalCredits(pkg: CreditPackage): number {
  return pkg.credits;
}
