export const ONBOARDING_STATUSES = [
  'profile_pending',
  'workspace_pending',
  'profile_intro_pending',
  'voice_intro_pending',
  'plan_intro_pending',
  'upload_intro_pending',
  'complete',
] as const;

export type OnboardingStatus = typeof ONBOARDING_STATUSES[number];

export const ONBOARDING_TOTAL_STEPS = 6;

const ONBOARDING_STEP_INDEX: Record<OnboardingStatus, number> = {
  profile_pending: 1,
  workspace_pending: 2,
  profile_intro_pending: 3,
  voice_intro_pending: 4,
  plan_intro_pending: 5,
  upload_intro_pending: 6,
  complete: 6,
};

export function isOnboardingStatus(value: unknown): value is OnboardingStatus {
  return typeof value === 'string' && (ONBOARDING_STATUSES as readonly string[]).includes(value);
}

export function getOnboardingStepIndex(status: OnboardingStatus): number {
  return ONBOARDING_STEP_INDEX[status];
}

export function isRequiredOnboardingStatus(status: OnboardingStatus): boolean {
  return status === 'profile_pending';
}

export function resolveOnboardingStatus(input: {
  storedStatus?: string | null;
  hasProfile: boolean;
  hasWorkspace: boolean;
}): OnboardingStatus {
  const storedStatus = isOnboardingStatus(input.storedStatus) ? input.storedStatus : null;

  if (!input.hasProfile) return 'profile_pending';
  if (!storedStatus) return 'complete';
  if (!input.hasWorkspace) {
    return storedStatus === 'profile_pending' ? 'workspace_pending' : storedStatus;
  }

  if (storedStatus === 'profile_pending' || storedStatus === 'workspace_pending') {
    return 'profile_intro_pending';
  }

  return storedStatus;
}
