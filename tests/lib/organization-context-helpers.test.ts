import { PERSONAL_WORKSPACE_NAME, displayOrganizationName } from '@/lib/authz/organization-context';

describe('organization context display helpers', () => {
  it('normalizes personal workspace names for all users', () => {
    expect(displayOrganizationName({
      type: 'personal_legacy',
      name: 'User f3c12abc Workspace',
    })).toBe(PERSONAL_WORKSPACE_NAME);
  });

  it('preserves non-personal workspace names', () => {
    expect(displayOrganizationName({
      type: 'saas_customer',
      name: 'Acme Workspace',
    })).toBe('Acme Workspace');
  });
});
