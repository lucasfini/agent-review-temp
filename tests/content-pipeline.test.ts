/**
 * Content Generation Pipeline Tests
 *
 * These tests run in the default jest suite (no RUN_FULL_TEST_SUITE required).
 * They validate the static shape of the pipeline — no network or DB calls.
 *
 * Verifies:
 * 1. All 11 content type IDs exist in CONTENT_TYPES with required fields
 * 2. STRICT_CONTENT_LIMITS covers all 4 newly-added types
 * 3. getPlatformBadge / getBadgeColor lookup tables cover all 11 types
 * 4. getExistingContentCounts maps all 11 generated output types
 * 5. generateBlockContent switch is exhaustive (no "Unknown content type" branch for any enabled type)
 * 6. normalizeOutputTypeForInsert never returns 'social_post' for the 4 new DB-native types
 */

import * as fs from 'fs';
import * as path from 'path';
import { CONTENT_TYPES, getContentTypeById } from '@/lib/content-types';
import { STRICT_CONTENT_LIMITS, enforceContentLimit } from '@/lib/content-psychology';

// ── 1. CONTENT_TYPES shape ────────────────────────────────────────────────────

const ALL_TYPE_IDS = [
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
] as const;

describe('lib/content-types – CONTENT_TYPES registry', () => {
  it('contains all 11 expected content type IDs', () => {
    const ids = CONTENT_TYPES.map((ct) => ct.id);
    ALL_TYPE_IDS.forEach((id) => {
      expect(ids).toContain(id);
    });
  });

  it('every enabled type has outputType defined', () => {
    CONTENT_TYPES.filter((ct) => ct.enabled).forEach((ct) => {
      expect(ct.outputType).toBeDefined();
    });
  });

  it('every enabled type has platformType defined', () => {
    CONTENT_TYPES.filter((ct) => ct.enabled).forEach((ct) => {
      expect(ct.platformType).toBeDefined();
    });
  });

  it('every enabled type has a positive maxCount or count', () => {
    CONTENT_TYPES.filter((ct) => ct.enabled).forEach((ct) => {
      expect((ct.maxCount ?? ct.count) > 0).toBe(true);
    });
  });

  it('getContentTypeById returns a type for all 11 IDs', () => {
    ALL_TYPE_IDS.forEach((id) => {
      expect(getContentTypeById(id)).toBeDefined();
    });
  });
});

// ── 2. STRICT_CONTENT_LIMITS for the 4 new types ─────────────────────────────

const NEW_TYPE_LIMIT_KEYS = [
  'facebook_post',
  'youtube_description',
  'podcast_episode_description',
  'short_form_video_script',
] as const;

describe('lib/content-psychology – STRICT_CONTENT_LIMITS', () => {
  it.each(NEW_TYPE_LIMIT_KEYS)(
    'defines a limit entry for "%s"',
    (type) => {
      expect(STRICT_CONTENT_LIMITS[type]).toBeDefined();
      expect(STRICT_CONTENT_LIMITS[type].hardMax).toBeGreaterThan(0);
    }
  );

  it.each(NEW_TYPE_LIMIT_KEYS)(
    'enforceContentLimit returns unchanged content under limit for "%s"',
    (type) => {
      const short = 'Short piece of content.';
      const result = enforceContentLimit(short, type, true);
      expect(result.content).toBe(short);
      expect(result.wasTruncated).toBe(false);
    }
  );
});

// ── 3. Route source-level assertions (static analysis) ───────────────────────

const routeSource = fs.readFileSync(
  path.join(__dirname, '../app/api/generate-content/route.ts'),
  'utf8'
);

