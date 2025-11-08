import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
          processing_started_at?: string | null
          processing_completed_at?: string | null
          processing_time_seconds?: number | null
          created_at?: string
          updated_at?: string
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