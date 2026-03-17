import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabase as clientSupabase } from './client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const isTestEnv = process.env.NODE_ENV === 'test'
const isServer = typeof window === 'undefined'

// Create a server-side client that bypasses RLS (mocked in tests)
// On client-side, fall back to regular client to avoid errors
export const supabaseAdmin: SupabaseClient<any> = isTestEnv
  ? (clientSupabase as SupabaseClient<any>)
  : !isServer
  ? (clientSupabase as SupabaseClient<any>) // Use client supabase on browser
  : createSupabaseClient<any>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
