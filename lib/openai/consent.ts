import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/server';
import { decryptToken } from '@/lib/integrations/crypto';

const SHARED_OPENAI_KEY = process.env.OPENAI_API_KEY_OPTIN || null;

export async function getOpenAIApiKeyForUser(userId?: string): Promise<string | null> {
  if (userId) {
    const { data, error } = await supabaseAdmin
      .from('user_openai_settings')
      .select('api_key_enc, use_personal_key, openai_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      if (data.openai_enabled === false) {
        return null;
      }
      if (data.use_personal_key && data.api_key_enc) {
        try {
          return decryptToken(data.api_key_enc);
        } catch (decryptError) {
          console.error('[OPENAI] Failed to decrypt stored user token:', decryptError);
        }
      }
    }
  }

  if (!SHARED_OPENAI_KEY) {
    console.error('[OPENAI] OPENAI_API_KEY_OPTIN is not configured.');
    return null;
  }
  return SHARED_OPENAI_KEY;
}

export async function getOpenAIClientForUser(userId?: string): Promise<OpenAI | null> {
  void userId;
  const apiKey = await getOpenAIApiKeyForUser();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}
