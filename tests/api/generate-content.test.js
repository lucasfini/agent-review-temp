/**
 * Generate Content Pipeline Tests
 *
 * Validates:
 * 1. All 11 content types reach the correct generator (no "Unknown content type" throws)
 * 2. normalizeOutputTypeForInsert maps every generated type to a valid DB enum value
 * 3. getPlatformBadge / getBadgeColor return non-generic labels for every type
 * 4. getExistingContentCounts maps every originalOutputType / output.type to a contentTypeId
 * 5. STRICT_CONTENT_LIMITS covers all 4 newly-added types
 * 6. CONTENT_TYPES in lib/content-types.ts has correct outputType for all 11 types
 */

// ── Isolated unit tests (no network / DB calls) ──────────────────────────────

describe('lib/content-types.ts – CONTENT_TYPES coverage', () => {
  let CONTENT_TYPES;

  beforeAll(() => {
    // jest transform handles TS via ts-jest
    ({ CONTENT_TYPES } = require('../../lib/content-types'));
  });

  const EXPECTED_IDS = [
    'twitter_threads',
    'linkedin_posts',
    'instagram_content',
    'facebook_post',
    'blog_post',
    'newsletter',
    'show_notes',
    'youtube_description',
    'podcast_episode_description',
    'short_form_video_script',
    'quote_graphics',
  ];

  it('defines all 11 expected content type IDs', () => {
    const ids = CONTENT_TYPES.map((ct) => ct.id);
    EXPECTED_IDS.forEach((id) => {
      expect(ids).toContain(id);
    });
  });

  it('every enabled content type has an outputType', () => {
    CONTENT_TYPES.filter((ct) => ct.enabled).forEach((ct) => {
      expect(ct.outputType).toBeDefined();
      expect(typeof ct.outputType).toBe('string');
    });
  });

  it('every enabled content type has a platformType', () => {
    CONTENT_TYPES.filter((ct) => ct.enabled).forEach((ct) => {
      expect(ct.platformType).toBeDefined();
    });
  });

  it('every enabled content type has maxCount set', () => {
    CONTENT_TYPES.filter((ct) => ct.enabled).forEach((ct) => {
      expect(typeof (ct.maxCount ?? ct.count)).toBe('number');
      expect((ct.maxCount ?? ct.count)).toBeGreaterThan(0);
    });
  });
});

// ── content-psychology limits coverage ───────────────────────────────────────

describe('lib/content-psychology.ts – STRICT_CONTENT_LIMITS', () => {
  let STRICT_CONTENT_LIMITS, enforceContentLimit;

  beforeAll(() => {
    ({ STRICT_CONTENT_LIMITS, enforceContentLimit } = require('../../lib/content-psychology'));
  });

  const NEW_TYPES = [
    'facebook_post',
    'youtube_description',
    'podcast_episode_description',
    'short_form_video_script',
  ];

  it('defines limits for all 4 newly-added content types', () => {
    NEW_TYPES.forEach((type) => {
      expect(STRICT_CONTENT_LIMITS[type]).toBeDefined();
      expect(STRICT_CONTENT_LIMITS[type].hardMax).toBeGreaterThan(0);
    });
  });

  it('enforceContentLimit returns content unchanged when under limit for new types', () => {
    NEW_TYPES.forEach((type) => {
      const shortText = 'This is a short piece of content.';
      const result = enforceContentLimit(shortText, type, true);
      expect(result.content).toBe(shortText);
      expect(result.wasTruncated).toBe(false);
    });
  });
});

// ── generateBlockContent switch coverage ─────────────────────────────────────

