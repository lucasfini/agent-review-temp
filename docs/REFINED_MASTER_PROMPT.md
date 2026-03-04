# Refined Master Prompt Implementation

## Overview

The Refined Master Prompt provides a cleaner, more structured template for content generation with three core architectural rules:

1. **Absolute Ad-Blocker** - Zero tolerance for sponsor content
2. **Single-Angle Narrative** - ONE compelling story per output
3. **Metadata Badging** - Standardized UI metadata for frontend

## Implementation

### Core Function: `buildMasterPrompt()`

**Location**: `app/api/generate-content/route.ts:113-176`

```typescript
function buildMasterPrompt(params: {
  angle: string;
  themeName: string;
  cleanedSummary: string;
  platformLabel: string;
  badgeColor: string;
  platformStructure: string;
  outputSchema: string;
  additionalContext?: string;
}): string
```

**Purpose**: Generates a universal content generation prompt with:
- Ad-blocker enforcement
- Single-angle narrative focus
- Platform-specific requirements table
- Anti-AI vocabulary rules
- Theme adaptation
- Standardized output format

### Platform Requirements Table

The Master Prompt includes a reference table visible to the AI:

| Format | platform_label | badge_color | Structure |
|--------|---------------|-------------|-----------|
| 𝕏 Thread | X Thread | #000000 | 6-8 posts. Narrative arc: Hook → Evidence → Synthesis → CTA. |
| LinkedIn | LinkedIn Post | #0077B5 | Hook-Value-CTA. No more than 2 rhetorical questions. |
| Instagram | Instagram Carousel | #E1306C | Array of 7 Slide Objects. Each must have a Headline and Body. |
| Newsletter | Email Newsletter | #EA4335 | 1-2-1 Structure: 1 Big Idea, 2 Tactical Bullets, 1 Personal Question. |
| Blog Post | Blog Post | #4F46E5 | 1,200 words. H2/H3s must be bold claims, not generic labels. |
| Show Notes | Show Notes | #6366F1 | Executive Summary + 3 'Aha!' Moments + Ad-free Resources. |
| Quotes | Quote Graphic | #F59E0B | 100% Verbatim. Raw spoken words only. |

## Updated Generators

### 1. X Thread (Twitter)

**Lines**: app/api/generate-content/route.ts:664-694

**Changes**:
- Replaced custom prompt with `buildMasterPrompt()`
- Uses `selectedAngle` from story angle selection
- Platform: `X Thread` / Color: `#000000`
- Structure: `6-8 posts. Narrative arc: Hook → Evidence → Synthesis → CTA.`

**Key Features**:
- 6-8 tweets enforced
- 280 character limit per tweet
- Single-angle focus (no topic-jumping)
- Hashtags only in last tweet

### 2. LinkedIn Post

**Lines**: app/api/generate-content/route.ts:779-809

**Changes**:
- Replaced `buildUniversalPrompt()` with `buildMasterPrompt()`
- Uses `narrativeMetadata.single_angle` or insight
- Platform: `LinkedIn Post` / Color: `#0077B5`
- Structure: `Hook-Value-CTA. No more than 2 rhetorical questions.`

**Key Features**:
- 1,300-1,500 characters
- Hook visible in collapsed view
- Max 2 rhetorical questions
- 3-5 hashtags
- Single-angle professional insight

### 3. Instagram Carousel

**To Be Updated** (Pattern established):

```typescript
const instagramAngle = narrativeMetadata.single_angle || topics[0] || theme.name;
const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;

const outputSchema = `{
  "angle": "The single narrative focus",
  "slides": [
    {"number": 1, "headline": "Hook", "text": "Content"},
    // ... 7 slides total
  ],
  "caption": "Caption text",
  "hashtags": ["tag1", "tag2"]
}`;

const additionalContext = `=== THEME ADAPTATION (${theme.name}) ===
${theme.description}
${theme.promptModifier}

=== TECHNICAL CONSTRAINTS ===
- EXACTLY 7 slides (no more, no less)
- Slide 1: Hook headline (5-10 words)
- Slides 2-6: Single-angle story points
- Slide 7: Call to Action
- Each slide max 50 words`;

const prompt = buildMasterPrompt({
  angle: instagramAngle,
  themeName: theme.name,
  cleanedSummary,
  platformLabel: 'Instagram Carousel',
  badgeColor: '#E1306C',
  platformStructure: 'Array of 7 Slide Objects. Each must have a Headline and Body.',
  outputSchema,
  additionalContext
});
```

