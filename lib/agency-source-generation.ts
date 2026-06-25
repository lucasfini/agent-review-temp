import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createAgencyDraft,
  validateAgencyDraftReferences,
  type AgencyDraft,
  type AgencyDraftInput,
} from '@/lib/agency-drafts';
import { getAgencyClientProfile, type AgencyClientProfile } from '@/lib/agency-client-profiles';
import { getAgencySourceImport, type AgencySourceImport } from '@/lib/agency-source-imports';
import { mapBrandVoiceRow, type BrandVoice, type BrandVoiceRow } from '@/lib/brand-voices';
import { CampaignLibraryValidationError } from '@/lib/campaigns-content-library';
import { mapCampaignRow, type Campaign, type CampaignRow } from '@/lib/campaigns-content-library';
import { getContentTypeById, type OutputType, type PlatformType } from '@/lib/content-types';
import { generateContent, type GenerationResult } from '@/lib/content-generator';
import {
  buildGenerationContextMetadata,
  buildGenerationContextPrompt,
  type ResolvedGenerationContext,
} from '@/lib/generation-context';

export class AgencySourceGenerationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AgencySourceGenerationError';
    this.status = status;
  }
}

export type AgencySourceGenerationRequest = {
  sourceImportId: string;
  clientId: string;
  campaignId: string | null;
  brandVoiceId: string | null;
  contentTypeId: string;
  channel: string | null;
  instructions: string | null;
  quantity: number;
};

type AgencySourceGenerator = typeof generateContent;

const DEFAULT_CONTENT_TYPE_ID = 'linkedin_posts';
const MAX_INSTRUCTIONS_LENGTH = 2000;
const MAX_SOURCE_CONTEXT_LENGTH = 18000;

