import {
  addVoiceListItem,
  calculateVoiceCompleteness,
  generateVoicePreview,
  parseToneChips,
  removeVoiceListItem,
  serializeToneChips,
  updateVoiceListItem,
  type StudioVoiceDraft,
} from '@/lib/studio-voice-helpers';

const completeDraft: StudioVoiceDraft = {
  name: 'BeaconOps Default Voice',
  description: 'Sound like an experienced B2B operator explaining what actually works.',
  toneChips: ['Clear', 'Expert', 'Direct'],
  audience: 'SaaS operators',
  contentPillars: ['Customer proof', 'Founder POV'],
  writingExamples: ['Example post opening'],
  bannedPhrases: ['game-changing'],
  ctaPreferences: 'Invite readers to test one practical idea.',
};

describe('studio voice client helpers', () => {
  it('parses and serializes tone chips from existing tone strings', () => {
    expect(parseToneChips(' Clear, expert\nDirect; clear ')).toEqual(['Clear', 'expert', 'Direct']);
    expect(serializeToneChips(['Clear', 'Expert', 'clear', 'Direct'])).toBe('Clear, Expert, Direct');
  });

  it('adds, updates, removes, trims, and deduplicates list items', () => {
    const added = addVoiceListItem(['Customer proof'], ' founder POV ');
    expect(added).toEqual(['Customer proof', 'founder POV']);
    expect(addVoiceListItem(added, 'customer proof')).toEqual(added);
    expect(updateVoiceListItem(added, 1, 'Product education')).toEqual([
      'Customer proof',
      'Product education',
    ]);
    expect(removeVoiceListItem(added, 0)).toEqual(['founder POV']);
  });

  it('scores voice completeness from filled sections', () => {
    expect(calculateVoiceCompleteness(completeDraft)).toBe(100);
    expect(calculateVoiceCompleteness({
      ...completeDraft,
      description: '',
      bannedPhrases: [],
      ctaPreferences: '',
    })).toBe(70);
  });

  it('generates deterministic previews and avoids banned phrases', () => {
    const preview = generateVoicePreview({
      ...completeDraft,
      contentPillars: ['game-changing customer proof'],
    }, 'linkedin');

    expect(preview.title).toBe('BeaconOps Default Voice LinkedIn post');
    expect(preview.body).toContain('plain language customer proof');
    expect(preview.body).toContain('SaaS operators');
    expect(preview.body).not.toContain('game-changing');
    expect(preview.avoidedPhraseCount).toBe(1);
  });
});
