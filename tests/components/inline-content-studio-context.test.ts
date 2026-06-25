import {
  mergeContextSelection,
  updateExplicitContextSelection,
  type StudioContentContext,
} from '@/components/project/InlineContentStudio';

describe('InlineContentStudio context defaults', () => {
  const defaultContext: StudioContentContext = {
    creatorProfileId: 'profile-default',
    brandVoiceId: 'voice-default',
    campaignId: null,
    libraryId: null,
  };

  it('uses default context when no explicit selection is saved', () => {
    expect(mergeContextSelection(defaultContext, {})).toEqual({
      creatorProfileId: 'profile-default',
      brandVoiceId: 'voice-default',
      campaignId: null,
      libraryId: null,
    });
  });

  it('does not freeze the default profile when a different field changes', () => {
    expect(updateExplicitContextSelection({}, defaultContext, 'brandVoiceId', 'voice-custom')).toEqual({
      brandVoiceId: 'voice-custom',
    });
  });

  it('clears an explicit profile when the current default profile is selected', () => {
    expect(updateExplicitContextSelection(
      { creatorProfileId: 'profile-other', brandVoiceId: 'voice-custom' },
      defaultContext,
      'creatorProfileId',
      'profile-default'
    )).toEqual({
      brandVoiceId: 'voice-custom',
    });
  });

  it('keeps None as an explicit profile selection when a default profile exists', () => {
    expect(updateExplicitContextSelection({}, defaultContext, 'creatorProfileId', '')).toEqual({
      creatorProfileId: null,
    });
  });
});
