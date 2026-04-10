import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

type AnyFn = (...args: any[]) => any;

const hasJestRuntime = () =>
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as { jest?: { fn: (impl?: AnyFn) => AnyFn } }).jest !== 'undefined';

const createMockFunction = (impl?: AnyFn): AnyFn => {
  if (hasJestRuntime()) {
    return (globalThis as { jest: { fn: (impl?: AnyFn) => AnyFn } }).jest.fn(impl);
  }
  if (impl) {
    return impl;
  }
  return () => undefined;
};

const createMockQueryBuilder = () => {
  const builder: Record<string, AnyFn> = {};
  const chainableMethods = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'is',
    'neq',
    'not',
    'in',
    'like',
    'ilike',
    'lte',
    'order',
    'limit',
    'range',
    'match',
    'filter',
    'contains',
    'textSearch',
    'returns',
    'throwOnError',
  ];

  chainableMethods.forEach((method) => {
    builder[method] = createMockFunction(() => builder);
  });

  builder.single = createMockFunction(async () => ({ data: null, error: null }));
  builder.maybeSingle = createMockFunction(async () => ({ data: null, error: null }));
  builder.then = undefined as unknown as AnyFn;

  return builder;
};

const createMockStorageBucket = () => ({
  upload: createMockFunction(async () => ({ data: null, error: null })),
  remove: createMockFunction(async () => ({ data: null, error: null })),
  list: createMockFunction(async () => ({ data: [], error: null })),
  download: createMockFunction(async () => ({ data: null, error: null })),
  getPublicUrl: createMockFunction(() => ({ data: { publicUrl: '' }, error: null })),
});

