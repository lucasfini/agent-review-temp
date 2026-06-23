import { decorateBrandVoiceScope } from '@/lib/brand-voices';
import { decorateCampaignScope } from '@/lib/campaigns-content-library';
import { decorateContentLibraryScope } from '@/lib/content-libraries';
import { decorateCreatorProfileScope } from '@/lib/creator-profiles';

describe('studio asset sharing permissions', () => {
  const context = {
    activeOrganizationId: 'org-1',
    privateOrganizationId: 'personal-1',
    userId: 'user-1',
    role: 'editor',
    organizationType: 'saas_customer',
  } as const;

  it('allows the creator to share and unshare their own private assets', () => {
    const creatorProfile = decorateCreatorProfileScope({
      id: 'profile-1',
      organizationId: 'personal-1',
      clientId: null,
      sharedFromProfileId: null,
      name: 'Main profile',
      website: null,
      positioning: null,
      audience: null,
      contentGoal: null,
      isDefault: true,
      createdBy: 'user-1',
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
    }, context);

    const brandVoice = decorateBrandVoiceScope({
      id: 'voice-1',
      organizationId: 'personal-1',
      clientId: null,
      sharedFromVoiceId: null,
      name: 'Default voice',
      description: null,
      tone: null,
      audience: null,
      contentPillars: [],
      writingExamples: [],
      bannedPhrases: [],
      ctaPreferences: null,
      createdBy: 'user-1',
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
    }, context);

    const campaign = decorateCampaignScope({
      id: 'campaign-1',
      organizationId: 'personal-1',
      clientId: null,
      sharedFromCampaignId: null,
      brandVoiceId: null,
      name: 'Launch plan',
      status: 'draft',
      objective: null,
      audience: null,
      channels: [],
      startDate: null,
      endDate: null,
      ownerUserId: 'user-1',
      createdBy: 'user-1',
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
    }, context);

    const contentLibrary = decorateContentLibraryScope({
      id: 'library-1',
      organizationId: 'personal-1',
      clientId: null,
      sharedFromLibraryId: null,
      name: 'Research notes',
      description: null,
      createdBy: 'user-1',
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
    }, context);

    expect(creatorProfile).toEqual(expect.objectContaining({
      scope: 'private',
      canShare: true,
      canUnshare: false,
    }));
    expect(brandVoice).toEqual(expect.objectContaining({
      scope: 'private',
      canShare: true,
      canUnshare: false,
    }));
    expect(campaign).toEqual(expect.objectContaining({
      scope: 'private',
      canShare: true,
      canUnshare: false,
    }));
    expect(contentLibrary).toEqual(expect.objectContaining({
      scope: 'private',
      canShare: true,
      canUnshare: false,
    }));
  });

  it('blocks non-owner editors from sharing or unsharing another user’s shared workspace copies', () => {
    const editorContext = {
      ...context,
      userId: 'user-3',
      role: 'editor',
    } as const;

    const sharedCreatorProfile = decorateCreatorProfileScope({
      id: 'profile-shared-1',
      organizationId: 'org-1',
      clientId: null,
      sharedFromProfileId: 'profile-1',
      name: 'Main profile',
      website: null,
      positioning: null,
      audience: null,
      contentGoal: null,
      isDefault: false,
      createdBy: 'user-2',
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
    }, editorContext);

    const sharedBrandVoice = decorateBrandVoiceScope({
      id: 'voice-shared-1',
      organizationId: 'org-1',
      clientId: null,
      sharedFromVoiceId: 'voice-1',
      name: 'Default voice',
      description: null,
      tone: null,
      audience: null,
      contentPillars: [],
      writingExamples: [],
      bannedPhrases: [],
      ctaPreferences: null,
      createdBy: 'user-2',
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
    }, editorContext);

    const sharedCampaign = decorateCampaignScope({
      id: 'campaign-shared-1',
      organizationId: 'org-1',
      clientId: null,
      sharedFromCampaignId: 'campaign-1',
      brandVoiceId: null,
      name: 'Launch plan',
      status: 'draft',
      objective: null,
      audience: null,
      channels: [],
      startDate: null,
      endDate: null,
      ownerUserId: 'user-2',
      createdBy: 'user-2',
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
    }, editorContext);

    const sharedLibrary = decorateContentLibraryScope({
      id: 'library-shared-1',
      organizationId: 'org-1',
      clientId: null,
      sharedFromLibraryId: 'library-1',
      name: 'Research notes',
      description: null,
      createdBy: 'user-2',
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
    }, editorContext);

    expect(sharedCreatorProfile).toEqual(expect.objectContaining({
      canShare: false,
      canUnshare: false,
    }));
    expect(sharedBrandVoice).toEqual(expect.objectContaining({
      canShare: false,
      canUnshare: false,
    }));
    expect(sharedCampaign).toEqual(expect.objectContaining({
      canShare: false,
      canUnshare: false,
    }));
    expect(sharedLibrary).toEqual(expect.objectContaining({
      canShare: false,
      canUnshare: false,
    }));
  });
});