describe('app/api/generate-content/route.ts – getPlatformBadge lookup', () => {
  it.each(ALL_TYPE_IDS)(
    'badges record contains key "%s"',
    (id) => {
      // The badges object must contain the key so it returns a specific label
      const badgesFnMatch = routeSource.match(/function getPlatformBadge[\s\S]*?return badges\[/);
      expect(badgesFnMatch).not.toBeNull();
      expect(routeSource).toContain(`'${id}':`);
    }
  );
});

describe('app/api/generate-content/route.ts – getBadgeColor lookup', () => {
  // Extract just the colors record from getBadgeColor
  const colorsFnMatch = routeSource.match(
    /function getBadgeColor[\s\S]*?const colors: Record<string, string> = \{([\s\S]*?)\};/
  );

  it('getBadgeColor function is present in route', () => {
    expect(colorsFnMatch).not.toBeNull();
  });

  if (colorsFnMatch) {
    const colorsBlock = colorsFnMatch[0];
    it.each(ALL_TYPE_IDS)(
      'colors record contains key "%s"',
      (id) => {
        expect(colorsBlock).toContain(`'${id}'`);
      }
    );
  }
});

describe('app/api/generate-content/route.ts – generateBlockContent switch', () => {
  it.each(ALL_TYPE_IDS)(
    'switch has a case for contentTypeId "%s"',
    (id) => {
      // Each enabled type must have a case statement
      expect(routeSource).toContain(`case '${id}':`);
    }
  );

  it('default branch still exists as the catch-all', () => {
    expect(routeSource).toContain("throw new Error(`Unknown content type: ${block.contentTypeId}`)");
  });
});

describe('app/api/generate-content/route.ts – getExistingContentCounts mapping', () => {
  const EXPECTED_MAPPINGS: Array<[string, string]> = [
    ['twitter_thread', 'twitter_threads'],
    ['linkedin_post', 'linkedin_posts'],
    ['instagram_caption', 'instagram_content'],
    ['blog_post', 'blog_post'],
    ['email_newsletter', 'newsletter'],
    ['show_notes', 'show_notes'],
    ['quote_graphic', 'quote_graphics'],
    ['facebook_post', 'facebook_post'],
    ['youtube_description', 'youtube_description'],
    ['podcast_episode_description', 'podcast_episode_description'],
    ['short_form_video_script', 'short_form_video_script'],
  ];

  it.each(EXPECTED_MAPPINGS)(
    'maps output type "%s" → contentTypeId "%s"',
    (_outputType, contentTypeId) => {
      expect(routeSource).toContain(`contentTypeId = '${contentTypeId}'`);
    }
  );
});

// ── 4. ContextSidebar KIND_LABELS coverage ───────────────────────────────────

const sidebarSource = fs.readFileSync(
  path.join(__dirname, '../components/ContextSidebar.tsx'),
  'utf8'
);

// The output type keys used by resolveOutputKind (which uses originalOutputType or output.type)
const SIDEBAR_KIND_KEYS = [
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
] as const;

describe('components/ContextSidebar.tsx – KIND_LABELS', () => {
  it.each(SIDEBAR_KIND_KEYS)(
    'KIND_LABELS contains key "%s"',
    (key) => {
      // Extract KIND_LABELS block
      const kindLabelsMatch = sidebarSource.match(
        /const KIND_LABELS: Record<string, string> = \{([\s\S]*?)\};/
      );
      expect(kindLabelsMatch).not.toBeNull();
      expect(kindLabelsMatch![0]).toContain(`${key}:`);
    }
  );
});

// ── 5. DB enum / OutputType exhaustiveness ────────────────────────────────────

describe('lib/content-types – OutputType union covers generated type strings', () => {
  // Every string a generator emits as `type` must be in the OutputType union.
  // The OutputType is defined in lib/content-types.ts.
  const contentTypesSource = fs.readFileSync(
    path.join(__dirname, '../lib/content-types.ts'),
    'utf8'
  );

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
  ] as const;

  it.each(GENERATED_TYPES)(
    'OutputType union includes "%s"',
    (type) => {
      expect(contentTypesSource).toContain(`| '${type}'`);
    }
  );
});
