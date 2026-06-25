import {
  canManageWorkspaceTeam,
  hashInvitationToken,
  normalizeAssignableWorkspaceRole,
  normalizeInvitationEmail,
  WorkspaceTeamError,
} from '@/lib/organizations/team';

describe('workspace team helpers', () => {
  it('hashes invite tokens without returning the raw token', () => {
    const rawToken = 'raw-token-for-email-only';
    const hash = hashInvitationToken(rawToken);

    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(rawToken);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('normalizes invite emails and rejects invalid values', () => {
    expect(normalizeInvitationEmail(' Teammate@Example.COM ')).toBe('teammate@example.com');
    expect(() => normalizeInvitationEmail('not-an-email')).toThrow(WorkspaceTeamError);
  });

  it('allows only assignable non-owner invite roles', () => {
    expect(normalizeAssignableWorkspaceRole('admin')).toBe('admin');
    expect(normalizeAssignableWorkspaceRole('member')).toBe('editor');
    expect(normalizeAssignableWorkspaceRole('reader')).toBe('reader');
    expect(() => normalizeAssignableWorkspaceRole('owner')).toThrow(WorkspaceTeamError);
  });

  it('limits workspace management to owner and admin roles', () => {
    expect(canManageWorkspaceTeam('owner')).toBe(true);
    expect(canManageWorkspaceTeam('admin')).toBe(true);
    expect(canManageWorkspaceTeam('editor')).toBe(false);
    expect(canManageWorkspaceTeam('reader')).toBe(false);
    expect(canManageWorkspaceTeam(null)).toBe(false);
  });
});
