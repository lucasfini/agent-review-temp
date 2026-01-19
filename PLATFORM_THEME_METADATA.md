# Platform & Theme Metadata Implementation

## Overview
All content generators now return standardized metadata with specific platform badges and narrative angles, replacing generic "General" labels.

## New Metadata Structure

Every generated output now includes:

```json
{
  "metadata": {
    "platform": "X Thread",      // Specific platform badge (not "General")
    "theme": "Skeptical",         // The selected theme name
    "angle": "The GOP Identity Crisis",  // The narrative angle/focus
    // ... other platform-specific fields
  },
  "content": {
    // ... platform-specific data structure
  }
}
```

## Platform Badge Mapping

Each content type now has a specific platform badge:

| Content Type ID | Platform Badge | Platform Field (DB) |
|----------------|----------------|---------------------|
| `twitter_threads` | `X Thread` | `twitter` |
| `linkedin_posts` | `LinkedIn` | `linkedin` |
| `instagram_content` | `Instagram` | `instagram` |
| `blog_post` | `Blog` | `general` |
| `newsletter` | `Email Newsletter` | `general` |
| `show_notes` | `Show Notes` | `general` |
| `quote_graphics` | `Quote Graphic` | `general` |

## Angle Extraction by Platform

### X Thread (Twitter)
- **Angle Source**: Selected story angle from 3 AI-generated angles
- **Example**: "The GOP Identity Crisis"
- **Implementation**: Cycles through 3 distinct angles based on block number
- **Metadata Fields**:
  ```json
  {
    "platform": "X Thread",
    "theme": "Skeptical",
    "angle": "The GOP Identity Crisis",
    "storyAngle": "The GOP Identity Crisis",  // backward compat
    "angleIndex": 1,
    "allAngles": ["angle1", "angle2", "angle3"],
    "tweets": [...],
    "tweetCount": 7
  }
  ```

### LinkedIn
- **Angle Source**: Top-rated actionable insight from transcript analysis
- **Example**: "How to build trust in remote teams"
- **Fallback**: Main topic from narrative metadata or theme name
- **Metadata Fields**:
  ```json
  {
    "platform": "LinkedIn",
    "theme": "Professional",
    "angle": "How to build trust in remote teams",
    "insight": "...",  // backward compat
    "hashtags": [...]
  }
  ```

### Instagram (7-Slide Carousel)
- **Angle Source**: AI-generated angle field or first topic
- **Example**: "5 Mistakes Killing Your Productivity"
- **Strict Structure**: EXACTLY 7 slides enforced
- **Metadata Fields**:
  ```json
  {
    "platform": "Instagram",
    "theme": "Inspirational",
    "angle": "5 Mistakes Killing Your Productivity",
    "slides": [
      {
        "number": 1,
        "headline": "Hook headline",
        "text": "Slide content"
      },
      // ... exactly 7 slides total
    ],
    "slideCount": 7,
    "hashtags": [...]
  }
  ```

### Blog Post
- **Angle Source**: Generated blog title
- **Example**: "The Future of Remote Work: What Leaders Need to Know"
- **Fallback**: First key topic or theme name
- **Metadata Fields**:
  ```json
  {
    "platform": "Blog",
    "theme": "Authoritative",
    "angle": "The Future of Remote Work: What Leaders Need to Know",
    "metaDescription": "..."
  }
  ```

### Email Newsletter
- **Angle Source**: Email subject line
- **Example**: "Why your morning routine is sabotaging your day"
- **Fallback**: First key topic or theme name
- **Metadata Fields**:
  ```json
  {
    "platform": "Email Newsletter",
    "theme": "Conversational",
    "angle": "Why your morning routine is sabotaging your day",
    "subject": "...",
    "previewText": "...",
    "cta": "...",
    "ps": "..."
  }
  ```

### Show Notes
- **Angle Source**: First sentence of episode summary
- **Example**: "A deep dive into the future of AI"
- **Fallback**: First key topic or "Episode Summary"
- **Metadata Fields**:
  ```json
  {
    "platform": "Show Notes",
    "theme": "Informative",
    "angle": "A deep dive into the future of AI",
    "summary": "...",
    "topics": [...],
    "quotes": [...],
    "resources": [...]
  }
  ```

### Quote Graphic
- **Angle Source**: First 50 characters of the quote
- **Example**: "The biggest mistake founders make is waiting..."
- **Metadata Fields**:
  ```json
  {
    "platform": "Quote Graphic",
    "theme": "Motivational",
    "angle": "The biggest mistake founders make is waiting...",
    "speaker": "John Doe"
  }
  ```

