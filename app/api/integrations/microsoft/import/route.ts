import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getDecryptedTokens } from '../../_utils';
import { supabaseAdmin } from '@/lib/supabase/server';
import { importRecording } from '@/lib/integrations/importer';

async function ensureAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user;
}

export async function POST(request: NextRequest) {
  const user = await ensureAuth(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const itemId = body?.itemId;
  const performanceLevel = body?.performanceLevel || 'pro';

  if (!itemId) {
    return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
  }

  const connection = await getConnection(user.id, 'microsoft');
  if (!connection) return NextResponse.json({ error: 'Microsoft not connected' }, { status: 404 });

  const { accessToken } = getDecryptedTokens(connection);
  if (!accessToken) return NextResponse.json({ error: 'Microsoft token missing' }, { status: 401 });

  const existing = await supabaseAdmin
    .from('integration_imports')
    .select('project_id')
    .eq('user_id', user.id)
    .eq('provider', 'microsoft')
    .eq('external_recording_id', itemId)
    .single() as { data: any; error: any };

  if (existing?.data?.project_id) {
    return NextResponse.json({ projectId: existing.data.project_id, deduped: true });
  }

  const itemRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!itemRes.ok) {
    const text = await itemRes.text();
    return NextResponse.json({ error: `Microsoft Graph error: ${text}` }, { status: 500 });
  }

  const item = await itemRes.json();
  const downloadUrl = item['@microsoft.graph.downloadUrl'];
  if (!downloadUrl) {
    return NextResponse.json({ error: 'Download URL not available' }, { status: 400 });
  }

  const downloadRes = await fetch(downloadUrl);
  if (!downloadRes.ok) {
    const text = await downloadRes.text();
    return NextResponse.json({ error: `Microsoft download error: ${text}` }, { status: 500 });
  }

  const arrayBuffer = await downloadRes.arrayBuffer();
  const fileName = item.name || 'Teams Recording.mp4';
  const contentType = item.file?.mimeType || 'video/mp4';

  const result = await importRecording({
    userId: user.id,
    title: item.name?.replace(/\.[^/.]+$/, '') || 'Teams Recording',
    fileName,
    contentType,
    buffer: arrayBuffer,
    performanceLevel,
    externalSource: { provider: 'microsoft', recordingId: itemId }
  });

  await supabaseAdmin.from('integration_imports').insert({
    user_id: user.id,
    provider: 'microsoft',
    external_recording_id: itemId,
    project_id: result.projectId,
    status: 'imported'
  } as any);

  return NextResponse.json({ projectId: result.projectId });
}
