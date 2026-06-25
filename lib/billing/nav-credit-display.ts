import { usdToSiteCredits } from '@/lib/billing/display';
import { formatProductCredits, PRODUCT_CREDIT_RATES } from '@/lib/billing/product-credits';

export const PRODUCT_CREDIT_LOW_BALANCE_THRESHOLD =
  PRODUCT_CREDIT_RATES.repurposePackPerAudioMinute * 60;

export function formatNavCreditBalance(
  balance: number,
  creditUnit?: string | null
): string {
  if (creditUnit === 'plan_credit') {
    return formatProductCredits(balance);
  }

  return usdToSiteCredits(balance).toLocaleString('en-US');
}

export function isNavCreditBalanceLow(
  balance: number | null,
  creditUnit?: string | null
): boolean {
  if (balance === null) return false;
  if (creditUnit === 'plan_credit') {
    return balance < PRODUCT_CREDIT_LOW_BALANCE_THRESHOLD;
  }

  return balance < 5;
}