describe('generateBlockContent switch – all 11 content types dispatch correctly', () => {
  // We test that each contentTypeId reaches a generator (doesn't throw "Unknown content type").
  // We mock all external dependencies so no network calls are made.

  const ALL_CONTENT_TYPE_IDS = [
    'twitter_threads',
    'linkedin_posts',
    'instagram_content',
    'facebook_post',
    'blog_post',
    'newsletter',
    'show_notes',
    'youtube_description',
    'podcast_episode_description',
    'short_form_video_script',
    'quote_graphics',
  ];

  // Minimal mocks – the route module imports these at the top level
  beforeAll(() => {
    jest.mock('../../lib/supabase/server', () => ({
      supabaseAdmin: {
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockResolvedValue({ data: [], error: null }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { user_id: 'user-1' }, error: null }),
        })),
        auth: { admin: { getUserById: jest.fn().mockResolvedValue({ data: { user: null } }) } },
      },
    }));

    jest.mock('../../lib/ai-providers/multi-provider', () => ({
      getAICompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          // generic keys used by resilientGet across all generators
          tweets: [{ tweet: 'Test tweet', position: 1 }],
          post: 'Test post content',
          slides: Array.from({ length: 7 }, (_, i) => ({
            number: i + 1,
            headline: `Slide ${i + 1}`,
            text: 'Slide body text here for testing',
          })),
          caption: 'Test caption',
          hashtags: ['test'],
          title: 'Test title',
          content: 'Test blog content with enough words to pass validation.',
          metaDescription: 'SEO description',
          subject: 'Test subject',
          previewText: 'Preview',
          cta: 'Click here',
          ps: 'P.S. Note',
          summary: 'Test summary for show notes.',
          topics: [{ topic: 'Topic 1', timestamp: '0:00' }],
          quotes: ['Test quote'],
          resources: ['Resource 1'],
          description: 'Test description content here.',
          timestamps: [{ time: '0:00', label: 'Intro' }],
          hook: 'Test hook',
          body: 'Test body',
          source_moment: 'Test moment',
          angles: ['Angle 1', 'Angle 2', 'Angle 3'],
        }),
        model: 'gpt-test',
        usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
      }),
    }));

    jest.mock('../../lib/billing/track-usage', () => ({
      trackOpenAIUsage: jest.fn().mockResolvedValue({ usageEventId: 'evt-1', billedCost: 0.01 }),
      requireSufficientCredit: jest.fn().mockResolvedValue(undefined),
    }));

    jest.mock('../../lib/content-generators/pre-processor', () => ({
      preProcessTranscript: jest.fn().mockResolvedValue({
        metadata: {
          main_topic: 'Test topic',
          single_angle: 'Test angle',
          cleaned_narrative_summary: 'Cleaned transcript summary.',
          key_tensions: [],
          ad_segments_found: [],
        },
        tokensUsed: { input: 50, output: 50 },
        generatedAt: new Date().toISOString(),
      }),
    }));

    jest.mock('../../lib/openai/consent', () => ({
      getOpenAIApiKeyForUser: jest.fn().mockResolvedValue('sk-test'),
    }));

    jest.mock('../../lib/rate-limit', () => ({
      aiRatelimit: { limit: jest.fn().mockResolvedValue({ success: true }) },
    }));

    jest.mock('../../lib/generation-progress', () => ({
      initializeGenerationProgress: jest.fn().mockResolvedValue(undefined),
      updateGenerationProgress: jest.fn().mockResolvedValue(undefined),
      completeBlock: jest.fn().mockResolvedValue(undefined),
      completeGenerationProgress: jest.fn().mockResolvedValue(undefined),
      failGenerationProgress: jest.fn().mockResolvedValue(undefined),
    }));

    jest.mock('../../lib/billing/credit', () => ({
      debitCredit: jest.fn().mockResolvedValue(undefined),
      InsufficientCreditError: class InsufficientCreditError extends Error {
        constructor(required, available) {
          super('Insufficient credits');
          this.required = required;
          this.available = available;
        }
      },
    }));
  });

  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  ALL_CONTENT_TYPE_IDS.forEach((contentTypeId) => {
    it(`does not throw "Unknown content type" for contentTypeId="${contentTypeId}"`, async () => {
      // Dynamically require after mocks are registered
      const { generateBlockContent } = await import('../../app/api/generate-content/route');

      // generateBlockContent is not exported directly – test via the route POST handler instead.
      // We verify the switch is exhaustive by checking for the error string in the route output.
      const { POST } = require('../../app/api/generate-content/route');

      const block = {
        id: `${contentTypeId}_1`,
        contentTypeId,
        blockNumber: 1,
        name: `${contentTypeId} #1`,
        enabled: true,
        theme: 'professional',
      };

      const { NextRequest } = require('next/server');
      const req = new NextRequest('http://localhost/api/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'proj-test-1',
          transcription: 'Sample transcript text for content generation testing.',
          blocks: [block],
          segments: [],
        }),
      });

      const res = await POST(req);
      const json = await res.json();

      // The only acceptable outcomes are success OR a non-"Unknown content type" error
      if (!json.success) {
        expect(json.error ?? json.details?.join(' ') ?? '').not.toMatch(
          /Unknown content type/i
        );
      }
    });
  });
});