## Instagram Carousel Refinement

### Strict 7-Slide Structure

The Instagram generator now enforces exactly 7 slides with specific purposes:

1. **Slide 1**: Hook headline (5-10 words max)
2. **Slides 2-6**: Single-angle story content (30-40 words each)
3. **Slide 7**: Call to Action (engagement question or save prompt)

### Output Schema
```json
{
  "angle": "The single narrative focus for this carousel",
  "slides": [
    {"number": 1, "headline": "Hook headline", "text": "Slide 1 content"},
    {"number": 2, "headline": "Point 1", "text": "Slide 2 content"},
    {"number": 3, "headline": "Point 2", "text": "Slide 3 content"},
    {"number": 4, "headline": "Point 3", "text": "Slide 4 content"},
    {"number": 5, "headline": "Point 4", "text": "Slide 5 content"},
    {"number": 6, "headline": "Point 5", "text": "Slide 6 content"},
    {"number": 7, "headline": "CTA", "text": "Slide 7 content"}
  ],
  "caption": "Instagram caption text",
  "hashtags": ["hashtag1", "hashtag2"]
}
```

### Single-Angle Rule
All 7 slides MUST follow ONE narrative thread - no topic-jumping between slides.

## Validation System

### Forbidden Terms Detection

A validation function checks all outputs before saving:

```typescript
function validateOutput(output: any): void {
  const forbiddenTerms = ['Darktrace', 'sponsor', 'advertisement', 'ad break'];
  const contentString = JSON.stringify(output).toLowerCase();

  const found = forbiddenTerms.filter(term =>
    contentString.includes(term.toLowerCase())
  );

  if (found.length > 0) {
    console.warn(`[VALIDATION] ⚠️ Potentially unwanted terms detected: ${found.join(', ')}`);
  }

  if (output.metadata?.platform === 'General') {
    console.warn('[VALIDATION] ⚠️ Generic "General" platform label detected - should be specific');
  }
}
```

### Validation Points
- ✅ Checks for ad-related terms (Darktrace, sponsor, advertisement, ad break)
- ✅ Warns if "General" platform badge is used (should be specific)
- ✅ Runs before database insert
- ✅ Logs warnings but doesn't block (pre-processor should have cleaned content)

## Files Modified

### `/app/api/generate-content/route.ts`

**New Helper Functions:**
```typescript
function getPlatformBadge(contentTypeId: string): string
function validateOutput(output: any): void
```

**Updated Generators:**
- `generateTwitterThread()` - X Thread badge + story angle
- `generateLinkedInPost()` - LinkedIn badge + insight angle
- `generateInstagramCarousel()` - Instagram badge + 7-slide structure + carousel angle
- `generateBlogPost()` - Blog badge + title angle
- `generateNewsletter()` - Email Newsletter badge + subject angle
- `generateShowNotes()` - Show Notes badge + summary angle
- `generateQuoteGraphic()` - Quote Graphic badge + quote angle

**Validation Integration:**
- Added validation loop in `saveGeneratedContent()` before database insert

## Benefits

### 1. Clear Platform Identity
- Users see specific platform names (X Thread, LinkedIn, Blog) instead of generic "General"
- Better UX in dashboards and content listings
- Clear visual distinction between content types

### 2. Narrative Focus
- Every piece includes the specific angle/focus being explored
- Helps users understand what story is being told
- Supports single-storyline approach (no topic-jumping)

### 3. Quality Control
- Validation catches unwanted ad content
- Warns about generic labels
- Comprehensive logging for debugging

### 4. Backward Compatibility
- Original fields preserved (storyAngle, insight, etc.)
- Existing functionality continues to work
- New fields added without breaking changes

## Testing Checklist

- [ ] X Thread: Verify platform badge and story angle appear
- [ ] LinkedIn: Verify platform badge and insight angle appear
- [ ] Instagram: Verify exactly 7 slides with platform badge and angle
- [ ] Blog: Verify platform badge and title angle appear
- [ ] Newsletter: Verify platform badge and subject angle appear
- [ ] Show Notes: Verify platform badge and summary angle appear
- [ ] Quote Graphic: Verify platform badge and quote angle appear
- [ ] Validation: Check logs for forbidden term warnings
- [ ] Database: Confirm all content saves without constraint violations

## Next Steps

1. **Frontend Integration**: Update UI components to display `metadata.platform` badge
2. **Angle Display**: Show `metadata.angle` in content cards/listings
3. **Analytics**: Track which angles perform best across platforms
4. **A/B Testing**: Test different angle approaches for engagement