### 4. Blog Post

**To Be Updated** (Pattern):

```typescript
const blogAngle = narrativeMetadata.single_angle || analysis.keyTopics[0] || theme.name;
const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;

const prompt = buildMasterPrompt({
  angle: blogAngle,
  themeName: theme.name,
  cleanedSummary,
  platformLabel: 'Blog Post',
  badgeColor: '#4F46E5',
  platformStructure: '1,200 words. H2/H3s must be bold claims, not generic labels.',
  outputSchema,
  additionalContext: `=== H2/H3 BOLD CLAIMS RULE ===
- ❌ WRONG: "Benefits", "Overview", "Conclusion"
- ✅ RIGHT: "Why Traditional Marketing Is Dead", "The $10M Mistake Most Founders Make"

=== TECHNICAL CONSTRAINTS ===
- 1,200-1,800 words
- H2/H3 every 200-300 words
- Include "Tactical Framework" table
- SEO-optimized naturally`
});
```

### 5. Newsletter

**To Be Updated** (Pattern):

```typescript
const newsletterAngle = narrativeMetadata.single_angle || analysis.keyTopics[0] || theme.name;

const prompt = buildMasterPrompt({
  angle: newsletterAngle,
  themeName: theme.name,
  cleanedSummary,
  platformLabel: 'Email Newsletter',
  badgeColor: '#EA4335',
  platformStructure: '1-2-1 Structure: 1 Big Idea, 2 Tactical Bullets, 1 Personal Question.',
  outputSchema,
  additionalContext: `=== 1-2-1 STRUCTURE ===
1. ONE Big Idea (opening paragraph)
2. TWO Tactical Bullets (actionable insights)
3. ONE Personal Question (engagement driver)

=== TECHNICAL CONSTRAINTS ===
- 800-1,200 words
- Subject line: 40-50 characters
- Preheader: <100 characters
- Single clear CTA
- P.S. section`
});
```

### 6. Show Notes

**To Be Updated** (Pattern):

```typescript
const showNotesAngle = narrativeMetadata.single_angle || analysis.keyTopics[0] || 'Episode Summary';

const prompt = buildMasterPrompt({
  angle: showNotesAngle,
  themeName: theme.name,
  cleanedSummary,
  platformLabel: 'Show Notes',
  badgeColor: '#6366F1',
  platformStructure: 'Executive Summary + 3 \'Aha!\' Moments + Ad-free Resources.',
  outputSchema,
  additionalContext: `=== EXECUTIVE BRIEF FORMAT ===
- One-sentence hook (episode thesis)
- 3 "Aha!" Moments (key insights)
- Ad-free Resources mentioned
- Chapter timestamps

=== TECHNICAL CONSTRAINTS ===
- 500-800 words
- Scannable bullet format
- Search-friendly keywords`
});
```

## Benefits of Refined Master Prompt

### 1. Consistency
- All platforms use the same base prompt structure
- Reduces prompt drift and inconsistency
- Easier to maintain and update

### 2. Clarity
- Platform requirements table visible to AI
- Clear architectural rules at top
- Explicit forbidden vocabulary