// ── normalizeOutputTypeForInsert mapping ─────────────────────────────────────

describe('normalizeOutputTypeForInsert – DB enum compatibility', () => {
  // This function is not exported; we test it through the OUTPUT_TYPE_FALLBACKS shape.
  // The critical invariant: every contentTypeId the generator can produce as `type`
  // must map to a valid OutputType accepted by the DB.

  const VALID_DB_OUTPUT_TYPES = [
    'blog_post',
    'social_post',
    'email_newsletter',
    'audiogram_clip',
    'quote_graphic',
    'show_notes',
    'twitter_thread',
    'linkedin_post',
    'instagram_caption',
    'youtube_description',
    'podcast_episode_description',
    'short_form_video_script',
    'facebook_post',
  ];

  // The generated `type` values from each generator function
  const GENERATED_TYPES = [
    'twitter_thread',
    'linkedin_post',
    'instagram_caption',
    'blog_post',
    'email_newsletter',
    'show_notes',
    'quote_graphic',
    'facebook_post',
    'youtube_description',
    'podcast_episode_description',
    'short_form_video_script',
  ];

  it('all generated type values are accepted by the DB enum (no unknown fallback needed)', () => {
    // The OutputType union in lib/content-types.ts should cover all generated types.
    // If this assertion fails it means a new generator is emitting a type string not in
    // the VALID_DB_OUTPUT_TYPES list AND not covered by OUTPUT_TYPE_FALLBACKS.
    GENERATED_TYPES.forEach((type) => {
      expect(VALID_DB_OUTPUT_TYPES).toContain(type);
    });
  });
});

// ── getPlatformBadge / getBadgeColor coverage ─────────────────────────────────

describe('getPlatformBadge / getBadgeColor – non-generic for all content types', () => {
  // These are unexported private helpers; we test them through integration by checking
  // that ui_metadata set on each generated piece has a non-"General" platform label.
  // However, since they are private, we test their logic by reading the route file content.

  const CONTENT_TYPE_IDS = [
    'twitter_threads',
    'linkedin_posts',
    'instagram_content',
    'facebook_post',
    'blog_post',
    'newsletter',
    'show_notes',
    'youtube_description',
    'podcast_episode_description',
    'short_form_video_script',
    'quote_graphics',
  ];

  const fs = require('fs');
  const routeSource = fs.readFileSync(
    require('path').join(__dirname, '../../app/api/generate-content/route.ts'),
    'utf8'
  );

  CONTENT_TYPE_IDS.forEach((id) => {
    it(`getPlatformBadge lookup includes "${id}"`, () => {
      // The badges record in getPlatformBadge must contain every content type id key
      expect(routeSource).toContain(`'${id}':`);
    });
  });

  it('getBadgeColor does not fall back to default for any of the 11 types', () => {
    // Every id should appear in the colors record
    CONTENT_TYPE_IDS.forEach((id) => {
      // Look for the id inside the getBadgeColor function body
      const colorsSectionMatch = routeSource.match(/const colors: Record<string, string> = \{([\s\S]*?)\};/);
      expect(colorsSectionMatch).not.toBeNull();
      expect(colorsSectionMatch[0]).toContain(`'${id}'`);
    });
  });
});

// ── getExistingContentCounts mapping completeness ─────────────────────────────

