import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { decryptToken, encryptToken } from '@/lib/integrations/crypto';

async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabaseAdmin
      .from('user_openai_settings')
      .select('api_key_enc, use_personal_key, openai_enabled')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Failed to load OpenAI settings' }, { status: 500 });
    }

    let maskedKey: string | null = null;
    if (data?.api_key_enc) {
      try {
        const decrypted = decryptToken(data.api_key_enc);
        const suffix = decrypted.slice(-4);
        maskedKey = decrypted.length > 4 ? `••••••••••••${suffix}` : 'Saved';
      } catch {
        maskedKey = 'Saved';
      }
    }

    return NextResponse.json({
      usePersonalKey: data?.use_personal_key ?? false,
      openAIEnabled: data?.openai_enabled ?? true,
      hasStoredKey: Boolean(data?.api_key_enc),
      maskedKey,
    });
  } catch (error) {
    console.error('[OPENAI SETTINGS API] GET failed:', error);
    return NextResponse.json({ error: 'Failed to load OpenAI settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const openAIApiKey = typeof body.openAIApiKey === 'string' ? body.openAIApiKey.trim() : '';
    const clearStoredKey = Boolean(body.clearStoredKey);
    const usePersonalKey = Boolean(body.usePersonalKey);
    const openAIEnabled = body.openAIEnabled !== false;

    const payload: Record<string, unknown> = {
      user_id: user.id,
      use_personal_key: usePersonalKey,
      openai_enabled: openAIEnabled,
      updated_at: new Date().toISOString(),
    };

    if (openAIApiKey) {
      payload.api_key_enc = encryptToken(openAIApiKey);
    } else if (clearStoredKey) {
      payload.api_key_enc = null;
    }

    const { error } = await supabaseAdmin
      .from('user_openai_settings')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to save OpenAI settings' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[OPENAI SETTINGS API] PUT failed:', error);
    return NextResponse.json({ error: 'Failed to save OpenAI settings' }, { status: 500 });
  }
}
