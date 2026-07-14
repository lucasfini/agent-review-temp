import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getDecryptedTokens, integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';
import { supabaseAdmin } from '@/lib/supabase/server';
import { billingErrorResponse } from '@/lib/billing/middleware';
import { normalizeAnalysisOptions } from '@/lib/analysis-options';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import { runEntitlementGuard } from '@/lib/billing/entitlement-guards';
import { recordSubscriptionUsage } from '@/lib/billing/subscription-usage-counters';
import { fetchNotionBlockText, getNotionHeaders, getPageTitle } from '../_helpers';
import {
  notifyImportComplete,
  notifyImportFailed,
} from '@/lib/notifications/notification-events';

async function ensureAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user;
}

export async function POST(request: NextRequest) {
  let notificationOrganizationId: string | null = null;
  let notificationUserId: string | null = null;
  try {
    const user = await ensureAuth(request);
    if (!user) return signedOutIntegrationResponse();
    notificationUserId = user.id;

    const body = await request.json().catch(() => ({}));
    const pageId = typeof body?.pageId === 'string' ? body.pageId.trim() : '';
    const analysisOptions = normalizeAnalysisOptions(body?.analysisOptions);
    const performanceLevel = body?.performanceLevel || 'content_kit';

    if (!pageId) {
      return integrationErrorResponse({ provider: 'notion', code: 'BAD_REQUEST', action: 'import', status: 400 });
    }

    const organizationId = await resolveOrganizationIdForWrite(user.id);
    notificationOrganizationId = organizationId;
    const entitlementGuard = await runEntitlementGuard({
      organizationId,
      legacyUserId: user.id,
      action: 'integration_import',
      requestedAmount: 1,
      logContext: {
        route: 'app/api/integrations/notion/import',
        userId: user.id,
        metadata: { provider: 'notion' },
      },
    });
    if (entitlementGuard.response) {
      return entitlementGuard.response;
    }

    const connection = await getConnection(user.id, 'notion');
    if (!connection) {
      return integrationErrorResponse({ provider: 'notion', code: 'RECONNECT_REQUIRED', action: 'import', status: 404, userId: user.id });
    }

    const { accessToken } = getDecryptedTokens(connection);
    if (!accessToken) {
      return integrationErrorResponse({ provider: 'notion', code: 'RECONNECT_REQUIRED', action: 'import', status: 401, userId: user.id });
    }

    const existing = await supabaseAdmin
      .from('integration_imports')
      .select('project_id')
      .eq('user_id', user.id)
      .eq('provider', 'notion')
      .eq('external_recording_id', pageId)
      .single() as { data: any; error: any };

    if (existing?.data?.project_id) {
      return NextResponse.json({ projectId: existing.data.project_id, deduped: true });
    }

    const pageRes = await fetch(`https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`, {
      headers: getNotionHeaders(accessToken),
    });

    if (!pageRes.ok) {
      const text = await pageRes.text();
      return integrationErrorResponse({
        provider: 'notion',
        code: pageRes.status === 401 || pageRes.status === 403 ? 'RECONNECT_REQUIRED' : 'LIST_FAILED',
        action: 'import',
        status: pageRes.status === 401 || pageRes.status === 403 ? 401 : 500,
        logPrefix: '[NOTION IMPORT] Provider page error:',
        cause: text,
        userId: user.id,
      });
    }

    const page = await pageRes.json();
    const title = getPageTitle(page);
    const lines = await fetchNotionBlockText(accessToken, pageId);
    const transcriptionText = lines.join('\n\n').trim();

    if (transcriptionText.length < 20) {
      return NextResponse.json({ error: 'This Notion page does not contain enough text to import.' }, { status: 400 });
    }

    const fingerprint = `notion-${pageId}-${Date.now()}`;
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        title,
        audio_file_name: `${title.replace(/[^a-zA-Z0-9.-]/g, '_')}.txt`,
        audio_file_size: Buffer.byteLength(transcriptionText, 'utf8'),
        audio_duration: null,
        audio_duration_seconds: null,
        audio_expires_at: null,
        audio_fingerprint: fingerprint,
        status: 'completed',
        processing_stage: 'completed',
        processing_progress: 100,
        processing_message: 'Imported from Notion.',
        processing_started_at: new Date().toISOString(),
        processing_completed_at: new Date().toISOString(),
        performance_level: performanceLevel,
        transcription_text: transcriptionText,
        transcription_segments: [],
        speaker_data: null,
        metadata: {
          analysis_options: analysisOptions,
          source: 'notion',
          notion: {
            pageId,
            pageUrl: page.url || null,
            importedAt: new Date().toISOString(),
          },
        },
      } as any)
      .select()
      .single() as { data: any; error: any };

    if (projectError || !project) {
      throw new Error(projectError?.message || 'Failed to create Notion project');
    }

    await supabaseAdmin.from('integration_imports').insert({
      user_id: user.id,
      organization_id: organizationId,
      provider: 'notion',
      external_recording_id: pageId,
      project_id: project.id,
      status: 'imported',
    } as any);

    await recordSubscriptionUsage({
      organizationId,
      userId: user.id,
      counterKey: 'integration_import',
      quantity: 1,
      idempotencyKey: `integration_import:notion:${pageId}`,
      metadata: {
        source: 'notion_import',
        pageId,
        projectId: project.id,
      },
      logContext: {
        route: 'app/api/integrations/notion/import',
        userId: user.id,
        projectId: project.id,
        source: 'notion_import',
      },
    });

    await notifyImportComplete({
      organizationId,
      actorUserId: user.id,
      projectId: project.id,
      projectTitle: project.title || title,
      sourceName: 'Notion',
      idempotencyKey: `import_complete:notion:${pageId}`,
      metadata: {
        source: 'notion_import',
        pageId,
      },
    });

    return NextResponse.json({ projectId: project.id });
  } catch (error) {
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) return billingResponse;
    console.error('[NOTION IMPORT] Failed:', error);
    await notifyImportFailed({
      organizationId: notificationOrganizationId,
      actorUserId: notificationUserId,
      sourceName: 'Notion',
      metadata: {
        source: 'notion_import',
        error: error instanceof Error ? error.message : 'Import failed',
      },
    });
    return integrationErrorResponse({ provider: 'notion', code: 'IMPORT_FAILED', action: 'import', status: 500 });
  }
}