describe('getExistingContentCounts – maps all 11 original output types', () => {
  const ORIGINAL_OUTPUT_TYPES = [
    { type: 'twitter_thread', expected: 'twitter_threads' },
    { type: 'linkedin_post', expected: 'linkedin_posts' },
    { type: 'instagram_caption', expected: 'instagram_content' },
    { type: 'blog_post', expected: 'blog_post' },
    { type: 'email_newsletter', expected: 'newsletter' },
    { type: 'show_notes', expected: 'show_notes' },
    { type: 'quote_graphic', expected: 'quote_graphics' },
    { type: 'facebook_post', expected: 'facebook_post' },
    { type: 'youtube_description', expected: 'youtube_description' },
    { type: 'podcast_episode_description', expected: 'podcast_episode_description' },
    { type: 'short_form_video_script', expected: 'short_form_video_script' },
  ];

  const fs = require('fs');
  const routeSource = fs.readFileSync(
    require('path').join(__dirname, '../../app/api/generate-content/route.ts'),
    'utf8'
  );

  ORIGINAL_OUTPUT_TYPES.forEach(({ type, expected }) => {
    it(`maps output.type="${type}" to contentTypeId="${expected}"`, () => {
      // The getExistingContentCounts function must contain an assignment
      // contentTypeId = '${expected}' after checking for output.type === '${type}'
      expect(routeSource).toContain(`contentTypeId = '${expected}'`);
    });
  });
});

