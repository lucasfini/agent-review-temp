import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_credits: {
        Row: {
          balance: number
          created_at: string
          id: string
          lifetime_credits_added: number | null
          lifetime_credits_spent: number | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          lifetime_credits_added?: number | null
          lifetime_credits_spent?: number | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          lifetime_credits_added?: number | null
          lifetime_credits_spent?: number | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_email: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          status: string
          target_id: string | null
          target_label: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_email: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          status?: string
          target_id?: string | null
          target_label?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_email?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          status?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string
        }
        Relationships: []
      }
      billing_price_overrides: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      billing_reservations: {
        Row: {
          completed_at: string | null
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          metadata: Json | null
          project_id: string | null
          released_amount: number
          reserved_amount: number
          settled_amount: number
          status: string
          updated_at: string
          user_id: string | null
          workflow_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          project_id?: string | null
          released_amount?: number
          reserved_amount: number
          settled_amount?: number
          status?: string
          updated_at?: string
          user_id?: string | null
          workflow_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          project_id?: string | null
          released_amount?: number
          reserved_amount?: number
          settled_amount?: number
          status?: string
          updated_at?: string
          user_id?: string | null
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_reservations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_content_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_reservations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_cost_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_reservations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_requests: {
        Row: {
          affected_page: string | null
          category: string
          created_at: string
          email: string
          id: string
          message: string
          project_title: string | null
          screenshot_url: string | null
          service_area: string | null
          severity: string
          status: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          affected_page?: string | null
          category: string
          created_at?: string
          email: string
          id?: string
          message: string
          project_title?: string | null
          screenshot_url?: string | null
          service_area?: string | null
          severity?: string
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          affected_page?: string | null
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          project_title?: string | null
          screenshot_url?: string | null
          service_area?: string | null
          severity?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      content_generation_cache: {
        Row: {
          analysis: Json
          cache_key: string
          content_types: string[]
          created_at: string | null
          generated_content: Json
          project_id: string
          transcription_hash: string
        }
        Insert: {
          analysis: Json
          cache_key: string
          content_types: string[]
          created_at?: string | null
          generated_content: Json
          project_id: string
          transcription_hash: string
        }
        Update: {
          analysis?: Json
          cache_key?: string
          content_types?: string[]
          created_at?: string | null
          generated_content?: Json
          project_id?: string
          transcription_hash?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          admin_user_id: string | null
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          id: string
          invoice_number: string | null
          metadata: Json | null
          payment_id: string | null
          reason: string | null
          reservation_id: string | null
          transaction_type: string
          usage_event_id: string | null
          user_id: string | null
        }
        Insert: {
          admin_user_id?: string | null
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          payment_id?: string | null
          reason?: string | null
          reservation_id?: string | null
          transaction_type: string
          usage_event_id?: string | null
          user_id?: string | null
        }
        Update: {
          admin_user_id?: string | null
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          payment_id?: string | null
          reason?: string | null
          reservation_id?: string | null
          transaction_type?: string
          usage_event_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "billing_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_usage_event_id_fkey"
            columns: ["usage_event_id"]
            isOneToOne: false
            referencedRelation: "usage_events"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_progress: {
        Row: {
          completed_blocks: number
          created_at: string
          current_block: Json | null
          id: string
          message: string | null
          project_id: string
          status: string
          total_blocks: number
          updated_at: string
        }
        Insert: {
          completed_blocks?: number
          created_at?: string
          current_block?: Json | null
          id?: string
          message?: string | null
          project_id: string
          status: string
          total_blocks: number
          updated_at?: string
        }
        Update: {
          completed_blocks?: number
          created_at?: string
          current_block?: Json | null
          id?: string
          message?: string | null
          project_id?: string
          status?: string
          total_blocks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_progress_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "project_content_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_progress_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "project_cost_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_progress_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          category: Database["public"]["Enums"]["insight_category"]
          confidence: number | null
          cost_usd: number | null
          created_at: string | null
          entity_id: string
          external_sources: Json | null
          full_explanation: string | null
          id: string
          label: string
          match_text: string
          match_variants: string[] | null
          project_id: string
          related_concepts: string[] | null
          relationships: Json | null
          simple_definition: string | null
          status: Database["public"]["Enums"]["insight_status"] | null
          transcript_excerpts: Json | null
          updated_at: string | null
          why_it_matters: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["insight_category"]
          confidence?: number | null
          cost_usd?: number | null
          created_at?: string | null
          entity_id: string
          external_sources?: Json | null
          full_explanation?: string | null
          id?: string
          label: string
          match_text: string
          match_variants?: string[] | null
          project_id: string
          related_concepts?: string[] | null
          relationships?: Json | null
          simple_definition?: string | null
          status?: Database["public"]["Enums"]["insight_status"] | null
          transcript_excerpts?: Json | null
          updated_at?: string | null
          why_it_matters?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["insight_category"]
          confidence?: number | null
          cost_usd?: number | null
          created_at?: string | null
          entity_id?: string
          external_sources?: Json | null
          full_explanation?: string | null
          id?: string
          label?: string
          match_text?: string
          match_variants?: string[] | null
          project_id?: string
          related_concepts?: string[] | null
          relationships?: Json | null
          simple_definition?: string | null
          status?: Database["public"]["Enums"]["insight_status"] | null
          transcript_excerpts?: Json | null
          updated_at?: string | null
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_content_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_cost_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          access_token_enc: string | null
          created_at: string
          expires_at: string | null
          external_account_id: string
          id: string
          last_sync_at: string | null
          metadata: Json | null
          provider: string
          refresh_token_enc: string | null
          scopes: string[] | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          created_at?: string
          expires_at?: string | null
          external_account_id: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json | null
          provider: string
          refresh_token_enc?: string | null
          scopes?: string[] | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          created_at?: string
          expires_at?: string | null
          external_account_id?: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json | null
          provider?: string
          refresh_token_enc?: string | null
          scopes?: string[] | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      integration_imports: {
        Row: {
          created_at: string
          error: string | null
          external_recording_id: string
          id: string
          project_id: string | null
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          external_recording_id: string
          id?: string
          project_id?: string | null
          provider: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          external_recording_id?: string
          id?: string
          project_id?: string | null
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_imports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_content_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_imports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_cost_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_imports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_coverage_snapshots: {
        Row: {
          ai_cost_usd: number | null
          ai_usage: Json | null
          analytics: Json | null
          coverage_window: string | null
          created_at: string
          ctas: Json | null
          goals_snapshot: Json | null
          id: string
          notes: string | null
          opportunities: Json | null
          project_id: string
          project_title: string | null
          topics: Json
          total_input_tokens: number | null
          total_output_tokens: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_cost_usd?: number | null
          ai_usage?: Json | null
          analytics?: Json | null
          coverage_window?: string | null
          created_at?: string
          ctas?: Json | null
          goals_snapshot?: Json | null
          id?: string
          notes?: string | null
          opportunities?: Json | null
          project_id: string
          project_title?: string | null
          topics: Json
          total_input_tokens?: number | null
          total_output_tokens?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_cost_usd?: number | null
          ai_usage?: Json | null
          analytics?: Json | null
          coverage_window?: string | null
          created_at?: string
          ctas?: Json | null
          goals_snapshot?: Json | null
          id?: string
          notes?: string | null
          opportunities?: Json | null
          project_id?: string
          project_title?: string | null
          topics?: Json
          total_input_tokens?: number | null
          total_output_tokens?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrative_coverage_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_content_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_coverage_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_cost_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_coverage_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_goals: {
        Row: {
          cadence_days: number | null
          created_at: string
          goal_type: string
          id: string
          metadata: Json | null
          status: string
          target_mentions: number | null
          topic_id: string | null
          topic_label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cadence_days?: number | null
          created_at?: string
          goal_type: string
          id?: string
          metadata?: Json | null
          status?: string
          target_mentions?: number | null
          topic_id?: string | null
          topic_label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cadence_days?: number | null
          created_at?: string
          goal_type?: string
          id?: string
          metadata?: Json | null
          status?: string
          target_mentions?: number | null
          topic_id?: string | null
          topic_label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      outputs: {
        Row: {
          ai_cost_usd: number | null
          ai_model: string | null
          block_number: number | null
          character_count: number | null
          character_count_limit: number | null
          content: string
          created_at: string | null
          generation_time_seconds: number | null
          id: string
          metadata: Json | null
          platform: string | null
          project_id: string
          published_at: string | null
          status: string | null
          theme: string | null
          theme_id: string | null
          title: string | null
          type: string
          updated_at: string | null
          user_id: string
          was_truncated: boolean | null
          word_count: number | null
        }
        Insert: {
          ai_cost_usd?: number | null
          ai_model?: string | null
          block_number?: number | null
          character_count?: number | null
          character_count_limit?: number | null
          content: string
          created_at?: string | null
          generation_time_seconds?: number | null
          id?: string
          metadata?: Json | null
          platform?: string | null
          project_id: string
          published_at?: string | null
          status?: string | null
          theme?: string | null
          theme_id?: string | null
          title?: string | null
          type: string
          updated_at?: string | null
          user_id: string
          was_truncated?: boolean | null
          word_count?: number | null
        }
        Update: {
          ai_cost_usd?: number | null
          ai_model?: string | null
          block_number?: number | null
          character_count?: number | null
          character_count_limit?: number | null
          content?: string
          created_at?: string | null
          generation_time_seconds?: number | null
          id?: string
          metadata?: Json | null
          platform?: string | null
          project_id?: string
          published_at?: string | null
          status?: string | null
          theme?: string | null
          theme_id?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
          was_truncated?: boolean | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_content_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_cost_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          processing_hours_limit: number | null
          processing_hours_used: number | null
          stripe_customer_id: string | null
          subscription_plan: string | null
          subscription_status: string | null
          updated_at: string | null
          username: string | null
          welcome_credits_granted_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          processing_hours_limit?: number | null
          processing_hours_used?: number | null
          stripe_customer_id?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          username?: string | null
          welcome_credits_granted_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          processing_hours_limit?: number | null
          processing_hours_used?: number | null
          stripe_customer_id?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          username?: string | null
          welcome_credits_granted_at?: string | null
        }
        Relationships: []
      }
      project_generation_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          custom_guidance: string | null
          error_message: string | null
          failure_notified_at: string | null
          id: string
          kind: string
          project_id: string
          started_at: string | null
          status: string
          target_key: string
          theme_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          custom_guidance?: string | null
          error_message?: string | null
          failure_notified_at?: string | null
          id?: string
          kind: string
          project_id: string
          started_at?: string | null
          status?: string
          target_key: string
          theme_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          custom_guidance?: string | null
          error_message?: string | null
          failure_notified_at?: string | null
          id?: string
          kind?: string
          project_id?: string
          started_at?: string | null
          status?: string
          target_key?: string
          theme_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_generation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_content_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_generation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_cost_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_generation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_generation_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_processing_cost: number | null
          ai_summary: string | null
          audio_deleted_at: string | null
          audio_duration: number | null
          audio_duration_seconds: number | null
          audio_expires_at: string | null
          audio_file_name: string | null
          audio_file_size: number | null
          audio_fingerprint: string | null
          chapters: Json | null
          cost_breakdown: Json | null
          created_at: string | null
          description: string | null
          estimated_cost: number | null
          id: string
          insights_cost_usd: number | null
          insights_processed_at: string | null
          key_takeaways: Json | null
          metadata: Json
          performance_level: string | null
          preset_speakers: Json | null
          processing_completed_at: string | null
          processing_message: string | null
          processing_progress: number | null
          processing_stage: string | null
          processing_started_at: string | null
          processing_time_seconds: number | null
          project_type: string | null
          selected_content_types: string[] | null
          social_quotes: Json | null
          speaker_data: Json | null
          speaker_keywords: Json | null
          stage_started_at: string | null
          status: string | null
          title: string
          transcription_segments: Json | null
          transcription_text: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          actual_processing_cost?: number | null
          ai_summary?: string | null
          audio_deleted_at?: string | null
          audio_duration?: number | null
          audio_duration_seconds?: number | null
          audio_expires_at?: string | null
          audio_file_name?: string | null
          audio_file_size?: number | null
          audio_fingerprint?: string | null
          chapters?: Json | null
          cost_breakdown?: Json | null
          created_at?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          insights_cost_usd?: number | null
          insights_processed_at?: string | null
          key_takeaways?: Json | null
          metadata?: Json
          performance_level?: string | null
          preset_speakers?: Json | null
          processing_completed_at?: string | null
          processing_message?: string | null
          processing_progress?: number | null
          processing_stage?: string | null
          processing_started_at?: string | null
          processing_time_seconds?: number | null
          project_type?: string | null
          selected_content_types?: string[] | null
          social_quotes?: Json | null
          speaker_data?: Json | null
          speaker_keywords?: Json | null
          stage_started_at?: string | null
          status?: string | null
          title: string
          transcription_segments?: Json | null
          transcription_text?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          actual_processing_cost?: number | null
          ai_summary?: string | null
          audio_deleted_at?: string | null
          audio_duration?: number | null
          audio_duration_seconds?: number | null
          audio_expires_at?: string | null
          audio_file_name?: string | null
          audio_file_size?: number | null
          audio_fingerprint?: string | null
          chapters?: Json | null
          cost_breakdown?: Json | null
          created_at?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          insights_cost_usd?: number | null
          insights_processed_at?: string | null
          key_takeaways?: Json | null
          metadata?: Json
          performance_level?: string | null
          preset_speakers?: Json | null
          processing_completed_at?: string | null
          processing_message?: string | null
          processing_progress?: number | null
          processing_stage?: string | null
          processing_started_at?: string | null
          processing_time_seconds?: number | null
          project_type?: string | null
          selected_content_types?: string[] | null
          social_quotes?: Json | null
          speaker_data?: Json | null
          speaker_keywords?: Json | null
          stage_started_at?: string | null
          status?: string | null
          title?: string
          transcription_segments?: Json | null
          transcription_text?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transcription_cache: {
        Row: {
          created_at: string | null
          duration: number | null
          fingerprint: string
          reference_count: number
          speaker_data: Json | null
          transcription_segments: Json | null
          transcription_text: string
        }
        Insert: {
          created_at?: string | null
          duration?: number | null
          fingerprint: string
          reference_count?: number
          speaker_data?: Json | null
          transcription_segments?: Json | null
          transcription_text: string
        }
        Update: {
          created_at?: string | null
          duration?: number | null
          fingerprint?: string
          reference_count?: number
          speaker_data?: Json | null
          transcription_segments?: Json | null
          transcription_text?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          billed_cost: number
          created_at: string
          debit_transaction_id: string | null
          id: string
          margin_percent: number
          metadata: Json | null
          processed_at: string | null
          project_id: string | null
          project_title: string | null
          provider: string
          raw_cost: number
          reservation_id: string | null
          service_key: string
          service_name: string
          status: string | null
          unit_type: string
          units: number
          user_id: string | null
          workflow_step: string | null
        }
        Insert: {
          billed_cost: number
          created_at?: string
          debit_transaction_id?: string | null
          id?: string
          margin_percent?: number
          metadata?: Json | null
          processed_at?: string | null
          project_id?: string | null
          project_title?: string | null
          provider: string
          raw_cost: number
          reservation_id?: string | null
          service_key: string
          service_name: string
          status?: string | null
          unit_type: string
          units: number
          user_id?: string | null
          workflow_step?: string | null
        }
        Update: {
          billed_cost?: number
          created_at?: string
          debit_transaction_id?: string | null
          id?: string
          margin_percent?: number
          metadata?: Json | null
          processed_at?: string | null
          project_id?: string | null
          project_title?: string | null
          provider?: string
          raw_cost?: number
          reservation_id?: string | null
          service_key?: string
          service_name?: string
          status?: string | null
          unit_type?: string
          units?: number
          user_id?: string | null
          workflow_step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_content_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_cost_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "billing_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      project_content_analytics: {
        Row: {
          actual_processing_cost: number | null
          audio_duration_seconds: number | null
          chapter_count: number | null
          created_at: string | null
          has_chapters: boolean | null
          has_quotes: boolean | null
          has_summary: boolean | null
          has_takeaways: boolean | null
          has_transcription: boolean | null
          id: string | null
          performance_level: string | null
          quote_count: number | null
          speaker_count: number | null
          summary_word_count: number | null
          takeaway_count: number | null
          title: string | null
        }
        Insert: {
          actual_processing_cost?: number | null
          audio_duration_seconds?: number | null
          chapter_count?: never
          created_at?: string | null
          has_chapters?: never
          has_quotes?: never
          has_summary?: never
          has_takeaways?: never
          has_transcription?: never
          id?: string | null
          performance_level?: string | null
          quote_count?: never
          speaker_count?: never
          summary_word_count?: never
          takeaway_count?: never
          title?: string | null
        }
        Update: {
          actual_processing_cost?: number | null
          audio_duration_seconds?: number | null
          chapter_count?: never
          created_at?: string | null
          has_chapters?: never
          has_quotes?: never
          has_summary?: never
          has_takeaways?: never
          has_transcription?: never
          id?: string | null
          performance_level?: string | null
          quote_count?: never
          speaker_count?: never
          summary_word_count?: never
          takeaway_count?: never
          title?: string | null
        }
        Relationships: []
      }
      project_cost_analytics: {
        Row: {
          actual_processing_cost: number | null
          ai_processing_cost: number | null
          audio_duration_seconds: number | null
          cost_breakdown: Json | null
          cost_variance_percent: number | null
          created_at: string | null
          diarization_cost: number | null
          estimated_cost: number | null
          generation_cost: number | null
          id: string | null
          performance_level: string | null
          title: string | null
          transcription_cost: number | null
        }
        Insert: {
          actual_processing_cost?: number | null
          ai_processing_cost?: never
          audio_duration_seconds?: number | null
          cost_breakdown?: Json | null
          cost_variance_percent?: never
          created_at?: string | null
          diarization_cost?: never
          estimated_cost?: number | null
          generation_cost?: never
          id?: string | null
          performance_level?: string | null
          title?: string | null
          transcription_cost?: never
        }
        Update: {
          actual_processing_cost?: number | null
          ai_processing_cost?: never
          audio_duration_seconds?: number | null
          cost_breakdown?: Json | null
          cost_variance_percent?: never
          created_at?: string | null
          diarization_cost?: never
          estimated_cost?: number | null
          generation_cost?: never
          id?: string | null
          performance_level?: string | null
          title?: string | null
          transcription_cost?: never
        }
        Relationships: []
      }
      user_credit_summary: {
        Row: {
          current_balance: number | null
          last_activity: string | null
          lifetime_credits_added: number | null
          lifetime_credits_spent: number | null
          projects_with_usage: number | null
          total_billed_this_period: number | null
          total_usage_events: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_user_credits: {
        Args: {
          p_amount: number
          p_transaction_type?: string
          p_user_id: string
        }
        Returns: {
          new_balance: number
          new_version: number
          success: boolean
        }[]
      }
      debit_user_credits: {
        Args: { p_amount: number; p_current_version: number; p_user_id: string }
        Returns: {
          error_message: string
          new_balance: number
          new_version: number
          success: boolean
        }[]
      }
      grant_signup_bonus: {
        Args: { p_amount: number; p_reason?: string; p_user_id: string }
        Returns: {
          granted: boolean
          new_balance: number
          transaction_id: string
        }[]
      }
      release_reserved_credits: {
        Args: { p_amount: number; p_current_version: number; p_user_id: string }
        Returns: {
          error_message: string
          new_balance: number
          new_version: number
          success: boolean
        }[]
      }
      reserve_user_credits: {
        Args: { p_amount: number; p_current_version: number; p_user_id: string }
        Returns: {
          error_message: string
          new_balance: number
          new_version: number
          success: boolean
        }[]
      }
      settle_reserved_credits: {
        Args: { p_amount: number; p_current_version: number; p_user_id: string }
        Returns: {
          error_message: string
          new_balance: number
          new_version: number
          success: boolean
        }[]
      }
    }
    Enums: {
      insight_category: "person" | "concept" | "tool"
      insight_status: "auto_detected" | "user_highlight" | "refreshing"
      output_type:
        | "blog_post"
        | "social_post"
        | "email_newsletter"
        | "audiogram_clip"
        | "quote_graphic"
        | "show_notes"
        | "twitter_thread"
        | "linkedin_post"
        | "instagram_caption"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      insight_category: ["person", "concept", "tool"],
      insight_status: ["auto_detected", "user_highlight", "refreshing"],
      output_type: [
        "blog_post",
        "social_post",
        "email_newsletter",
        "audiogram_clip",
        "quote_graphic",
        "show_notes",
        "twitter_thread",
        "linkedin_post",
        "instagram_caption",
      ],
    },
  },
} as const

type AnyFn = (...args: any[]) => any

const hasJestRuntime = () =>
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as { jest?: { fn: (impl?: AnyFn) => AnyFn } }).jest !== 'undefined'

const createMockFunction = (impl?: AnyFn): AnyFn => {
  if (hasJestRuntime()) {
    return (globalThis as { jest: { fn: (impl?: AnyFn) => AnyFn } }).jest.fn(impl)
  }
  if (impl) {
    return impl
  }
  return () => undefined
}

const createMockQueryBuilder = () => {
  const builder: Record<string, AnyFn> = {}
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
  ]

  chainableMethods.forEach((method) => {
    builder[method] = createMockFunction(() => builder)
  })

  builder.single = createMockFunction(async () => ({ data: null, error: null }))
  builder.maybeSingle = createMockFunction(async () => ({ data: null, error: null }))
  builder.then = undefined as unknown as AnyFn

  return builder
}

const createMockStorageBucket = () => ({
  upload: createMockFunction(async () => ({ data: null, error: null })),
  remove: createMockFunction(async () => ({ data: null, error: null })),
  list: createMockFunction(async () => ({ data: [], error: null })),
  download: createMockFunction(async () => ({ data: null, error: null })),
  getPublicUrl: createMockFunction(() => ({ data: { publicUrl: '' }, error: null })),
})

export const createMockSupabaseClient = (): SupabaseClient<any> => {
  const authResponse = async () => ({ data: { user: null, session: null }, error: null })
  const sessionResponse = async () => ({ data: { session: null }, error: null })

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
      reauthenticate: createMockFunction(authResponse),
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
  } as unknown as SupabaseClient<any>
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const isTestEnv = process.env.NODE_ENV === 'test'

const SUPABASE_STORAGE_KEYS = [
  'supabase.auth.token',
  'supabase.auth.token-code-verifier',
  'supabase.auth.token-user',
] as const

const base64UrlToBytes = (value: string): Uint8Array => {
  if (typeof window === 'undefined') return new Uint8Array()

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
  if (typeof document === 'undefined') return
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

export const supabase: SupabaseClient<Database> = isTestEnv
  ? (createMockSupabaseClient() as SupabaseClient<Database>)
  : createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
      },
    })