### 3. Single Source of Truth
- One function to update for global changes
- Platform-specific requirements passed as parameters
- DRY principle (Don't Repeat Yourself)

### 4. Enforcement
- Ad-blocker rule stated upfront
- Single-angle narrative emphasized
- UI metadata badging explained

## Migration Pattern

To migrate remaining generators:

1. **Identify the angle source**:
   ```typescript
   const angle = narrativeMetadata.single_angle || fallback;
   ```

2. **Get cleaned summary**:
   ```typescript
   const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;
   ```

3. **Define output schema** (JSON structure expected)

4. **Build additional context** (theme + technical constraints)

5. **Call buildMasterPrompt** with platform-specific parameters

6. **Keep system message simple**:
   ```typescript
   {
     role: 'system',
     content: 'You are an expert Content Strategist specializing in [platform].'
   }
   ```

## Testing

### Verify Master Prompt Implementation

1. **Check logs** for:
   - `[TWITTER THREAD] 🎯 Focusing on angle` - Shows angle selection
   - `[VALIDATION]` warnings for ad terms or AI-isms

2. **Inspect generated content**:
   - No sponsor mentions or promo codes
   - Single-angle focus (no topic-jumping)
   - Platform-specific structure followed
   - No AI-ism vocabulary

3. **Check metadata**:
   - `ui_metadata.platform_label` matches table
   - `ui_metadata.badge_color` matches hex code
   - `metadata.angle` present and relevant

## Deprecation Notice

### Old Functions to Remove

Once all generators are migrated:

1. **`buildUniversalPrompt()`** (line 318)
   - Can be deleted after all generators use `buildMasterPrompt()`
   - Currently used by: Instagram, Blog, Newsletter, Show Notes

2. **Individual platform requirement strings**
   - Move to `additionalContext` parameter
   - Simplifies prompt building

## Migration Status: ✅ COMPLETE

### Completed Migrations

1. ✅ **X Thread Generator** (lines 580-661)
   - Uses `buildMasterPrompt()` with story angle selection
   - Platform: X Thread / Badge: #000000

2. ✅ **LinkedIn Generator** (lines 663-791)
   - Uses `buildMasterPrompt()` with insight angle
   - Platform: LinkedIn Post / Badge: #0077B5

3. ✅ **Instagram Generator** (lines 793-925)
   - Uses `buildMasterPrompt()` with EXACTLY 7 slides enforced
   - Platform: Instagram Carousel / Badge: #E1306C

4. ✅ **Blog Post Generator** (lines 927-1031)
   - Uses `buildMasterPrompt()` with H2/H3 bold claims rule
   - Platform: Blog Post / Badge: #4F46E5

5. ✅ **Newsletter Generator** (lines 1033-1141)
   - Uses `buildMasterPrompt()` with 1-2-1 structure
   - Platform: Email Newsletter / Badge: #EA4335

6. ✅ **Show Notes Generator** (lines 1143-1259)
   - Uses `buildMasterPrompt()` with ad-filtered resources
   - Platform: Show Notes / Badge: #6366F1

7. ✅ **Quote Graphics** - Already using verbatim extraction (no Master Prompt needed)

### Deprecated Code Removed

- ✅ `buildUniversalPrompt()` function removed (replaced with deprecation notice)
- ✅ All generators now use consistent Master Prompt architecture

## Next Steps

1. **Testing**:
   - Verify all generators produce valid output
   - Check metadata structure (`ui_metadata` present)
   - Validate single-angle enforcement (no topic-jumping)
   - Test ad-blocking across all platforms

2. **Quality Validation**:
   - Check logs for `[VALIDATION]` warnings
   - Verify no "Darktrace" or sponsor mentions in outputs
   - Confirm platform badges are specific (not "General")
   - Test theme adaptation across all platforms

## Example Output

### X Thread with Refined Master Prompt

```json
{
  "type": "twitter_thread",
  "platform": "twitter",
  "title": "X Thread #1: The GOP Identity Crisis",
  "content": "[Post 1/7]\nThe Republican Party is facing an identity crisis...\n\n---\n\n[Post 2/7]...",
  "metadata": {
    "ui_metadata": {
      "platform_label": "X Thread",
      "theme_label": "Skeptical",
      "badge_color": "#000000"
    },
    "platform": "X Thread",
    "theme": "Skeptical",
    "angle": "The GOP Identity Crisis",
    "tweets": [...],
    "tweetCount": 7
  }
}
```

### LinkedIn with Refined Master Prompt

```json
{
  "type": "linkedin_post",
  "platform": "linkedin",
  "title": "LinkedIn Post #1: Building Trust in Remote Teams",
  "content": "The secret to remote team success isn't more Zoom calls...",
  "metadata": {
    "ui_metadata": {
      "platform_label": "LinkedIn Post",
      "theme_label": "Professional",
      "badge_color": "#0077B5"
    },
    "platform": "LinkedIn",
    "theme": "Professional",
    "angle": "Building Trust in Remote Teams",
    "hashtags": ["#RemoteWork", "#Leadership", "#TeamBuilding"]
  }
}
```

## Conclusion

The Refined Master Prompt provides a cleaner, more maintainable architecture for content generation. By centralizing the prompt structure and platform requirements, we ensure consistency, enforce quality standards, and make future updates easier.

Key improvements:
- ✅ Single function for all prompts
- ✅ Explicit ad-blocking and single-angle rules
- ✅ Platform requirements table for AI reference
- ✅ Standardized UI metadata
- ✅ DRY principle applied
- ✅ Easier to maintain and update