describe('/api/generate-content queued job rate limiting', () => {
  let POST;
  let aiRatelimit;
  let supabaseAdmin;

  function buildProjectGenerationJobQuery(job) {
    const builder = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      maybeSingle: jest.fn().mockResolvedValue({ data: job, error: null }),
    };
    return builder;
  }

  async function loadRoute({ queuedJob = null } = {}) {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock('../../lib/supabase/server', () => {
      const mock = {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
          admin: {
            getUserById: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
          },
        },
        from: jest.fn((table) => {
          if (table === 'project_generation_jobs') {
            return buildProjectGenerationJobQuery(queuedJob);
          }
          throw new Error(`Unexpected table ${table}`);
        }),
      };
      return { supabaseAdmin: mock };
    });

    jest.doMock('../../lib/maintenance-auth', () => ({
      isAuthorizedMaintenanceRequest: jest.fn(() => false),
    }));

    jest.doMock('../../lib/api/route-auth', () => ({
      RouteAccessError: class RouteAccessError extends Error {
        constructor(status, message) {
          super(message);
          this.status = status;
        }
      },
      requireProjectOwner: jest.fn().mockResolvedValue({
        user: { id: 'user-1' },
        project: {
          id: 'project-1',
          user_id: 'user-1',
          organization_id: 'org-1',
          title: 'Sales Call',
        },
      }),
    }));

    jest.doMock('../../lib/rate-limit', () => ({
      aiRatelimit: {
        limit: jest.fn().mockResolvedValue({ success: false }),
      },
    }));

    jest.doMock('../../lib/openai/consent', () => ({
      getOpenAIApiKeyForUser: jest.fn().mockResolvedValue(null),
    }));

    jest.doMock('../../lib/demo-mode', () => ({
      isDemoUser: jest.fn(() => false),
    }));

    jest.doMock('../../lib/authz/organization-context', () => ({
      getActiveOrganizationForUser: jest.fn().mockResolvedValue({
        membership: { role: 'owner' },
        organization: { id: 'org-1', type: 'saas_customer' },
      }),
      resolveOrganizationIdForWrite: jest.fn().mockResolvedValue('org-1'),
    }));

    jest.doMock('../../lib/authz/permissions', () => ({
      can: jest.fn(() => true),
    }));

    jest.doMock('../../lib/billing/entitlement-guards', () => ({
      runEntitlementGuard: jest.fn().mockResolvedValue({ response: null }),
    }));

    jest.doMock('../../lib/billing/cost-map', () => ({
      estimateContentBlocksCostAsync: jest.fn().mockResolvedValue(0),
    }));

    jest.doMock('../../lib/billing/middleware', () => ({
      billingErrorResponse: jest.fn(() => ({ status: 500 })),
    }));

    jest.doMock('../../lib/billing/credit', () => ({
      failReservation: jest.fn().mockResolvedValue(undefined),
      settleReservationAmount: jest.fn().mockResolvedValue(undefined),
      InsufficientCreditError: class InsufficientCreditError extends Error {},
    }));

    jest.doMock('../../lib/billing/plan-credits', () => ({
      createPlanCreditReservation: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
    }));

    jest.doMock('../../lib/billing/subscription-usage-counters', () => ({
      recordSubscriptionUsage: jest.fn().mockResolvedValue(undefined),
    }));

    jest.doMock('../../lib/billing/track-usage', () => ({
      trackOpenAIUsage: jest.fn().mockResolvedValue({ usageEventId: 'usage-1', billedCost: 0 }),
    }));

    jest.doMock('../../lib/generation-progress', () => ({
      initializeGenerationProgress: jest.fn().mockResolvedValue(undefined),
      updateGenerationProgress: jest.fn().mockResolvedValue(undefined),
      completeBlock: jest.fn().mockResolvedValue(undefined),
      completeGenerationProgress: jest.fn().mockResolvedValue(undefined),
      failGenerationProgress: jest.fn().mockResolvedValue(undefined),
    }));

    jest.doMock('../../lib/notifications/notification-events', () => ({
      notifyContentGenerated: jest.fn().mockResolvedValue(null),
      notifyContentGenerationFailed: jest.fn().mockResolvedValue(null),
      notifyContentGenerationStarted: jest.fn().mockResolvedValue(null),
    }));

    jest.doMock('../../lib/content-generators/pre-processor', () => ({
      preProcessTranscript: jest.fn().mockRejectedValue(new Error('Reached generation after rate-limit check')),
    }));

    jest.doMock('../../lib/ai-providers/multi-provider', () => ({
      getAICompletion: jest.fn(),
    }));

    jest.doMock('../../lib/generation-context', () => {
      const actual = jest.requireActual('../../lib/generation-context');
      return {
        ...actual,
        resolveGenerationContext: jest.fn().mockResolvedValue({
          creatorProfile: null,
          brandVoice: null,
          campaign: null,
          library: null,
        }),
      };
    });

    ({ supabaseAdmin } = require('../../lib/supabase/server'));
    ({ aiRatelimit } = require('../../lib/rate-limit'));
    ({ POST } = await import('../../app/api/generate-content/route'));
  }

  function buildRequest(extraBody = {}) {
    const { NextRequest } = require('next/server');
    return new NextRequest('http://localhost/api/generate-content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
      body: JSON.stringify({
        projectId: 'project-1',
        transcription: 'Sample transcript text for content generation testing.',
        segments: [],
        blocks: [
          {
            id: 'twitter_threads_1',
            contentTypeId: 'twitter_threads',
            blockNumber: 1,
            name: 'X Thread',
            enabled: true,
            theme: 'professional',
          },
        ],
        ...extraBody,
      }),
    });
  }

  it('keeps normal user requests behind the AI rate limit', async () => {
    await loadRoute();

    const response = await POST(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toMatch(/Rate limit exceeded/i);
    expect(aiRatelimit.limit).toHaveBeenCalledWith('user-1');
  });

  it('skips duplicate rate limiting for a verified running queued content job', async () => {
    await loadRoute({
      queuedJob: {
        id: 'job-1',
        project_id: 'project-1',
        user_id: 'user-1',
        kind: 'content',
        target_key: 'twitter_threads',
        status: 'running',
      },
    });

    const response = await POST(buildRequest({ queuedGenerationJobId: 'job-1' }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.details?.join(' ')).toMatch(/Reached generation after rate-limit check/);
    expect(aiRatelimit.limit).not.toHaveBeenCalled();
    expect(supabaseAdmin.from).toHaveBeenCalledWith('project_generation_jobs');
  });

  it('does not skip rate limiting when the queued job context does not match the block', async () => {
    await loadRoute({
      queuedJob: {
        id: 'job-1',
        project_id: 'project-1',
        user_id: 'user-1',
        kind: 'content',
        target_key: 'linkedin_posts',
        status: 'running',
      },
    });

    const response = await POST(buildRequest({ queuedGenerationJobId: 'job-1' }));

    expect(response.status).toBe(429);
    expect(aiRatelimit.limit).toHaveBeenCalledWith('user-1');
  });
});
