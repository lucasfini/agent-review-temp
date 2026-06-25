import {
  formatNavCreditBalance,
  isNavCreditBalanceLow,
  PRODUCT_CREDIT_LOW_BALANCE_THRESHOLD,
} from '@/lib/billing/nav-credit-display';

describe('nav credit display', () => {
  it('formats product credits without legacy USD conversion', () => {
    expect(formatNavCreditBalance(3000, 'plan_credit')).toBe('3,000');
    expect(formatNavCreditBalance(35000, 'plan_credit')).toBe('35,000');
  });

  it('keeps legacy USD credit fallback formatting', () => {
    expect(formatNavCreditBalance(5, 'legacy_usd')).toBe('50,000');
  });

  it('uses one Repurpose Pack hour as the low product-credit threshold', () => {
    expect(PRODUCT_CREDIT_LOW_BALANCE_THRESHOLD).toBe(300);
    expect(isNavCreditBalanceLow(299, 'plan_credit')).toBe(true);
    expect(isNavCreditBalanceLow(300, 'plan_credit')).toBe(false);
    expect(isNavCreditBalanceLow(4.99, 'legacy_usd')).toBe(true);
  });
});
