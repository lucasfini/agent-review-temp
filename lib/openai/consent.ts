import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/server';

const DEFAULT_NONOPTIN_KEY = process.env.OPENAI_API_KEY_NONOPTIN || process.env.OPENAI_API_KEY || null;
const OPTIN_KEY = process.env.OPENAI_API_KEY_OPTIN || null;

export async function getOpenAIApiKeyForUser(userId?: string): Promise<string | null> {
  if (!userId) return DEFAULT_NONOPTIN_KEY;

  try {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
    const optedIn = Boolean(user?.user_metadata?.openai_data_sharing_opt_in);

    if (optedIn && OPTIN_KEY) return OPTIN_KEY;
    return DEFAULT_NONOPTIN_KEY;
  } catch (error) {
    console.warn('[OPENAI] Failed to resolve user opt-in; defaulting to non-opt-in key.', error);
    return DEFAULT_NONOPTIN_KEY;
  }
}

export async function getOpenAIClientForUser(userId?: string): Promise<OpenAI | null> {
  const apiKey = await getOpenAIApiKeyForUser(userId);
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}