export const createMockSupabaseClient = (): SupabaseClient<any> => {
  const authResponse = async () => ({ data: { user: null, session: null }, error: null });
  const sessionResponse = async () => ({ data: { session: null }, error: null });

  return {
    auth: {
      signUp: createMockFunction(authResponse),
      signInWithPassword: createMockFunction(authResponse),
      signOut: createMockFunction(async () => ({ error: null })),
      getSession: createMockFunction(sessionResponse),
      onAuthStateChange: createMockFunction(() => ({
        data: { subscription: { unsubscribe: () => undefined } },
        error: null,
      })),
      resetPasswordForEmail: createMockFunction(async () => ({ data: {}, error: null })),
      updateUser: createMockFunction(authResponse),
    },
    from: createMockFunction(() => createMockQueryBuilder()),
    storage: {
      from: createMockFunction(() => createMockStorageBucket()),
    },
    functions: {
      invoke: createMockFunction(async () => ({ data: null, error: null })),
    },
    channel: createMockFunction(() => ({
      on: createMockFunction(() => ({
        subscribe: createMockFunction(() => ({ unsubscribe: () => undefined })),
      })),
    })),
    removeChannel: createMockFunction(() => undefined),
    getChannels: createMockFunction(() => []),
  } as unknown as SupabaseClient<any>;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const isTestEnv = process.env.NODE_ENV === 'test'

const SUPABASE_STORAGE_KEYS = [
  'supabase.auth.token',
  'supabase.auth.token-code-verifier',
  'supabase.auth.token-user',
] as const

const base64UrlToBytes = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  const binary = window.atob(normalized + padding)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

const decodeCookiePart = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const clearCookie = (name: string) => {
  document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax`
}

const sanitizeSupabaseAuthStorage = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const cookiePairs = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf('=')
      const rawName = separatorIndex >= 0 ? entry.slice(0, separatorIndex) : entry
      const rawValue = separatorIndex >= 0 ? entry.slice(separatorIndex + 1) : ''

      return {
        name: decodeCookiePart(rawName),
        value: decodeCookiePart(rawValue),
      }
    })

  for (const key of SUPABASE_STORAGE_KEYS) {
    const matchingCookies = cookiePairs
      .filter(({ name }) => name === key || name.startsWith(`${key}.`))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))

    if (matchingCookies.length === 0) {
      continue
    }

    const combinedValue = matchingCookies.map(({ value }) => value).join('')

    if (!combinedValue.startsWith('base64-')) {
      continue
    }

    const encodedValue = combinedValue.slice('base64-'.length)

    try {
      const bytes = base64UrlToBytes(encodedValue)
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      matchingCookies.forEach(({ name }) => clearCookie(name))

      try {
        window.localStorage.removeItem(key)
      } catch {}
    }
  }
}

if (!isTestEnv) {
  sanitizeSupabaseAuthStorage()
}

export const supabase: SupabaseClient<any> = isTestEnv
  ? createMockSupabaseClient()
  : createBrowserClient<any>(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
      },
    })

export type Database = {
  public: {
    Tables: {
      waitlist: {
        Row: {
          id: string
          email: string
          name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          created_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          username: string | null
          first_name: string | null
          last_name: string | null
          avatar_url: string | null
          subscription_plan: 'free' | 'creator' | 'professional' | 'agency'
          subscription_status: 'inactive' | 'active' | 'past_due' | 'canceled'
          processing_hours_used: number
          processing_hours_limit: number
          stripe_customer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          username?: string | null
          first_name?: string | null
          last_name?: string | null
          avatar_url?: string | null
          subscription_plan?: 'free' | 'creator' | 'professional' | 'agency'
          subscription_status?: 'inactive' | 'active' | 'past_due' | 'canceled'
          processing_hours_used?: number
          processing_hours_limit?: number
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          username?: string | null
          first_name?: string | null
          last_name?: string | null
          avatar_url?: string | null
          subscription_plan?: 'free' | 'creator' | 'professional' | 'agency'
          subscription_status?: 'inactive' | 'active' | 'past_due' | 'canceled'
          processing_hours_used?: number
          processing_hours_limit?: number
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          audio_file_name: string | null
          audio_file_size: number | null
          audio_duration: number | null
          audio_expires_at: string | null
          audio_deleted_at: string | null
          status: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled'
          performance_level: string | null
          metadata: any | null
          transcription_text: string | null
          preset_speakers: any[] | null
          speaker_keywords: any[] | null
          processing_stage: string | null
          processing_progress: number | null
          processing_message: string | null
          stage_started_at: string | null
          processing_started_at: string | null
          processing_completed_at: string | null
          processing_time_seconds: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          audio_file_name?: string | null
          audio_file_size?: number | null
          audio_duration?: number | null
          audio_expires_at?: string | null
          audio_deleted_at?: string | null
          status?: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled'
          performance_level?: string | null
          metadata?: any | null
          transcription_text?: string | null
          preset_speakers?: any[] | null
          speaker_keywords?: any[] | null
          processing_stage?: string | null
          processing_progress?: number | null
          processing_message?: string | null
          stage_started_at?: string | null
          processing_started_at?: string | null
          processing_completed_at?: string | null
          processing_time_seconds?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          audio_file_name?: string | null
          audio_file_size?: number | null
          audio_duration?: number | null
          audio_expires_at?: string | null
          audio_deleted_at?: string | null
          status?: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled'
          performance_level?: string | null
          metadata?: any | null
          transcription_text?: string | null
          preset_speakers?: any[] | null
          speaker_keywords?: any[] | null
          processing_stage?: string | null
          processing_progress?: number | null
          processing_message?: string | null
          stage_started_at?: string | null
          processing_started_at?: string | null
          processing_completed_at?: string | null
          processing_time_seconds?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      integration_connections: {
        Row: {
          id: string
          user_id: string
          provider: 'zoom' | 'microsoft'
          external_account_id: string
          status: 'connected' | 'revoked'
          scopes: string[] | null
          access_token_enc: string | null
          refresh_token_enc: string | null
          expires_at: string | null
          metadata: any | null
          created_at: string
          updated_at: string
          last_sync_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          provider: 'zoom' | 'microsoft'
          external_account_id: string
          status?: 'connected' | 'revoked'
          scopes?: string[] | null
          access_token_enc?: string | null
          refresh_token_enc?: string | null
          expires_at?: string | null
          metadata?: any | null
          created_at?: string
          updated_at?: string
          last_sync_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          provider?: 'zoom' | 'microsoft'
          external_account_id?: string
          status?: 'connected' | 'revoked'
          scopes?: string[] | null
          access_token_enc?: string | null
          refresh_token_enc?: string | null
          expires_at?: string | null
          metadata?: any | null
          created_at?: string
          updated_at?: string
          last_sync_at?: string | null
        }
      }
      integration_imports: {
        Row: {
          id: string
          user_id: string
          provider: 'zoom' | 'microsoft'
          external_recording_id: string
          project_id: string | null
          status: 'imported' | 'failed'
          error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: 'zoom' | 'microsoft'
          external_recording_id: string
          project_id?: string | null
          status?: 'imported' | 'failed'
          error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: 'zoom' | 'microsoft'
          external_recording_id?: string
          project_id?: string | null
          status?: 'imported' | 'failed'
          error?: string | null
          created_at?: string
        }
      }
      outputs: {
        Row: {
          id: string
          project_id: string
          type: 'blog_post' | 'social_post' | 'quote_graphic' | 'audiogram' | 'newsletter' | 'show_notes'
          platform: 'twitter' | 'linkedin' | 'instagram' | 'facebook' | 'youtube' | 'general' | null
          title: string | null
          content: string
          metadata: any | null
          status: 'generated' | 'edited' | 'published'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          type: 'blog_post' | 'social_post' | 'quote_graphic' | 'audiogram' | 'newsletter' | 'show_notes'
          platform?: 'twitter' | 'linkedin' | 'instagram' | 'facebook' | 'youtube' | 'general' | null
          title?: string | null
          content: string
          metadata?: any | null
          status?: 'generated' | 'edited' | 'published'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          type?: 'blog_post' | 'social_post' | 'quote_graphic' | 'audiogram' | 'newsletter' | 'show_notes'
          platform?: 'twitter' | 'linkedin' | 'instagram' | 'facebook' | 'youtube' | 'general' | null
          title?: string | null
          content?: string
          metadata?: any | null
          status?: 'generated' | 'edited' | 'published'
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
