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
  const meetingId = body?.meetingId;
  const fileId = body?.fileId;
  const performanceLevel = body?.performanceLevel || 'pro';

  if (!meetingId || !fileId) {
    return NextResponse.json({ error: 'Missing meetingId or fileId' }, { status: 400 });
  }

  const connection = await getConnection(user.id, 'zoom');
  if (!connection) return NextResponse.json({ error: 'Zoom not connected' }, { status: 404 });

  const { accessToken } = getDecryptedTokens(connection);
  if (!accessToken) return NextResponse.json({ error: 'Zoom token missing' }, { status: 401 });

  const detailsRes = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}/recordings`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!detailsRes.ok) {
    const text = await detailsRes.text();
    return NextResponse.json({ error: `Zoom API error: ${text}` }, { status: 500 });
  }

  const details = await detailsRes.json();
  const file = (details.recording_files || []).find((f: any) => f.id === fileId);
  if (!file) {
    return NextResponse.json({ error: 'Recording file not found' }, { status: 404 });
  }

  const existing = await supabaseAdmin
    .from('integration_imports')
    .select('project_id')
    .eq('user_id', user.id)
    .eq('provider', 'zoom')
    .eq('external_recording_id', fileId)
    .single() as { data: any; error: any };

  if (existing?.data?.project_id) {
    return NextResponse.json({ projectId: existing.data.project_id, deduped: true });
  }

  const downloadRes = await fetch(file.download_url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!downloadRes.ok) {
    const text = await downloadRes.text();
    return NextResponse.json({ error: `Zoom download error: ${text}` }, { status: 500 });
  }

  const arrayBuffer = await downloadRes.arrayBuffer();
  const fileName = file.file_name || `${details.topic || 'Zoom Recording'}.${(file.file_extension || 'mp4').toLowerCase()}`;
  const contentType = file.file_type === 'MP4' ? 'video/mp4' : 'audio/m4a';

  const result = await importRecording({
    userId: user.id,
    title: details.topic || 'Zoom Recording',
    fileName,
    contentType,
    buffer: arrayBuffer,
    performanceLevel,
    externalSource: { provider: 'zoom', recordingId: fileId }
  });

  await supabaseAdmin.from('integration_imports').insert({
    user_id: user.id,
    provider: 'zoom',
    external_recording_id: fileId,
    project_id: result.projectId,
    status: 'imported'
  } as any);

  return NextResponse.json({ projectId: result.projectId });
}
