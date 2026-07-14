export type VoicePreviewOutputType = 'linkedin' | 'newsletter' | 'blog' | 'thread';

export interface StudioVoiceDraft {
  name: string;
  description: string;
  toneChips: string[];
  audience: string;
  contentPillars: string[];
  writingExamples: string[];
  bannedPhrases: string[];
  ctaPreferences: string;
}

export interface GeneratedVoicePreview {
  outputType: VoicePreviewOutputType;
  title: string;
  body: string;
  avoidedPhraseCount: number;
}

export const VOICE_PREVIEW_OUTPUT_LABELS: Record<VoicePreviewOutputType, string> = {
  linkedin: 'LinkedIn post',
  newsletter: 'Newsletter intro',
  blog: 'Blog summary',
  thread: 'X thread',
};

const MAX_CHIP_ITEMS = 24;

function uniqueTrimmed(items: string[], maxItems = MAX_CHIP_ITEMS): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of items) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

export function parseToneChips(value: string | null | undefined): string[] {
  if (!value) return [];
  return uniqueTrimmed(value.split(/[,;\n\r]+/), 12);
}

export function serializeToneChips(chips: string[]): string {
  return uniqueTrimmed(chips, 12).join(', ');
}

export function normalizeVoiceList(items: string[], maxItems = MAX_CHIP_ITEMS): string[] {
  return uniqueTrimmed(items, maxItems);
}

export function addVoiceListItem(items: string[], value: string, maxItems = MAX_CHIP_ITEMS): string[] {
  return uniqueTrimmed([...items, value], maxItems);
}

export function removeVoiceListItem(items: string[], index: number): string[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

export function updateVoiceListItem(items: string[], index: number, value: string): string[] {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

export function calculateVoiceCompleteness(draft: StudioVoiceDraft): number {
  const score =
    (draft.name.trim() ? 15 : 0) +
    (draft.description.trim() ? 15 : 0) +
    (draft.audience.trim() ? 15 : 0) +
    (draft.toneChips.length > 0 ? 15 : 0) +
    (draft.contentPillars.length > 0 ? 15 : 0) +
    (draft.writingExamples.length > 0 ? 10 : 0) +
    (draft.bannedPhrases.length > 0 ? 10 : 0) +
    (draft.ctaPreferences.trim() ? 5 : 0);

  return Math.min(100, score);
}

function firstUseful(items: string[], fallback: string): string {
  return items.find((item) => item.trim())?.trim() || fallback;
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function avoidBannedPhrases(text: string, bannedPhrases: string[]): string {
  return bannedPhrases.reduce((current, phrase) => {
    const trimmed = phrase.trim();
    if (!trimmed) return current;
    return current.replace(new RegExp(escapeRegExp(trimmed), 'gi'), 'plain language');
  }, text);
}

export function generateVoicePreview(
  draft: StudioVoiceDraft,
  outputType: VoicePreviewOutputType
): GeneratedVoicePreview {
  const audience = draft.audience.trim() || 'your audience';
  const primaryPillar = firstUseful(draft.contentPillars, 'the idea that matters most');
  const secondaryPillar = firstUseful(draft.contentPillars.slice(1), 'a practical next step');
  const tone = draft.toneChips.length > 0
    ? draft.toneChips.slice(0, 3).join(', ').toLowerCase()
    : 'clear and useful';
  const positioning = draft.description.trim() || `Help ${audience} understand what to do next.`;
  const cta = draft.ctaPreferences.trim() || 'Use a useful, low-pressure next step.';
  const name = draft.name.trim() || 'Studio voice';

  const bodies: Record<VoicePreviewOutputType, string> = {
    linkedin: [
      `${sentenceCase(primaryPillar)} is not just a content theme. It is the fastest way to make your point useful for ${audience}.`,
      '',
      positioning,
      '',
      `A ${tone} post would lead with the business problem, show why it matters, and turn ${secondaryPillar.toLowerCase()} into a next action.`,
      '',
      cta,
    ].join('\n'),
    newsletter: [
      `Subject: ${sentenceCase(primaryPillar)} without the extra noise`,
      '',
      `${audience} do not need more generic advice. They need a concise point of view, a useful example, and a reason to act.`,
      '',
      `${positioning} This issue would keep the tone ${tone} and close with: ${cta}`,
    ].join('\n'),
    blog: [
      `${sentenceCase(primaryPillar)} gives ${audience} a practical lens for deciding what to publish next.`,
      '',
      `The article would open with the problem, frame the stakes, then use ${secondaryPillar.toLowerCase()} as the proof point. The voice stays ${tone}, with clear transitions and no inflated claims.`,
      '',
      cta,
    ].join('\n'),
    thread: [
      `1/ ${sentenceCase(primaryPillar)} matters when ${audience} need clarity before they act.`,
      '',
      `2/ ${positioning}`,
      '',
      `3/ Keep the delivery ${tone}. Use ${secondaryPillar.toLowerCase()} as the concrete example.`,
      '',
      `4/ ${cta}`,
    ].join('\n'),
  };

  return {
    outputType,
    title: `${name} ${VOICE_PREVIEW_OUTPUT_LABELS[outputType]}`,
    body: avoidBannedPhrases(bodies[outputType], draft.bannedPhrases),
    avoidedPhraseCount: normalizeVoiceList(draft.bannedPhrases).length,
  };
}
