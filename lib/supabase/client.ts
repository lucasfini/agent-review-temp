import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
    'neq',
    'in',
    'like',
    'ilike',
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

export const createMockSupabaseClient = (): SupabaseClient<Database> => {
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
  } as unknown as SupabaseClient<Database>;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const isTestEnv = process.env.NODE_ENV === 'test'

export const supabase: SupabaseClient<Database> = isTestEnv
  ? createMockSupabaseClient()
  : createClient<Database>(supabaseUrl, supabaseAnonKey)

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
          status: 'uploading' | 'processing' | 'completed' | 'failed'
          transcription_text: string | null
          preset_speakers: any[] | null
          speaker_keywords: any[] | null
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
          status?: 'uploading' | 'processing' | 'completed' | 'failed'
          transcription_text?: string | null
          preset_speakers?: any[] | null
          speaker_keywords?: any[] | null
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
          status?: 'uploading' | 'processing' | 'completed' | 'failed'
          transcription_text?: string | null
          preset_speakers?: any[] | null
          speaker_keywords?: any[] | null
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
