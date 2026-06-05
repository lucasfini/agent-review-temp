import type { SupabaseClient } from '@supabase/supabase-js';

import { getBrandVoice, type BrandVoice } from '@/lib/brand-voices';
import { getCampaign, type Campaign } from '@/lib/campaigns-content-library';

export type GenerationContextIds = {
  brandVoiceId: string | null;
  campaignId: string | null;
};

export type GenerationContextSelection = {
  contentTypeId?: string | null;
  contentTypeName?: string | null;
  channel?: string | null;
};

export type ResolvedGenerationContext = {
  brandVoice: BrandVoice | null;
  campaign: Campaign | null;
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
    brandVoiceId: normalizeOptionalId(getFirstDefined(payload, 'brandVoiceId', 'brand_voice_id'), 'brand_voice_id'),
    campaignId: normalizeOptionalId(getFirstDefined(payload, 'campaignId', 'campaign_id'), 'campaign_id'),
  };
}

export function hasGenerationContextIds(ids: GenerationContextIds): boolean {
  return Boolean(ids.brandVoiceId || ids.campaignId);
}

export async function resolveGenerationContext(
  supabase: SupabaseClient<any>,
  organizationId: string | null | undefined,
  ids: GenerationContextIds
): Promise<ResolvedGenerationContext> {
  if (!hasGenerationContextIds(ids)) {
    return { brandVoice: null, campaign: null };
  }

  if (!organizationId) {
    throw new GenerationContextValidationError(400, 'Organization context is required for brand voice or campaign generation');
  }

  const campaign = ids.campaignId
    ? await getCampaign(supabase, organizationId, ids.campaignId)
    : null;
  if (ids.campaignId && !campaign) {
    throw new GenerationContextValidationError(404, 'Campaign not found');
  }

  const effectiveBrandVoiceId = ids.brandVoiceId || campaign?.brandVoiceId || null;
  const brandVoice = effectiveBrandVoiceId
    ? await getBrandVoice(supabase, organizationId, effectiveBrandVoiceId)
    : null;
  if (effectiveBrandVoiceId && !brandVoice) {
    throw new GenerationContextValidationError(404, 'Brand voice not found');
  }

  return { brandVoice, campaign };
}

export function buildGenerationContextPrompt(
  context?: ResolvedGenerationContext | null,
  selection: GenerationContextSelection = {}
): string {
  if (!context?.brandVoice && !context?.campaign && !selection.contentTypeId && !selection.contentTypeName && !selection.channel) {
    return '';
  }

  const sections: string[] = [];

  const selectedLines: string[] = [];
  pushField(selectedLines, 'Selected content type', selection.contentTypeName || selection.contentTypeId || null);
  pushField(selectedLines, 'Selected channel', selection.channel || null);
  if (selectedLines.length) {
    sections.push(`Selected output\n${selectedLines.join('\n')}`);
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
  selection: GenerationContextSelection = {}
): Record<string, unknown> | undefined {
  if (!context?.brandVoice && !context?.campaign && !selection.contentTypeId && !selection.contentTypeName && !selection.channel) {
    return undefined;
  }

  return {
    brandVoiceId: context?.brandVoice?.id || null,
    brandVoiceName: context?.brandVoice?.name || null,
    campaignId: context?.campaign?.id || null,
    campaignName: context?.campaign?.name || null,
    campaignStatus: context?.campaign?.status || null,
    selectedContentTypeId: selection.contentTypeId || null,
    selectedContentTypeName: selection.contentTypeName || null,
    selectedChannel: selection.channel || null,
  };
}
