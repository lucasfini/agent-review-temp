# Master Prompt System - Universal Podcast Repurposing Engine

## Overview

The Master Prompt System is a comprehensive content generation architecture designed to produce high-fidelity, "Repurposing Agency" quality content from podcast transcripts. The system features universal ad-blocking, single-angle storytelling, and standardized UI metadata for frontend display.

## Architecture Pillars

### 1. Signal-Only Architecture (Universal Ad-Filter)

**Purpose**: Identify and remove ALL sponsor/ad content using heuristic pattern detection

**Implementation**: `lib/content-generators/pre-processor.ts`

#### Trigger Patterns

The system detects advertisements using these heuristic patterns:

- "Brought to you by [X]"
- "This episode is sponsored by [X]"
- "Thanks to [X] for supporting the show"
- "Use code [X]" or "Promo code [X]"
- "Visit [URL] for a discount/offer"
- "Special offer for listeners"
- "Get [X]% off when you use..."
- Speaker shifts from discussion to product promotion
- "I've been using [Product]" (promotional tone)
- URLs/websites with commercial intent
- Explicit purchase/signup calls-to-action

#### Zero-Ad Output Requirement

**FORBIDDEN** to include:
- Ad-related brands
- Promo codes
- Sponsor mentions
- Promotional segments

When detected, ad segments are:
1. Logged in `ad_segments_found` array
2. Completely excluded from `cleaned_narrative_summary`
3. Never propagated to generated content

### 2. Narrative Selection (The Single-Angle Rule)

**Core Principle**: Every generated output must follow ONE compelling story angle

**Implementation Flow**:

1. **Pre-Processor** extracts `single_angle` from transcript
2. **Content Generators** enforce focus on that ONE angle
3. **Validation** checks for topic-jumping

#### Single-Angle Enforcement

**X Thread Example**:
```
Angle: "The GOP Identity Crisis"
❌ WRONG: Mention Pelosi's retirement, housing crisis, AND GOP identity
✅ RIGHT: Focus 100% on GOP identity crisis narrative arc
```

**Instagram Example**:
```
Angle: "5 Productivity Mistakes"
❌ WRONG: Slides 1-3 about productivity, Slides 4-7 about work-life balance
✅ RIGHT: All 7 slides follow the productivity mistakes angle
```

### 3. Standardized UI Metadata (The Badge System)

**Purpose**: Provide frontend with structured metadata for badges, colors, and labels

**Implementation**: `app/api/generate-content/route.ts:70-80`

#### UI Metadata Structure

Every output includes:

```json
{
  "metadata": {
    "ui_metadata": {
      "platform_label": "X Thread",    // Display name
      "theme_label": "Skeptical",      // User-selected theme
      "badge_color": "#000000"         // Platform-specific color
    },
    "platform": "X Thread",            // Backend compatibility
    "theme": "Skeptical",
    "angle": "The GOP Identity Crisis",
    // ... other fields
  }
}
```

#### Platform Badge Mapping

| Content Type | Platform Label | Badge Color | Platform (DB) |
|--------------|---------------|-------------|---------------|
| twitter_threads | X Thread | #000000 (black) | twitter |
| linkedin_posts | LinkedIn Post | #0077B5 (blue) | linkedin |
| instagram_content | Instagram Carousel | #E1306C (pink) | instagram |
| blog_post | Blog Post | #4F46E5 (indigo) | general |
| newsletter | Email Newsletter | #EA4335 (red) | general |
| show_notes | Show Notes | #6366F1 (purple) | general |
| quote_graphics | Quote Graphic | #6366F1 (purple) | general |

### 4. Platform-Specific Formatting Requirements

#### X (Twitter) Thread
- **Structure**: Hook → Evidence → Synthesis → Engagement Question
- **Count**: 6-8 posts total
- **Length**: Max 280 characters per tweet (HARD LIMIT)
- **Hashtags**: 2-3 in last tweet only
- **Single-Angle**: ONE cohesive story, no topic-jumping

