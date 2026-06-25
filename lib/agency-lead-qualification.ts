export const AGENCY_LEAD_QUALIFICATION_TIERS = [
  'high',
  'medium',
  'low',
  'unqualified',
] as const;

export type AgencyLeadQualificationTier = typeof AGENCY_LEAD_QUALIFICATION_TIERS[number];

export type AgencyLeadQualificationInput = {
  role?: unknown;
  packageInterest?: unknown;
  package_interest?: unknown;
  company?: unknown;
  website?: unknown;
  budgetRange?: unknown;
  budget_range?: unknown;
  timeline?: unknown;
  message?: unknown;
};

export type AgencyLeadQualificationResult = {
  score: number;
  tier: AgencyLeadQualificationTier;
  factors: string[];
};

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function lower(value: unknown): string {
  return stringField(value).toLowerCase();
}

function coalesce(input: AgencyLeadQualificationInput, ...keys: Array<keyof AgencyLeadQualificationInput>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

export function qualificationTierForScore(score: number): AgencyLeadQualificationTier {
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  if (score >= 20) return 'low';
  return 'unqualified';
}

export function scoreAgencyLead(input: AgencyLeadQualificationInput): AgencyLeadQualificationResult {
  let score = 0;
  const factors: string[] = [];
  const role = lower(input.role);
  const packageInterest = stringField(coalesce(input, 'packageInterest', 'package_interest'));
  const company = stringField(input.company);
  const website = stringField(input.website);
  const budgetRange = lower(coalesce(input, 'budgetRange', 'budget_range'));
  const timeline = lower(input.timeline);
  const message = stringField(input.message);
  const messageWords = message.split(/\s+/).filter(Boolean).length;

  if (packageInterest) {
    score += 15;
    factors.push('package_interest_present');
  }

  if (company) {
    score += 10;
    factors.push('company_present');
  }

  if (website) {
    score += 10;
    factors.push('website_present');
  }

  if (budgetRange) {
    score += 10;
    factors.push('budget_present');
    if (budgetRange.includes('$5k') || budgetRange.includes('$10k')) {
      score += 5;
      factors.push('budget_matches_service_range');
    }
  }

  if (timeline) {
    score += 8;
    factors.push('timeline_present');
    if (timeline.includes('this month') || timeline.includes('next 1-2') || timeline.includes('quarter')) {
      score += 7;
      factors.push('active_timeline');
    }
  }

  if (role) {
    score += 6;
    factors.push('role_present');
    if (/(founder|ceo|owner|chief|vp|head|marketing|growth|success|ops|operations)/i.test(role)) {
      score += 9;
      factors.push('decision_or_operator_role');
    }
  }

  if (messageWords >= 8) {
    score += 10;
    factors.push('message_has_context');
  }
  if (messageWords >= 25) {
    score += 5;
    factors.push('message_has_detail');
  }

  if (!company && !website && !message) {
    score -= 15;
    factors.push('low_context');
  }

  const linkCount = (message.toLowerCase().match(/https?:\/\/|www\./g) || []).length;
  if (linkCount >= 3) {
    score -= 20;
    factors.push('excessive_links');
  }

  const boundedScore = Math.min(100, Math.max(0, score));
  return {
    score: boundedScore,
    tier: qualificationTierForScore(boundedScore),
    factors,
  };
}
