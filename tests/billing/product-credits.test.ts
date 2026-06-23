import {
  estimateAudioProductCredits,
  estimateDraftProductCredits,
  getRepurposePackHoursFromCredits,
  PRODUCT_CREDIT_RATES,
} from '@/lib/billing/product-credits';
import { getTotalCredits, resolveCreditPackage } from '@/lib/billing/credit-packages';

describe('product credit rates', () => {
  it('charges transcript, Content Kit, and Repurpose Pack per audio minute', () => {
    expect(PRODUCT_CREDIT_RATES.transcriptPerAudioMinute).toBe(1);
    expect(PRODUCT_CREDIT_RATES.contentKitPerAudioMinute).toBe(3);
    expect(PRODUCT_CREDIT_RATES.repurposePackPerAudioMinute).toBe(5);

    expect(estimateAudioProductCredits({ durationSeconds: 60 * 60, workflow: 'transcript' })).toBe(60);
    expect(estimateAudioProductCredits({ durationSeconds: 60 * 60, workflow: 'content_kit' })).toBe(180);
    expect(estimateAudioProductCredits({ durationSeconds: 60 * 60, workflow: 'repurpose_pack' })).toBe(300);
  });

  it('lets the Free monthly grant cover exactly one 60-minute Repurpose Pack', () => {
    expect(estimateAudioProductCredits({ durationSeconds: 60 * 60, workflow: 'repurpose_pack' })).toBe(300);
    expect(getRepurposePackHoursFromCredits(300)).toBe(1);
  });

  it('maps monthly plan grants to expected Repurpose Pack capacity', () => {
    expect(getRepurposePackHoursFromCredits(300)).toBe(1);
    expect(getRepurposePackHoursFromCredits(3000)).toBe(10);
    expect(getRepurposePackHoursFromCredits(10000)).toBe(33);
    expect(getRepurposePackHoursFromCredits(35000)).toBe(117);
  });

  it('charges 25 credits per extra draft or regeneration', () => {
    expect(PRODUCT_CREDIT_RATES.extraDraftOrRegeneration).toBe(25);
    expect(estimateDraftProductCredits(1)).toBe(25);
    expect(estimateDraftProductCredits(4)).toBe(100);
  });
});

describe('top-up packages', () => {
  it('exposes the fixed paid top-up options with 12-month expiry', () => {
    expect(resolveCreditPackage('top_up_1000')).toEqual({
      credits: 1000,
      price: 19,
      expiresAfterMonths: 12,
    });
    expect(resolveCreditPackage('top_up_5000')).toEqual({
      credits: 5000,
      price: 79,
      expiresAfterMonths: 12,
    });
    expect(resolveCreditPackage('top_up_15000')).toEqual({
      credits: 15000,
      price: 229,
      expiresAfterMonths: 12,
    });
  });

  it('does not resolve legacy or custom top-up packages', () => {
    expect(resolveCreditPackage('basic')).toBeNull();
    expect(resolveCreditPackage('custom')).toBeNull();
  });

  it('returns product credits, not cash-equivalent credits', () => {
    const pkg = resolveCreditPackage('top_up_5000');
    expect(pkg).not.toBeNull();
    expect(getTotalCredits(pkg!)).toBe(5000);
  });

  it('keeps larger top-ups cheaper per Repurpose Pack hour while paid plan grants stay the best recurring value', () => {
    const repurposeCreditsPerHour = PRODUCT_CREDIT_RATES.repurposePackPerAudioMinute * 60;
    const topUp1000 = resolveCreditPackage('top_up_1000')!;
    const topUp5000 = resolveCreditPackage('top_up_5000')!;
    const topUp15000 = resolveCreditPackage('top_up_15000')!;
    const perHour = (pkg: { credits: number; price: number }) => pkg.price / (pkg.credits / repurposeCreditsPerHour);

    expect(perHour(topUp1000)).toBeGreaterThan(perHour(topUp5000));
    expect(perHour(topUp5000)).toBeGreaterThan(perHour(topUp15000));
    expect(perHour(topUp15000)).toBeGreaterThan(149 / (10000 / repurposeCreditsPerHour));
    expect(perHour(topUp15000)).toBeGreaterThan(399 / (35000 / repurposeCreditsPerHour));
  });
});