#### LinkedIn Post
- **Structure**: Bold opening claim → 3 tactical bullets → Engagement question
- **Length**: 1-3 paragraphs
- **Style**: Professional, value-driven
- **Hashtags**: 3-5 relevant hashtags
- **Single-Angle**: ONE professional insight

#### Instagram Carousel
- **Structure**: EXACTLY 7 slides
  1. Slide 1: Hook headline (5-10 words)
  2. Slides 2-6: Single-angle story points (30-40 words each)
  3. Slide 7: Call to Action
- **Format**: Each slide has `headline` + `body` + `visual_prompt`
- **Caption**: 300-500 characters
- **Hashtags**: 10-15 relevant hashtags
- **Single-Angle**: All slides follow ONE narrative thread

#### Email Newsletter
- **Structure**: 1-2-1 (1 Big Insight, 2 Tactical Bullets, 1 Personal Question)
- **Length**: 800-1,200 words
- **Components**:
  - Subject line (40-50 chars)
  - Preheader text (<100 chars)
  - Single clear CTA
  - P.S. section
- **Tone**: Conversational, personal
- **Single-Angle**: ONE newsletter theme

#### Blog Post
- **Structure**: H2/H3 with bold claims (not generic labels)
- **Length**: 1,200-1,800 words
- **Elements**:
  - Introduction with hook
  - H2/H3 subheadings every 200-300 words
  - "Tactical Framework" table
  - Actionable takeaways
  - Strong conclusion
- **Example H2**: ❌ "Benefits" → ✅ "Why Generic Ads Are Dying"
- **Single-Angle**: ONE blog thesis

#### Show Notes
- **Structure**: Executive Brief format
  - One-sentence hook
  - Big takeaway bullets
  - Ad-free resources section
  - Chapter timestamps
- **Length**: 500-800 words
- **Style**: Scannable, search-friendly
- **Single-Angle**: Episode summary focus

#### Social Quote
- **Rule**: 100% VERBATIM - extract raw spoken words
- **Forbidden**: Paraphrasing, summarizing, or rephrasing
- **Length**: Max 40-50 words (quote_graphic limit)
- **Include**: Speaker attribution

### 5. Tone & Style Guardrails

#### Theme Infusion

Apply user-selected theme across all content:
- **Skeptical**: Question assumptions, challenge status quo
- **Provocative**: Bold claims, contrarian takes
- **Enthusiastic**: High energy, exclamation points
- **Professional**: Authoritative, data-driven
- **Conversational**: Friendly, personal

**Implementation**: Theme description and prompt modifier injected into all generators

#### Anti-AI Vocabulary

**FORBIDDEN WORDS** (never use):
- "unlock"
- "delve"
- "tapestry"
- "game-changer" / "game changer"
- "dive deep"
- "shocker"

**Why**: These are AI-isms that make content feel robotic and inauthentic

**Validation**: `validateOutput()` function checks and warns if detected

#### Burstiness

**Principle**: Mix sentence lengths for human rhythm

**Implementation**:
- Short, punchy sentences for impact
- Longer explanatory sentences for depth
- Avoid monotonous pattern (short-short-short or long-long-long)

**Example**:
```
❌ AI-LIKE (Monotonous):
"The market is changing. Companies need to adapt. Innovation drives growth."

✅ HUMAN-LIKE (Bursty):
"The market is changing. And not in the way most companies expect.
While everyone's chasing AI tools and automation, the real competitive
advantage is becoming something much simpler: trust."
```

## System Flow

```
1. Audio Upload
   ↓
2. Transcription (AssemblyAI)
   ↓
3. Pre-Processor (GPT-4o-mini)
   - Universal Ad Detection
   - Extract single_angle
   - Generate cleaned_narrative_summary
   ↓
4. Content Analysis (GPT-4o)
   - Extract quotes, facts, insights
   - Rate hook_strength, controversy_level
   ↓
5. Content Generation (GPT-4o)
   - Select story angle (for multi-angle platforms)
   - Enforce Single-Angle Rule
   - Apply theme + anti-AI vocabulary
   - Generate with platform-specific formatting
   - Add ui_metadata
   ↓
6. Validation
   - Check for ad terms
   - Check for AI-isms
   - Verify ui_metadata present
   ↓
7. Database Storage
   - Normalize types for constraints
   - Save with full metadata
```

