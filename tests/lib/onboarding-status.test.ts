import { isRequiredOnboardingStatus, resolveOnboardingStatus } from '@/lib/onboarding';

describe('onboarding status resolver', () => {
  it('starts with profile setup when profile names are missing', () => {
    expect(resolveOnboardingStatus({
      storedStatus: 'complete',
      hasProfile: false,
      hasWorkspace: true,
    })).toBe('profile_pending');
  });

  it('offers workspace setup after profile setup when no workspace has been skipped yet', () => {
    expect(resolveOnboardingStatus({
      storedStatus: 'profile_pending',
      hasProfile: true,
      hasWorkspace: false,
    })).toBe('workspace_pending');
  });

  it('allows users to keep going after skipping workspace setup', () => {
    expect(resolveOnboardingStatus({
      storedStatus: 'profile_intro_pending',
      hasProfile: true,
      hasWorkspace: false,
    })).toBe('profile_intro_pending');
  });

  it('does not reopen onboarding after completion without a workspace', () => {
    expect(resolveOnboardingStatus({
      storedStatus: 'complete',
      hasProfile: true,
      hasWorkspace: false,
    })).toBe('complete');
  });

  it('treats existing users with profile and workspace but no stored status as complete', () => {
    expect(resolveOnboardingStatus({
      storedStatus: null,
      hasProfile: true,
      hasWorkspace: true,
    })).toBe('complete');
  });

  it('moves stale required statuses into the tutorial once required data exists', () => {
    expect(resolveOnboardingStatus({
      storedStatus: 'workspace_pending',
      hasProfile: true,
      hasWorkspace: true,
    })).toBe('profile_intro_pending');
  });

  it('preserves tutorial progress when required setup is complete', () => {
    expect(resolveOnboardingStatus({
      storedStatus: 'voice_intro_pending',
      hasProfile: true,
      hasWorkspace: true,
    })).toBe('voice_intro_pending');
  });

  it('only treats the account profile step as required', () => {
    expect(isRequiredOnboardingStatus('profile_pending')).toBe(true);
    expect(isRequiredOnboardingStatus('workspace_pending')).toBe(false);
    expect(isRequiredOnboardingStatus('profile_intro_pending')).toBe(false);
  });
});
