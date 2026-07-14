import {
  getWorkspacePlanRestriction,
  isPersonalWorkspacePlanSlug,
  isTeamWorkspacePlanSlug,
} from '@/lib/billing/workspace-plan-policy';

describe('workspace plan policy', () => {
  it('treats Pro and Teams as team workspace plans', () => {
    expect(isTeamWorkspacePlanSlug('pro')).toBe(true);
    expect(isTeamWorkspacePlanSlug('teams')).toBe(true);
    expect(isTeamWorkspacePlanSlug('standard')).toBe(false);
  });

  it('treats Free and Standard as personal workspace plans', () => {
    expect(isPersonalWorkspacePlanSlug('free')).toBe(true);
    expect(isPersonalWorkspacePlanSlug('standard')).toBe(true);
    expect(isPersonalWorkspacePlanSlug('pro')).toBe(false);
  });

  it('blocks personal-oriented plans on team workspaces', () => {
    expect(getWorkspacePlanRestriction({
      planSlug: 'standard',
      organizationType: 'saas_customer',
    })).toBe('Team workspaces require Pro or Teams. Choose a team plan to continue.');

    expect(getWorkspacePlanRestriction({
      planSlug: 'pro',
      organizationType: 'saas_customer',
    })).toBeNull();
  });
});