## Key Files

### Pre-Processor
**File**: `lib/content-generators/pre-processor.ts`

**Exports**:
- `preProcessTranscript()` - Main function
- `NarrativeMetadata` - Interface with `single_angle`

**Key Updates**:
- Universal ad detection patterns
- `single_angle` extraction
- Enhanced trigger pattern list

### Content Generation API
**File**: `app/api/generate-content/route.ts`

**Key Functions**:
- `getPlatformBadge()` - Maps content type to display label
- `getBadgeColor()` - Maps content type to hex color
- `buildUIMetadata()` - Constructs standardized UI metadata
- `validateOutput()` - Checks for forbidden terms and AI-isms

**Generator Functions** (all updated):
- `generateTwitterThread()` - X Thread with angle selection
- `generateLinkedInPost()` - LinkedIn with insight focus
- `generateInstagramCarousel()` - 7-slide enforced structure
- `generateBlogPost()` - H2 bold claims
- `generateNewsletter()` - 1-2-1 structure
- `generateShowNotes()` - Executive brief format
- `generateQuoteGraphic()` - Verbatim extraction

## Validation System

### Three-Layer Validation

#### Layer 1: Pre-Processor
- Detects and logs ads in `ad_segments_found`
- Generates ad-free `cleaned_narrative_summary`

#### Layer 2: Prompt Engineering
- Includes "AD-BLOCKER REMINDER" in every prompt
- Lists forbidden AI vocabulary
- Enforces Single-Angle Rule

#### Layer 3: Post-Generation Validation
- `validateOutput()` function checks:
  - Ad-related terms (sponsor, promo code, etc.)
  - AI-ism vocabulary (unlock, delve, etc.)
  - Generic "General" platform labels
  - Missing ui_metadata

**Behavior**: Logs warnings but doesn't block (pre-processor should catch issues)

## Testing Checklist

### Content Quality
- [ ] No brand names or promo codes in output
- [ ] No AI-ism vocabulary (unlock, delve, tapestry, etc.)
- [ ] Single-angle focus maintained (no topic-jumping)
- [ ] Burstiness evident (mixed sentence lengths)
- [ ] Theme properly applied to tone/style

### UI Metadata
- [ ] `ui_metadata` present in all outputs
- [ ] `platform_label` matches expected value (not "General")
- [ ] `theme_label` matches user selection
- [ ] `badge_color` correct hex code for platform

### Platform-Specific
- [ ] X Thread: 6-8 tweets, 280 char limit, single angle
- [ ] LinkedIn: Hook-Value-CTA structure
- [ ] Instagram: EXACTLY 7 slides with headlines
- [ ] Blog: H2 bold claims, 1200+ words
- [ ] Newsletter: 1-2-1 structure, subject line
- [ ] Show Notes: Executive brief format
- [ ] Quote: 100% verbatim, no paraphrasing

### Database
- [ ] All content saves without constraint violations
- [ ] Types normalized correctly (email_newsletter → social_post)
- [ ] Metadata includes both new and backward-compat fields

## Frontend Integration

### Display UI Metadata

```typescript
// Access ui_metadata from output
const { ui_metadata } = output.metadata;

// Render badge
<Badge
  color={ui_metadata.badge_color}
  label={ui_metadata.platform_label}
/>

// Render theme
<Tag text={ui_metadata.theme_label} />

// Display angle
<Text>{metadata.angle}</Text>
```

### Badge Component Example

```tsx
function PlatformBadge({ uiMetadata }: { uiMetadata: UIMetadata }) {
  return (
    <div
      className="inline-flex items-center px-2 py-1 rounded text-white text-xs font-medium"
      style={{ backgroundColor: uiMetadata.badge_color }}
    >
      {uiMetadata.platform_label}
    </div>
  );
}
```

