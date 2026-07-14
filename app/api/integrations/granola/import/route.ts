import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { billingErrorResponse } from '@/lib/billing/middleware';
import { normalizeAnalysisOptions } from '@/lib/analysis-options';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import { runEntitlementGuard } from '@/lib/billing/entitlement-guards';
import { recordSubscriptionUsage } from '@/lib/billing/subscription-usage-counters';
import { integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';
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

function sanitizeFileName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '') || 'granola_notes.txt';
}

export async function POST(request: NextRequest) {
  let notificationOrganizationId: string | null = null;
  let notificationUserId: string | null = null;
  try {
    const user = await ensureAuth(request);
    if (!user) return signedOutIntegrationResponse();
    notificationUserId = user.id;

    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === 'string' && body.title.trim()
      ? body.title.trim()
      : 'Granola notes';
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const analysisOptions = normalizeAnalysisOptions(body?.analysisOptions);
    const performanceLevel = body?.performanceLevel || 'content_kit';

    if (text.length < 20) {
      return NextResponse.json({ error: 'Paste at least 20 characters of Granola notes or transcript text.' }, { status: 400 });
    }

    const organizationId = await resolveOrganizationIdForWrite(user.id);
    notificationOrganizationId = organizationId;
    const entitlementGuard = await runEntitlementGuard({
      organizationId,
      legacyUserId: user.id,
      action: 'integration_import',
      requestedAmount: 1,
      logContext: {
        route: 'app/api/integrations/granola/import',
        userId: user.id,
        metadata: { provider: 'granola' },
      },
    });
    if (entitlementGuard.response) {
      return entitlementGuard.response;
    }

    const importId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        title,
        audio_file_name: sanitizeFileName(`${title}.txt`),
        audio_file_size: Buffer.byteLength(text, 'utf8'),
        audio_duration: null,
        audio_duration_seconds: null,
        audio_expires_at: null,
        audio_fingerprint: `granola-${importId}`,
        status: 'completed',
        processing_stage: 'completed',
        processing_progress: 100,
        processing_message: 'Imported from Granola.',
        processing_started_at: new Date().toISOString(),
        processing_completed_at: new Date().toISOString(),
        performance_level: performanceLevel,
        transcription_text: text,
        transcription_segments: [],
        speaker_data: null,
        metadata: {
          analysis_options: analysisOptions,
          source: 'granola',
          granola: {
            importId,
            importedAt: new Date().toISOString(),
            importMode: 'manual_paste',
          },
        },
      } as any)
      .select()
      .single() as { data: any; error: any };

    if (projectError || !project) {
      throw new Error(projectError?.message || 'Failed to create Granola project');
    }

    await supabaseAdmin.from('integration_imports').insert({
      user_id: user.id,
      organization_id: organizationId,
      provider: 'granola',
      external_recording_id: importId,
      project_id: project.id,
      status: 'imported',
    } as any);

    await recordSubscriptionUsage({
      organizationId,
      userId: user.id,
      counterKey: 'integration_import',
      quantity: 1,
      idempotencyKey: `integration_import:granola:${importId}`,
      metadata: {
        source: 'granola_import',
        importId,
        projectId: project.id,
      },
      logContext: {
        route: 'app/api/integrations/granola/import',
        userId: user.id,
        projectId: project.id,
        source: 'granola_import',
      },
    });

    await notifyImportComplete({
      organizationId,
      actorUserId: user.id,
      projectId: project.id,
      projectTitle: project.title || title,
      sourceName: 'Granola',
      idempotencyKey: `import_complete:granola:${importId}`,
      metadata: {
        source: 'granola_import',
        importId,
      },
    });

    return NextResponse.json({ projectId: project.id });
  } catch (error) {
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) return billingResponse;
    console.error('[GRANOLA IMPORT] Failed:', error);
    await notifyImportFailed({
      organizationId: notificationOrganizationId,
      actorUserId: notificationUserId,
      sourceName: 'Granola',
      metadata: {
        source: 'granola_import',
        error: error instanceof Error ? error.message : 'Import failed',
      },
    });
    return integrationErrorResponse({ provider: 'granola', code: 'IMPORT_FAILED', action: 'import', status: 500 });
  }
}
