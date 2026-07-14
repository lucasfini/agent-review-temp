import {
  shareContentLibraryToOrganization,
  type ContentLibrary,
} from '@/lib/content-libraries';
import { getAvailableStudioAssetName } from '@/lib/studio-sharing';

describe('content library helpers', () => {
  const sourceLibrary: ContentLibrary = {
    id: 'library-private',
    organizationId: 'personal-1',
    clientId: null,
    sharedFromLibraryId: null,
    name: 'Customer Stories',
    description: null,
    ownerUserId: 'user-1',
    locked: false,
    createdBy: 'user-1',
    createdAt: '2026-06-29T00:00:00.000Z',
    updatedAt: '2026-06-29T00:00:00.000Z',
  };

  it('chooses a readable team name when the workspace name is taken', () => {
    expect(getAvailableStudioAssetName('Customer Stories', [
      { id: 'workspace-library', name: 'Customer Stories' },
    ], { suffixLabel: 'team' })).toBe('Customer Stories (team)');
  });

  it('moves collection rows into the team instead of copying them', async () => {
    const updatedPayloads: any[] = [];
    let fromCall = 0;
    const supabase = {
      from: jest.fn((table: string) => {
        expect(table).toBe('content_libraries');
        const callIndex = fromCall;
        fromCall += 1;

        if (callIndex === 0) {
          const builder = {
            select: jest.fn(() => builder),
            eq: jest.fn(() => builder),
            is: jest.fn(() => builder),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
          return builder;
        }

        if (callIndex === 1) {
          const builder = {
            select: jest.fn(() => builder),
            eq: jest.fn(() => builder),
            is: jest.fn().mockResolvedValue({
              data: [{ id: 'workspace-library', name: 'Customer Stories' }],
              error: null,
            }),
          };
          return builder;
        }

        if (callIndex === 2) {
          const builder = {
            update: jest.fn((payload: any) => {
              updatedPayloads.push(payload);
              return builder;
            }),
            eq: jest.fn(() => builder),
            is: jest.fn(() => builder),
            select: jest.fn(() => builder),
            maybeSingle: jest.fn().mockImplementation(() => Promise.resolve({
              data: {
                id: 'library-private',
                organization_id: updatedPayloads[0].organization_id,
                client_id: updatedPayloads[0].client_id,
                shared_from_library_id: updatedPayloads[0].shared_from_library_id,
                name: updatedPayloads[0].name,
                description: updatedPayloads[0].description,
                owner_user_id: updatedPayloads[0].owner_user_id,
                locked: false,
                created_by: 'user-1',
                created_at: '2026-06-29T00:00:00.000Z',
                updated_at: '2026-06-29T00:00:00.000Z',
              },
              error: null,
            })),
          };
          return builder;
        }

        throw new Error(`Unexpected content_libraries call ${callIndex}`);
      }),
    };

    const shared = await shareContentLibraryToOrganization(
      supabase as any,
      sourceLibrary,
      'workspace-1',
      'user-1'
    );

    expect(updatedPayloads[0]).toMatchObject({
      organization_id: 'workspace-1',
      shared_from_library_id: null,
      name: 'Customer Stories (team)',
    });
    expect(shared.id).toBe('library-private');
    expect(shared.name).toBe('Customer Stories (team)');
  });
});
