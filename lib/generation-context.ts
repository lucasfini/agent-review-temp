import type { SupabaseClient } from '@supabase/supabase-js';

import { ensureDefaultOrganizationForUser } from '@/lib/authz/organization-context';
import { getBrandVoiceInOrganizations, type BrandVoice } from '@/lib/brand-voices';
import { getCampaignInOrganizations, type Campaign } from '@/lib/campaigns-content-library';
import { getContentLibraryInOrganizations, type ContentLibrary } from '@/lib/content-libraries';
import { getCreatorProfileInOrganizations, type CreatorProfile } from '@/lib/creator-profiles';

export type GenerationContextIds = {
  creatorProfileId: string | null;
  brandVoiceId: string | null;
  campaignId: string | null;
  libraryId: string | null;
};

export type GenerationContextSelection = {
  contentTypeId?: string | null;
  contentTypeName?: string | null;
  channel?: string | null;
};

export type GenerationContextSnapshotOptions = {
  generatedAt?: string | null;
  generatedByUserId?: string | null;
  model?: string | null;
  promptVersion?: string | null;
};

export type ResolvedGenerationContext = {
  creatorProfile: CreatorProfile | null;
  brandVoice: BrandVoice | null;
  campaign: Campaign | null;
  library: ContentLibrary | null;
};

export class GenerationContextValidationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GenerationContextValidationError';
    this.status = status;
  }
}

function normalizeOptionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new GenerationContextValidationError(400, `${field} must be a string`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getFirstDefined(input: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function formatList(items: string[], maxItems = 8): string | null {
  const values = items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);

  return values.length ? values.map((item) => `- ${item}`).join('\n') : null;
}

function pushField(lines: string[], label: string, value?: string | null) {
  if (!value || !value.trim()) return;
  lines.push(`${label}: ${value.trim()}`);
}

export function readGenerationContextIds(input: unknown): GenerationContextIds {
  const payload = input && typeof input === 'object'
    ? input as Record<string, unknown>
    : {};

  return {
    creatorProfileId: normalizeOptionalId(getFirstDefined(payload, 'creatorProfileId', 'creator_profile_id'), 'creator_profile_id'),
    brandVoiceId: normalizeOptionalId(getFirstDefined(payload, 'brandVoiceId', 'brand_voice_id'), 'brand_voice_id'),
    campaignId: normalizeOptionalId(getFirstDefined(payload, 'campaignId', 'campaign_id'), 'campaign_id'),
    libraryId: normalizeOptionalId(getFirstDefined(payload, 'libraryId', 'library_id'), 'library_id'),
  };
}

export function hasGenerationContextIds(ids: GenerationContextIds): boolean {
  return Boolean(ids.creatorProfileId || ids.brandVoiceId || ids.campaignId || ids.libraryId);
}

export async function resolveGenerationContext(
  supabase: SupabaseClient<any>,
  organizationId: string | null | undefined,
  ids: GenerationContextIds,
  options: { userId?: string | null } = {}
): Promise<ResolvedGenerationContext> {
  if (!hasGenerationContextIds(ids)) {
    return { creatorProfile: null, brandVoice: null, campaign: null, library: null };
  }

  if (!organizationId && !options.userId) {
    throw new GenerationContextValidationError(400, 'Organization context is required for Studio generation');
  }

  const scopedOrganizationIds = new Set<string>();
  if (organizationId) scopedOrganizationIds.add(organizationId);

  if (options.userId) {
    const privateOrganization = await ensureDefaultOrganizationForUser(supabase, options.userId);
    scopedOrganizationIds.add(privateOrganization.id);
  }

  const studioOrganizationIds = Array.from(scopedOrganizationIds);
  const creatorProfile = ids.creatorProfileId
    ? await getCreatorProfileInOrganizations(supabase, studioOrganizationIds, ids.creatorProfileId)
    : null;
  if (ids.creatorProfileId && !creatorProfile) {
    throw new GenerationContextValidationError(404, 'Profile not found');
  }

  const campaign = ids.campaignId
    ? await getCampaignInOrganizations(supabase, studioOrganizationIds, ids.campaignId)
    : null;
  if (ids.campaignId && !campaign) {
    throw new GenerationContextValidationError(404, 'Campaign not found');
  }

  const effectiveBrandVoiceId = ids.brandVoiceId || campaign?.brandVoiceId || null;
  const brandVoice = effectiveBrandVoiceId
    ? await getBrandVoiceInOrganizations(supabase, studioOrganizationIds, effectiveBrandVoiceId)
    : null;
  if (effectiveBrandVoiceId && !brandVoice) {
    throw new GenerationContextValidationError(404, 'Brand voice not found');
  }

  const library = ids.libraryId
    ? await getContentLibraryInOrganizations(supabase, studioOrganizationIds, ids.libraryId)
    : null;
  if (ids.libraryId && !library) {
    throw new GenerationContextValidationError(404, 'Library not found');
  }

  return { creatorProfile, brandVoice, campaign, library };
}

export function buildGenerationContextPrompt(
  context?: ResolvedGenerationContext | null,
  selection: GenerationContextSelection = {}
): string {
  if (!context?.creatorProfile && !context?.brandVoice && !context?.campaign && !selection.contentTypeId && !selection.contentTypeName && !selection.channel) {
    return '';
  }

  const sections: string[] = [];

  sections.push(`Context priority rules
- Transcript and cleaned summary are the factual source of truth. Do not invent facts, quotes, claims, names, or outcomes from Studio context.
- User guidance for this output is the explicit direction when compatible with the transcript, selected format, and required length.
- Brand voice is the primary writing style guide: follow tone, diction, examples, content pillars, banned phrases, and CTA preferences.
- Creator profile defines whose point of view, audience, positioning, and content goals the draft should serve.
- Plan context is the campaign brief: use its objective, audience, channels, and timing to choose angle and CTA, without changing transcript facts.`);

  const selectedLines: string[] = [];
  pushField(selectedLines, 'Selected content type', selection.contentTypeName || selection.contentTypeId || null);
  pushField(selectedLines, 'Selected channel', selection.channel || null);
  if (selectedLines.length) {
    sections.push(`Selected output\n${selectedLines.join('\n')}`);
  }

  if (context?.creatorProfile) {
    const profile = context.creatorProfile;
    const lines: string[] = [];
    pushField(lines, 'Name', profile.name);
    pushField(lines, 'Website', profile.website);
    pushField(lines, 'Positioning', profile.positioning);
    pushField(lines, 'Audience', profile.audience);
    pushField(lines, 'Content goal', profile.contentGoal);

    sections.push(`Creator profile\n${lines.join('\n')}`);
  }

  if (context?.brandVoice) {
    const voice = context.brandVoice;
    const lines: string[] = [];
    pushField(lines, 'Name', voice.name);
    pushField(lines, 'Description', voice.description);
    pushField(lines, 'Tone', voice.tone);
    pushField(lines, 'Audience', voice.audience);
    pushField(lines, 'CTA preferences', voice.ctaPreferences);

    const pillars = formatList(voice.contentPillars);
    if (pillars) lines.push(`Content pillars:\n${pillars}`);

    const writingExamples = formatList(voice.writingExamples, 5);
    if (writingExamples) lines.push(`Writing examples to emulate:\n${writingExamples}`);

    const bannedPhrases = formatList(voice.bannedPhrases);
    if (bannedPhrases) lines.push(`Banned phrases:\n${bannedPhrases}`);

    sections.push(`Brand voice\n${lines.join('\n')}`);
  }

  if (context?.campaign) {
    const campaign = context.campaign;
    const lines: string[] = [];
    pushField(lines, 'Name', campaign.name);
    pushField(lines, 'Status', campaign.status);
    pushField(lines, 'Objective', campaign.objective);
    pushField(lines, 'Audience', campaign.audience);
    if (campaign.channels.length) {
      lines.push(`Channels:\n${formatList(campaign.channels)}`);
    }
    pushField(lines, 'Start date', campaign.startDate);
    pushField(lines, 'End date', campaign.endDate);

    sections.push(`Campaign context\n${lines.join('\n')}`);
  }

  if (!sections.length) return '';

  return `=== ORGANIZATION GENERATION CONTEXT ===
Use this organization context as a high-priority guide while keeping every claim grounded in the transcript.
${sections.join('\n\n')}
`;
}

export function mergeGenerationContextWithStyle(
  contextPrompt: string,
  outputStyleModifier?: string | null
): string | undefined {
  const parts = [
    outputStyleModifier?.trim() || '',
    contextPrompt.trim(),
  ].filter(Boolean);

  return parts.length ? parts.join('\n\n') : undefined;
}

export function buildGenerationContextMetadata(
  context?: ResolvedGenerationContext | null,
  selection: GenerationContextSelection = {},
  options: GenerationContextSnapshotOptions = {}
): Record<string, unknown> | undefined {
  if (!context?.creatorProfile && !context?.brandVoice && !context?.campaign && !context?.library && !selection.contentTypeId && !selection.contentTypeName && !selection.channel) {
    return undefined;
  }

  const voiceRulesSummary = [
    context?.brandVoice?.description,
    context?.brandVoice?.tone,
    context?.brandVoice?.ctaPreferences,
  ]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' | ') || null;

  return {
    creatorProfileId: context?.creatorProfile?.id || null,
    creatorProfileName: context?.creatorProfile?.name || null,
    creatorProfileWebsite: context?.creatorProfile?.website || null,
    creatorProfilePositioning: context?.creatorProfile?.positioning || null,
    creatorProfileAudience: context?.creatorProfile?.audience || null,
    creatorProfileContentGoal: context?.creatorProfile?.contentGoal || null,
    brandVoiceId: context?.brandVoice?.id || null,
    brandVoiceName: context?.brandVoice?.name || null,
    brandVoiceTone: context?.brandVoice?.tone || null,
    brandVoiceAudience: context?.brandVoice?.audience || null,
    brandVoiceRulesSummary: voiceRulesSummary,
    campaignId: context?.campaign?.id || null,
    campaignName: context?.campaign?.name || null,
    campaignStatus: context?.campaign?.status || null,
    campaignObjective: context?.campaign?.objective || null,
    campaignAudience: context?.campaign?.audience || null,
    campaignChannels: context?.campaign?.channels || [],
    libraryId: context?.library?.id || null,
    libraryName: context?.library?.name || null,
    selectedContentTypeId: selection.contentTypeId || null,
    selectedContentTypeName: selection.contentTypeName || null,
    selectedChannel: selection.channel || null,
    generatedAt: options.generatedAt || null,
    generatedByUserId: options.generatedByUserId || null,
    model: options.model || null,
    promptVersion: options.promptVersion || 'studio-context-v1',
  };
}