function optionalString(value: unknown, field: string, maxLength = 240): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AgencySourceGenerationError(400, `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AgencySourceGenerationError(400, `${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function requiredString(value: unknown, field: string): string {
  const normalized = optionalString(value, field);
  if (!normalized) {
    throw new AgencySourceGenerationError(400, `${field} is required`);
  }
  return normalized;
}

function firstDefined(input: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function normalizeQuantity(value: unknown, maxCount = 4): number {
  if (value === undefined || value === null || value === '') return 1;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new AgencySourceGenerationError(400, 'quantity must be a number');
  }
  return Math.max(1, Math.min(Math.floor(numeric), Math.max(1, Math.min(maxCount, 6))));
}

function truncateText(value: string, maxLength = MAX_SOURCE_CONTEXT_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n\n[Source truncated for generation context]`;
}

function formatList(label: string, values: string[]): string | null {
  if (!values.length) return null;
  return `${label}:\n${values.slice(0, 8).map((value) => `- ${value}`).join('\n')}`;
}

function pushField(lines: string[], label: string, value?: string | null) {
  if (!value || !value.trim()) return;
  lines.push(`${label}: ${value.trim()}`);
}

export function normalizeAgencySourceGenerationRequest(
  input: unknown,
  pathSourceImportId?: string | null
): AgencySourceGenerationRequest {
  const body = input && typeof input === 'object'
    ? input as Record<string, unknown>
    : {};
  const sourceImportId = pathSourceImportId
    || requiredString(firstDefined(body, 'sourceImportId', 'source_import_id'), 'source_import_id');
  const bodySourceImportId = optionalString(firstDefined(body, 'sourceImportId', 'source_import_id'), 'source_import_id');
  if (pathSourceImportId && bodySourceImportId && bodySourceImportId !== pathSourceImportId) {
    throw new AgencySourceGenerationError(400, 'source_import_id does not match route source id');
  }

  const contentTypeId = optionalString(firstDefined(body, 'contentTypeId', 'content_type_id', 'contentType', 'content_type'), 'content_type')
    || DEFAULT_CONTENT_TYPE_ID;
  const contentType = getContentTypeById(contentTypeId);

  if (!contentType?.outputType) {
    throw new AgencySourceGenerationError(400, 'content_type must reference a supported content type');
  }

  return {
    sourceImportId,
    clientId: requiredString(firstDefined(body, 'clientId', 'client_id'), 'client_id'),
    campaignId: optionalString(firstDefined(body, 'campaignId', 'campaign_id'), 'campaign_id'),
    brandVoiceId: optionalString(firstDefined(body, 'brandVoiceId', 'brand_voice_id'), 'brand_voice_id'),
    contentTypeId,
    channel: optionalString(firstDefined(body, 'channel', 'platform'), 'channel'),
    instructions: optionalString(firstDefined(body, 'instructions', 'customInstructions', 'custom_instructions'), 'instructions', MAX_INSTRUCTIONS_LENGTH),
    quantity: normalizeQuantity(firstDefined(body, 'quantity', 'count'), contentType.maxCount || contentType.count || 4),
  };
}

export function buildAgencyClientProfilePrompt(profile?: AgencyClientProfile | null): string {
  if (!profile) return '';

  const lines: string[] = [];
  pushField(lines, 'Business overview', profile.businessOverview);
  pushField(lines, 'Ideal customer profile', profile.idealCustomerProfile);
  pushField(lines, 'Positioning', profile.positioning);
  pushField(lines, 'Voice notes', profile.voiceNotes);
  pushField(lines, 'Customer service tone', profile.customerServiceTone);

  for (const section of [
    formatList('Offers', profile.offers),
    formatList('Competitors', profile.competitors),
    formatList('Content pillars', profile.contentPillars),
    formatList('Customer pain points', profile.customerPainPoints),
  ]) {
    if (section) lines.push(section);
  }

  return lines.length ? `=== AGENCY CLIENT PROFILE ===\n${lines.join('\n')}` : '';
}

export function buildAgencySourcePrompt(input: {
  source: AgencySourceImport;
  profile?: AgencyClientProfile | null;
  context?: ResolvedGenerationContext | null;
  contentTypeName?: string | null;
  channel?: string | null;
  instructions?: string | null;
}): string {
  const sections: string[] = [];
  const sourceLines: string[] = [];
  pushField(sourceLines, 'Source title', input.source.sourceTitle);
  pushField(sourceLines, 'Provider', input.source.provider);
  pushField(sourceLines, 'Summary', input.source.summary);
  if (input.source.metadata && Object.keys(input.source.metadata).length) {
    sourceLines.push(`Structured metadata:\n${JSON.stringify(input.source.metadata, null, 2)}`);
  }
  sourceLines.push(`Source content:\n${truncateText(input.source.rawText || input.source.summary || '')}`);
  sections.push(`=== AGENCY SOURCE MATERIAL ===\n${sourceLines.join('\n')}`);

  const profilePrompt = buildAgencyClientProfilePrompt(input.profile);
  if (profilePrompt) sections.push(profilePrompt);

  const contextPrompt = buildGenerationContextPrompt(input.context, {
    contentTypeId: input.contentTypeName || null,
    contentTypeName: input.contentTypeName || null,
    channel: input.channel || null,
  });
  if (contextPrompt) sections.push(contextPrompt);

  const instructionLines = [
    'Generate internal agency draft content from the source material.',
    'Do not add unsupported claims, statistics, testimonials, or promises.',
    'Preserve client context and make uncertainty explicit when the source is thin.',
  ];
  if (input.instructions) {
    instructionLines.push(`Additional instructions: ${input.instructions}`);
  }
  sections.push(`=== AGENCY QUALITY INSTRUCTIONS ===\n${instructionLines.join('\n')}`);

  return sections.join('\n\n');
}

export function buildAgencyGeneratedDraftInput(input: {
  request: AgencySourceGenerationRequest;
  source: AgencySourceImport;
  profile?: AgencyClientProfile | null;
  context?: ResolvedGenerationContext | null;
  generated: GenerationResult;
}): AgencyDraftInput {
  const contentType = getContentTypeById(input.request.contentTypeId);
  const channel = input.request.channel || contentType?.platformType || contentType?.platform || 'general';
  const titleBase = `${contentType?.name || input.request.contentTypeId} from ${input.source.sourceTitle || 'agency source'}`;
  const title = titleBase.length > 150 ? `${titleBase.slice(0, 147)}...` : titleBase;

  return {
    title,
    clientId: input.request.clientId,
    campaignId: input.request.campaignId,
    brandVoiceId: input.request.brandVoiceId || input.context?.brandVoice?.id || null,
    contentType: input.request.contentTypeId,
    platform: channel,
    status: 'in_review',
    body: input.generated.content,
    excerpt: input.generated.content.slice(0, 500),
    sourceLabel: input.source.sourceTitle || input.source.provider,
    tags: ['agency-generated', input.source.provider, input.request.contentTypeId],
    metadata: {
      agencyGenerated: true,
      generatedFromSourceImportId: input.source.id,
      sourceProvider: input.source.provider,
      sourceTitle: input.source.sourceTitle,
      sourceCreatedAt: input.source.createdAt,
      clientProfileId: input.profile?.id || null,
      requestedQuantity: input.request.quantity,
      requestedChannel: channel,
      requestedInstructions: input.request.instructions,
      generationContext: buildGenerationContextMetadata(input.context, {
        contentTypeId: input.request.contentTypeId,
        contentTypeName: contentType?.name || input.request.contentTypeId,
        channel,
      }) || null,
      generation: {
        model: input.generated.metadata?.model || null,
        wordCount: input.generated.wordCount,
        characterCount: input.generated.characterCount,
        costUSD: input.generated.costUSD,
        tokensUsed: input.generated.tokensUsed,
      },
    },
  };
}

async function getAgencyCampaign(
  supabase: SupabaseClient<any>,
  organizationId: string,
  campaignId: string | null
): Promise<Campaign | null> {
  if (!campaignId) return null;
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', campaignId)
    .maybeSingle() as { data: CampaignRow | null; error: any };

  if (error) throw new Error(error.message || 'Failed to load campaign context');
  return data ? mapCampaignRow(data) : null;
}

async function getAgencyBrandVoice(
  supabase: SupabaseClient<any>,
  organizationId: string,
  brandVoiceId: string | null
): Promise<BrandVoice | null> {
  if (!brandVoiceId) return null;
  const { data, error } = await supabase
    .from('brand_voices')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', brandVoiceId)
    .maybeSingle() as { data: BrandVoiceRow | null; error: any };

  if (error) throw new Error(error.message || 'Failed to load brand voice context');
  return data ? mapBrandVoiceRow(data) : null;
}

async function resolveAgencyContext(
  supabase: SupabaseClient<any>,
  organizationId: string,
  request: AgencySourceGenerationRequest
): Promise<ResolvedGenerationContext> {
  const campaign = await getAgencyCampaign(supabase, organizationId, request.campaignId);
  const brandVoiceId = request.brandVoiceId || campaign?.brandVoiceId || null;
  const brandVoice = await getAgencyBrandVoice(supabase, organizationId, brandVoiceId);
  return { creatorProfile: null, campaign, brandVoice, library: null };
}

export async function generateAgencyDraftFromSource(
  supabase: SupabaseClient<any>,
  organizationId: string,
  userId: string,
  request: AgencySourceGenerationRequest,
  generator: AgencySourceGenerator = generateContent
): Promise<AgencyDraft> {
  const source = await getAgencySourceImport(supabase, organizationId, request.sourceImportId);
  if (!source) {
    throw new AgencySourceGenerationError(404, 'Agency source import not found');
  }
  if (source.clientId !== request.clientId) {
    throw new AgencySourceGenerationError(400, 'source_import_id must belong to the selected agency client');
  }
  const effectiveRequest = {
    ...request,
    campaignId: request.campaignId || source.campaignId,
  };

  await validateAgencyDraftReferences(supabase, organizationId, {
    clientId: effectiveRequest.clientId,
    campaignId: effectiveRequest.campaignId,
    brandVoiceId: effectiveRequest.brandVoiceId,
  }, { clientId: effectiveRequest.clientId });

  const contentType = getContentTypeById(request.contentTypeId);
  if (!contentType?.outputType) {
    throw new CampaignLibraryValidationError('content_type must reference a supported content type');
  }

  const [profile, context] = await Promise.all([
    getAgencyClientProfile(supabase, effectiveRequest.clientId),
    resolveAgencyContext(supabase, organizationId, effectiveRequest),
  ]);
  const channel = effectiveRequest.channel || contentType.platformType || contentType.platform || 'general';
  const sourcePrompt = buildAgencySourcePrompt({
    source,
    profile,
    context,
    contentTypeName: contentType.name,
    channel,
    instructions: effectiveRequest.instructions,
  });
  const generated = await generator({
    transcriptionText: sourcePrompt,
    projectTitle: source.sourceTitle || 'Agency source import',
    outputType: contentType.outputType as OutputType,
    platform: channel as PlatformType,
    count: effectiveRequest.quantity,
  });

  return createAgencyDraft(
    supabase,
    organizationId,
    userId,
    buildAgencyGeneratedDraftInput({
      request: effectiveRequest,
      source,
      profile,
      context,
      generated,
    })
  );
}