## Benefits

### 1. Universal Ad-Blocking
- Domain-agnostic detection (not brand-specific)
- Heuristic pattern matching catches new sponsors
- Three-layer validation ensures clean output

### 2. "Repurposing Agency" Quality
- Single-angle storytelling (no meandering)
- Platform-specific formatting (professional structure)
- Anti-AI vocabulary (human-sounding)
- Theme infusion (brand consistency)

### 3. Frontend-Ready Metadata
- Standardized `ui_metadata` block
- Platform-specific colors and labels
- No more "General" tags
- Angle tracking for analytics

### 4. Maintainable Architecture
- Centralized helper functions
- Consistent metadata structure
- Clear validation layers
- Comprehensive documentation

## Performance Impact

### Token Usage
- Pre-processor: ~2,000 tokens (GPT-4o-mini)
- Content analysis: ~4,000 tokens (GPT-4o)
- Per-generator: ~1,500-3,000 tokens (GPT-4o)

### Cost Optimization
- Pre-processor uses cheaper GPT-4o-mini
- Cleaned summary reduces downstream token usage
- Single API call per content block

### Processing Time
- Pre-processing: ~5-10 seconds
- Analysis: ~10-15 seconds
- Generation per block: ~5-10 seconds
- Total for 7 blocks: ~60-90 seconds

## Troubleshooting

### Issue: Ads Still Appearing

**Diagnosis**: Check pre-processor logs for `ad_segments_found`

**Solutions**:
1. Add new trigger pattern to pre-processor prompt
2. Verify `cleaned_narrative_summary` excludes segment
3. Check validation warnings for ad terms

### Issue: AI-ism Vocabulary Detected

**Diagnosis**: Check validation warnings

**Solutions**:
1. Enhance anti-AI vocabulary list in prompt
2. Increase temperature slightly (0.7 → 0.75)
3. Add more examples of human tone to system message

### Issue: Topic-Jumping (Multiple Angles)

**Diagnosis**: Content covers multiple unrelated topics

**Solutions**:
1. Verify Single-Angle Rule emphasized in prompt
2. Check if `selectedAngle` is clear and specific
3. Reduce source data to focus only on chosen angle

### Issue: Generic "General" Platform Labels

**Diagnosis**: `platform_label` showing "General"

**Solutions**:
1. Verify `contentTypeId` passed correctly to `buildUIMetadata()`
2. Check if content type in badge mapping
3. Update mapping if new content type added

### Issue: Missing UI Metadata

**Diagnosis**: `ui_metadata` not present in output

**Solutions**:
1. Verify `buildUIMetadata()` called in generator
2. Check if metadata properly spread into return object
3. Review generator return statement structure

## Future Enhancements

### Potential Improvements
1. **Dynamic trigger patterns**: Learn new ad patterns from user feedback
2. **Multi-angle variants**: Generate 3 versions per platform, one per angle
3. **Tone scoring**: Rate how well theme was applied (0-10)
4. **Angle performance tracking**: Which angles drive best engagement
5. **Custom vocabulary blocklists**: User-specific forbidden words
6. **A/B testing framework**: Test prompts and measure quality

### Scalability Considerations
1. **Caching**: Cache pre-processor results by audio fingerprint
2. **Parallel generation**: Generate multiple platforms simultaneously
3. **Batch processing**: Queue system for high-volume processing
4. **Rate limiting**: Respect OpenAI API rate limits

## Conclusion

The Master Prompt System transforms raw podcast transcripts into high-quality, platform-optimized content through:

1. **Universal ad-blocking** (heuristic detection)
2. **Single-angle storytelling** (narrative focus)
3. **Standardized metadata** (frontend-ready badges)
4. **Platform-specific formatting** (professional structure)
5. **Human-sounding tone** (anti-AI vocabulary + burstiness)

This architecture ensures "Repurposing Agency" quality output at scale while maintaining clean, maintainable code.
