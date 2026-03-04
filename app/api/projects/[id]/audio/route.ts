import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin } from '@/lib/supabase/server';
import { r2Client, BUCKET_NAME } from '@/lib/r2';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    const authHeader = request.headers.get('authorization');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader?.replace('Bearer ', '') || ''
    );

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const fileName = body.fileName as string;

    if (!fileName) {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }

    await r2Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
    }));

    console.log(`[audio-delete] Deleted R2 file: ${fileName} (project ${projectId})`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[audio-delete] Error:', error);
    return NextResponse.json({ error: 'Failed to delete audio file' }, { status: 500 });
  }
}
