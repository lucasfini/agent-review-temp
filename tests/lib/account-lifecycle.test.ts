import { AccountDeletionError, assertOwnerDeletionAllowed } from '@/lib/account-lifecycle';

const mockFrom = jest.fn();

const createQuery = (response: {
  data: Array<{ organization_id: string }> | null;
  error: { message: string } | null;
}) => {
  const query = {
    _response: response,
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
  } as any;

  query.then = (resolve: (value: any) => void, reject?: (reason?: any) => void) =>
    Promise.resolve(response).then(resolve, reject);

  return query;
};

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: (...args: any[]) => mockFrom(...args) },
}));

describe('account lifecycle ownership deletion checks', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('allows account deletion when the user owns no active workspace', async () => {
    mockFrom.mockImplementation(() => createQuery({
      data: null,
      error: null,
    }));

    await expect(assertOwnerDeletionAllowed('user-ownerless')).resolves.toBeUndefined();
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('throws when the owner organization has other active members', async () => {
    const responses = [
      { data: [{ organization_id: 'org-1' }], error: null },
      {
        data: [
          { organization_id: 'org-1' },
          { organization_id: 'org-1' },
          { organization_id: 'org-2' },
        ],
        error: null,
      },
    ];

    mockFrom.mockImplementation(() => createQuery(responses.shift() as any));

    await expect(assertOwnerDeletionAllowed('user-owner-many')).rejects.toMatchObject({
      status: 409,
      message: 'Transfer workspace ownership before deleting this account',
    } as AccountDeletionError);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('allows deletion when each owned workspace has only one active member', async () => {
    const responses = [
      { data: [{ organization_id: 'org-1' }, { organization_id: 'org-2' }], error: null },
      {
        data: [{ organization_id: 'org-1' }, { organization_id: 'org-2' }],
        error: null,
      },
    ];

    mockFrom.mockImplementation(() => createQuery(responses.shift() as any));

    await expect(assertOwnerDeletionAllowed('user-single-member-owner')).resolves.toBeUndefined();
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});
