/**
 * Strict JSON Content Engine API
 *
 * POST /api/strict-json-content
 *
 * Generates 4 structured content assets from a transcript:
 * - Show Notes
 * - Email Newsletter
 * - Blog Post
 * - Quote Graphic
 *
 * All outputs follow strict JSON schema with ui_metadata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RouteAccessError, requireAuthenticatedUser, requireProjectOwner } from '@/lib/api/route-auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  generateStrictJSONContent,
  generateShowNotes,
  generateEmailNewsletter,
  generateBlogPost,
  generateQuoteGraphic,
  detectAdContent,
  StrictJSONEngineInput,
  StrictJSONEngineOutput
} from '@/lib/strict-json-content-engine';

interface RequestBody {
  // Required
  theme_name: string;
  angle: string;
  cleaned_narrative_summary: string;

  // Optional
  transcript?: string;
  speaker_data?: Record<string, { name: string; role?: string }>;
  project_id?: string;
  // Deprecated: ignored for security; server-side auth user is always used.
  user_id?: string;

  // Selective generation
  content_types?: Array<'show_notes' | 'email_newsletter' | 'blog_post' | 'quote_graphic'>;
}

export async function POST(request: NextRequest) {
  console.log('[STRICT-JSON-API] 📥 Received request');

  try {
    const body: RequestBody = await request.json();
    let authenticatedUserId: string;
    let authorizedProjectId: string | undefined;

    try {
      if (body.project_id) {
        const { user } = await requireProjectOwner(request, body.project_id, 'id');
        authenticatedUserId = user.id;
        authorizedProjectId = body.project_id;
      } else {
        const user = await requireAuthenticatedUser(request);
        authenticatedUserId = user.id;
      }
    } catch (authError) {
      if (authError instanceof RouteAccessError) {
        return NextResponse.json({ error: authError.message }, { status: authError.status });
      }
      throw authError;
    }

    // Validate required fields
    if (!body.theme_name) {
      return NextResponse.json(
        { error: 'theme_name is required' },
        { status: 400 }
      );
    }

    if (!body.angle) {
      return NextResponse.json(
        { error: 'angle is required' },
        { status: 400 }
      );
    }

    if (!body.cleaned_narrative_summary) {
      return NextResponse.json(
        { error: 'cleaned_narrative_summary is required' },
        { status: 400 }
      );
    }

    // Check for ad content in summary
    const adCheck = detectAdContent(body.cleaned_narrative_summary);
    if (adCheck.hasAds) {
      console.log(`[STRICT-JSON-API] ⚠️ Ad content detected: ${adCheck.flaggedTerms.join(', ')}`);
    }

    const input: StrictJSONEngineInput = {
      theme_name: body.theme_name,
      angle: body.angle,
      cleaned_narrative_summary: body.cleaned_narrative_summary,
      transcript: body.transcript,
      speaker_data: body.speaker_data,
      userId: authenticatedUserId,
      projectId: authorizedProjectId,
    };

    let result: Partial<StrictJSONEngineOutput>;

    // Check if selective generation requested
    if (body.content_types && body.content_types.length > 0) {
      console.log(`[STRICT-JSON-API] 🎯 Selective generation: ${body.content_types.join(', ')}`);

      result = {
        tokens_used: { input: 0, output: 0 },
        generated_at: new Date().toISOString()
      };

      // Generate only requested types
      for (const contentType of body.content_types) {
        switch (contentType) {
          case 'show_notes':
            result.show_notes = await generateShowNotes(input);
            break;
          case 'email_newsletter':
            result.email_newsletter = await generateEmailNewsletter(input);
            break;
          case 'blog_post':
            result.blog_post = await generateBlogPost(input);
            break;
          case 'quote_graphic':
            if (!body.transcript) {
              console.warn('[STRICT-JSON-API] ⚠️ quote_graphic requires transcript for verbatim quotes');
            }
            result.quote_graphic = await generateQuoteGraphic({
              ...input,
              transcript: body.transcript || body.cleaned_narrative_summary
            });
            break;
        }
      }
    } else {
      // Generate all 4 content types
      console.log('[STRICT-JSON-API] 🚀 Generating all 4 content types');

      if (!body.transcript) {
        console.warn('[STRICT-JSON-API] ⚠️ No transcript provided - quote_graphic may not be verbatim');
      }

      result = await generateStrictJSONContent({
        ...input,
        transcript: body.transcript
      });
    }

    // Optionally save to database
    if (authorizedProjectId) {
      console.log(`[STRICT-JSON-API] 💾 Saving to database for project ${authorizedProjectId}`);

      const outputs = [];

      if (result.show_notes) {
        outputs.push({
          project_id: authorizedProjectId,
          user_id: authenticatedUserId,
          type: 'show_notes',
          platform: 'general',
          title: result.show_notes.content.title,
          content: result.show_notes.content.summary,
          metadata: {
            ui_metadata: result.show_notes.ui_metadata,
            timestamps: result.show_notes.content.timestamps,
            resources: result.show_notes.content.resources,
            theme: body.theme_name,
            angle: body.angle
          },
          status: 'generated'
        });
      }

      if (result.email_newsletter) {
        outputs.push({
          project_id: authorizedProjectId,
          user_id: authenticatedUserId,
          type: 'social_post', // Database doesn't allow 'email_newsletter'
          platform: 'general', // Database doesn't allow 'email'
          title: result.email_newsletter.content.subject_line,
          content: result.email_newsletter.content.body_sections.big_idea,
          metadata: {
            ui_metadata: result.email_newsletter.ui_metadata,
            originalOutputType: 'email_newsletter',
            subject_line: result.email_newsletter.content.subject_line,
            preview_text: result.email_newsletter.content.preview_text,
            body_sections: result.email_newsletter.content.body_sections,
            theme: body.theme_name,
            angle: body.angle
          },
          status: 'generated'
        });
      }

      if (result.blog_post) {
        outputs.push({
          project_id: authorizedProjectId,
          user_id: authenticatedUserId,
          type: 'blog_post',
          platform: 'general', // Database doesn't allow 'blog'
          title: result.blog_post.content.title,
          content: result.blog_post.content.markdown_body,
          metadata: {
            ui_metadata: result.blog_post.ui_metadata,
            theme: body.theme_name,
            angle: body.angle
          },
          status: 'generated'
        });
      }

      if (result.quote_graphic) {
        outputs.push({
          project_id: authorizedProjectId,
          user_id: authenticatedUserId,
          type: 'quote_graphic',
          platform: 'general',
          title: `Quote by ${result.quote_graphic.content.speaker_name}`,
          content: result.quote_graphic.content.quote_text,
          metadata: {
            ui_metadata: result.quote_graphic.ui_metadata,
            speaker_name: result.quote_graphic.content.speaker_name,
            theme: body.theme_name,
            angle: body.angle
          },
          status: 'generated'
        });
      }

      if (outputs.length > 0) {
        const { error } = await supabaseAdmin
          .from('outputs')
          .insert(outputs);

        if (error) {
          console.error('[STRICT-JSON-API] ❌ Database save failed:', error);
        } else {
          console.log(`[STRICT-JSON-API] ✅ Saved ${outputs.length} outputs to database`);
        }
      }
    }

    console.log('[STRICT-JSON-API] ✅ Request completed successfully');

    return NextResponse.json({
      success: true,
      data: result,
      ad_check: adCheck.hasAds ? {
        warning: 'Ad content detected and filtered',
        flagged_terms: adCheck.flaggedTerms
      } : null
    });

  } catch (error: any) {
    console.error('[STRICT-JSON-API] ❌ Error:', error);

    return NextResponse.json(
      {
        error: error.message || 'Internal server error',
        success: false
      },
      { status: 500 }
    );
  }
}

// GET endpoint for API documentation
export async function GET() {
  return NextResponse.json({
    name: 'Strict JSON Content Engine',
    version: '1.0.0',
    description: 'Generates structured JSON content with ui_metadata',
    endpoints: {
      POST: {
        description: 'Generate content assets',
        body: {
          required: {
            theme_name: 'string - Theme for content generation',
            angle: 'string - Single narrative angle to focus on',
            cleaned_narrative_summary: 'string - Ad-free summary of the content'
          },
          optional: {
            transcript: 'string - Full transcript (required for verbatim quotes)',
            speaker_data: 'object - Speaker name/role mapping',
            project_id: 'string - UUID to save outputs to database',
            content_types: 'array - Selective generation: ["show_notes", "email_newsletter", "blog_post", "quote_graphic"]'
          }
        },
        response: {
          success: true,
          data: {
            show_notes: '{ ui_metadata, content: { title, summary, timestamps, resources } }',
            email_newsletter: '{ ui_metadata, content: { subject_line, preview_text, body_sections } }',
            blog_post: '{ ui_metadata, content: { title, markdown_body } }',
            quote_graphic: '{ ui_metadata, content: { quote_text, speaker_name } }',
            tokens_used: '{ input, output }',
            generated_at: 'ISO timestamp'
          }
        }
      }
    },
    ui_metadata_schema: {
      platform_label: 'Display name (e.g., "Show Notes", "Email Newsletter")',
      theme_label: 'Theme name from input',
      badge_color: 'Hex color for UI badge'
    },
    badge_colors: {
      show_notes: '#6366F1',
      email_newsletter: '#EA4335',
      blog_post: '#4F46E5',
      quote_graphic: '#F59E0B'
    }
  });
}
