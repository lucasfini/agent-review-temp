import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const BUCKET = 'profile-images';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

function getFileExtension(type: string) {
  switch (type) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
}

async function clearUserAvatarFiles(userId: string) {
  const { data } = await supabaseAdmin.storage.from(BUCKET).list(userId, {
    limit: 100,
    offset: 0,
  });

  if (!data?.length) return;

  const paths = data.map((file) => `${userId}/${file.name}`);
  await supabaseAdmin.storage.from(BUCKET).remove(paths);
}

async function clearAvatarReferences(userId: string, email: string) {
  await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId,
      email,
      avatar_url: null,
      updated_at: new Date().toISOString(),
    });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Please choose an image to upload.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Use a JPG, PNG, or WebP image.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Image must be 5MB or smaller.' }, { status: 400 });
    }

    const ext = getFileExtension(file.type);
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported image format.' }, { status: 400 });
    }

    await clearUserAvatarFiles(user.id);

    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message || 'Failed to upload image.' }, { status: 500 });
    }

    const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      success: true,
      avatarUrl: publicData.publicUrl,
    });
  } catch (error) {
    console.error('[USER AVATAR API] POST failed:', error);
    return NextResponse.json({ error: 'Failed to upload avatar.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await clearUserAvatarFiles(user.id);
    await clearAvatarReferences(user.id, user.email || '');
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata || {}),
        avatar_url: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[USER AVATAR API] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to remove avatar.' }, { status: 500 });
  }
}
