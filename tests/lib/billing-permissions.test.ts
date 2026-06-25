import {
  canManageOrganizationBilling,
  canReadOrganizationBilling,
} from '@/lib/authz/billing-permissions';

describe('billing permission rules', () => {
  it('allows owners and admins to manage billing for normal organizations', () => {
    expect(canManageOrganizationBilling('owner', 'saas_customer')).toBe(true);
    expect(canManageOrganizationBilling('admin', 'personal_legacy')).toBe(true);
  });

  it('blocks editors and readers from billing management', () => {
    expect(canManageOrganizationBilling('editor', 'saas_customer')).toBe(false);
    expect(canManageOrganizationBilling('reader', 'saas_customer')).toBe(false);
    expect(canManageOrganizationBilling('agency_member', 'internal_agency')).toBe(false);
    expect(canManageOrganizationBilling(null, 'saas_customer')).toBe(false);
  });

  it('allows agency admins to manage billing only for internal agency organizations', () => {
    expect(canManageOrganizationBilling('agency_admin', 'internal_agency')).toBe(true);
    expect(canManageOrganizationBilling('agency_admin', 'saas_customer')).toBe(false);
    expect(canManageOrganizationBilling('agency_admin', 'personal_legacy')).toBe(false);
  });

  it('keeps billing reads limited to privileged roles', () => {
    expect(canReadOrganizationBilling('owner')).toBe(true);
    expect(canReadOrganizationBilling('admin')).toBe(true);
    expect(canReadOrganizationBilling('editor')).toBe(false);
    expect(canReadOrganizationBilling('reader')).toBe(false);
    expect(canReadOrganizationBilling('agency_admin')).toBe(true);
    expect(canReadOrganizationBilling('agency_member')).toBe(true);
    expect(canReadOrganizationBilling('removed')).toBe(false);
  });
});
