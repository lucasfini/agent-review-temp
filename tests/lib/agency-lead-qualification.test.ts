import {
  qualificationTierForScore,
  scoreAgencyLead,
} from '@/lib/agency-lead-qualification';

describe('agency lead qualification scoring', () => {
  it('scores detailed service-fit leads as high tier', () => {
    const result = scoreAgencyLead({
      role: 'Founder',
      packageInterest: 'monthly-founder-content',
      company: 'Acme',
      website: 'https://example.com',
      budgetRange: '$5k-$10k/mo',
      timeline: 'This quarter',
      message: 'We need help turning customer calls, product updates, and founder ideas into a consistent content system.',
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.tier).toBe('high');
    expect(result.factors).toEqual(expect.arrayContaining([
      'package_interest_present',
      'decision_or_operator_role',
      'budget_matches_service_range',
      'message_has_context',
    ]));
  });

  it('scores sparse leads as unqualified without rejecting them', () => {
    const result = scoreAgencyLead({
      role: '',
      message: '',
    });

    expect(result.score).toBe(0);
    expect(result.tier).toBe('unqualified');
    expect(result.factors).toContain('low_context');
  });

  it('assigns deterministic tiers from score thresholds', () => {
    expect(qualificationTierForScore(80)).toBe('high');
    expect(qualificationTierForScore(55)).toBe('medium');
    expect(qualificationTierForScore(25)).toBe('low');
    expect(qualificationTierForScore(5)).toBe('unqualified');
  });
});
