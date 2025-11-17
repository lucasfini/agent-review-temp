# AI Prompts Reference Guide
**Complete list of all AI prompts used in AudioRepurpose**

This document contains all prompts sent to AI APIs for your review and optimization.

---

## 1. INSIGHT EXTRACTION (Claude Haiku 3.5)
**File:** `lib/insight-extraction.ts`
**Model:** `claude-3-5-haiku-20241022`
**Cost:** ~$0.02 per podcast (with 50% batch discount)
**Purpose:** Extract educational insights (people & concepts) from transcripts

### Prompt:
```
${titleContext}${speakerContext}

Extract 10-15 key educational insights from this podcast transcript that would help readers better understand unfamiliar concepts and people mentioned.

Focus on:
1. **Concepts**: Technical terms, theories, methodologies, frameworks, jargon that listeners may not know (e.g., "vector embeddings", "product-market fit", "retrieval augmented generation")
2. **People**: Important individuals mentioned (founders, researchers, thought leaders) - NOT the podcast hosts/speakers

For each insight, provide:
- **entity_id**: Lowercase, hyphenated unique identifier (e.g., "sam-altman", "kubernetes")
- **label**: Proper display name (e.g., "Sam Altman", "Kubernetes")
- **category**: "person" or "concept"
- **match_text**: Primary text to find in transcript
- **match_variants**: Array of alternative names, nicknames, abbreviations (e.g., ["k8s"] for Kubernetes)
- **transcript_excerpts**: 2-3 short quotes showing usage (with approximate timestamp if visible)
- **simple_definition**: 1-2 sentence explanation (for Pro tier users)
- **full_explanation**: 3-4 sentence detailed explanation (for Premium tier users)
- **related_concepts**: Array of other concept names mentioned in same context
- **why_it_matters**: 1-2 sentences on relevance to this conversation
- **relationships**: Array of connections to other entities (optional)
- **confidence**: 0-1 based on clarity and frequency of mention

Return ONLY a JSON array with this structure:
\`\`\`json
[
  {
    "entity_id": "string",
    "label": "string",
    "category": "person" | "concept",
    "match_text": "string",
    "match_variants": ["string"],
    "transcript_excerpts": [{"text": "string", "timestamp": 123}],
    "simple_definition": "string",
    "full_explanation": "string",
    "related_concepts": ["string"],
    "why_it_matters": "string",
    "relationships": [{"type": "string", "entityId": "string", "description": "string"}],
    "confidence": 0.8
  }
]
\`\`\`

Prioritize:
- Concepts/people mentioned multiple times
- Terms that require specialized knowledge
- Ideas central to the conversation's theme

TRANSCRIPT:
${transcript.substring(0, 50000)}
```

**Parameters:**
- Temperature: 0.3 (low for consistent structured extraction)
- Max tokens: 4096
- Truncates transcript at 50,000 chars

---

## 2. RESEARCH LINKS (Perplexity Sonar Pro)
**File:** `lib/ai-providers/perplexity.ts`
**Model:** `sonar-pro`
**Cost:** ~$0.004 per insight
**Purpose:** Generate authoritative research links for top 5 insights

### Prompt for People:
```
Find 2-3 authoritative sources about ${label}, a person mentioned in this context:

"${context}"

Provide official websites, Wikipedia articles, or credible biographical sources.

Return ONLY a JSON array with this exact structure:
[
  {
    "title": "Source title",
    "url": "https://...",
    "description": "Brief description of what this source covers",
    "type": "wikipedia" | "official" | "article"
  }
]

Focus on the most authoritative and relevant sources.
```

### Prompt for Concepts:
```
Find 2-3 authoritative sources to explain "${label}", a concept/term mentioned in this context:

"${context}"

Provide official documentation, Wikipedia articles, or reputable explainers.

Return ONLY a JSON array with this exact structure:
[
  {
    "title": "Source title",
    "url": "https://...",
    "description": "Brief description of what this source covers",
    "type": "wikipedia" | "documentation" | "article" | "academic"
  }
]

Focus on educational sources that help readers understand the concept.
```

**System Message:**
```
You are a research assistant helping to find authoritative sources for educational content. Return only valid JSON.
```

**Parameters:**
- Temperature: 0.2 (low for factual consistency)
- Max tokens: 500
- Return citations: true
- Search recency filter: 'month'

---

## 3. CONTENT GENERATION (Claude Sonnet 3.5)
**File:** `lib/content-generator.ts`
**Model:** `claude-3-5-sonnet-20241022`
**Cost:** $0.015-$0.08 per content piece
**Purpose:** Generate social media posts, blog posts, newsletters, etc.

### Base Context (All Content Types):
```
You are a content marketing expert specializing in repurposing podcast content for social media and digital platforms.

PODCAST TITLE: "${projectTitle}"
SPEAKERS: ${speakerNames}

TRANSCRIPT:
${transcriptionText.slice(0, 15000)} ${transcriptionText.length > 15000 ? '...(truncated)' : ''}
```

### 3.1 Twitter Threads
```
CREATE ${count} ENGAGING TWITTER THREADS

Instructions:
- Each thread should be 6-8 tweets maximum
- Start with a strong hook that stops scrolling
- Use short sentences and clear language
- Include 1-2 relevant hashtags per thread
- End with a call-to-action or thought-provoking question
- Make threads self-contained (don't assume people read all ${count})

Format each thread like this:
---
THREAD 1:

Tweet 1: [Hook]
Tweet 2: [Point 1]
...
Tweet N: [CTA]
---

Generate ${count} distinct threads now:
```

### 3.2 LinkedIn Posts
```
CREATE ${count} PROFESSIONAL LINKEDIN POSTS

Instructions:
- Each post should be 200-400 words
- Start with a compelling opening line
- Use professional but conversational tone
- Include 2-3 key insights or takeaways
- Add relevant emojis sparingly for visual breaks
- End with an engaging question to drive comments
- No hashtags (LinkedIn algorithm doesn't favor them)

Format:
---
POST 1:

[Opening hook]

[Body with insights]

[Closing question]
---

Generate ${count} distinct posts now:
```

### 3.3 Instagram Captions
```
CREATE ${count} ENGAGING INSTAGRAM CAPTION${count > 1 ? 'S' : ''}

Instructions:
- Each caption should be 150-300 words
- Start with an attention-grabbing first line (shows before "more")
- Use line breaks for readability
- Include emojis to add personality
- Add 10-15 relevant hashtags at the end
- Mix popular and niche hashtags
- End with a call-to-action

Format:
---
CAPTION 1:

[First line hook]

[Body content with line breaks]

[CTA]

#hashtag1 #hashtag2 ... #hashtag15
---

Generate ${count} distinct caption${count > 1 ? 's' : ''} now:
```

### 3.4 Blog Post (SEO-Optimized)
```
CREATE 1 SEO-OPTIMIZED BLOG POST

Instructions:
- 2500-3000 words
- SEO-optimized structure with H2 and H3 headings
- Include an engaging introduction
- Break content into scannable sections
- Add specific examples and quotes from the podcast
- Include actionable takeaways
- Write a strong conclusion with CTA
- Suggest 5 keywords to target

Format:
---
TITLE: [Catchy, SEO-friendly title]

META DESCRIPTION: [150-160 characters]

[Introduction - 2-3 paragraphs]

## [H2 Heading]
[Content]

### [H3 Subheading]
[Content]

[Continue with multiple sections]

## Conclusion
[Wrap-up and CTA]

SUGGESTED KEYWORDS: keyword1, keyword2, keyword3, keyword4, keyword5
---

Generate the blog post now:
```

### 3.5 Email Newsletter
```
CREATE 1 EMAIL NEWSLETTER

Instructions:
- Subject line that drives opens (under 50 characters)
- Preheader text (under 100 characters)
- Engaging introduction (2-3 paragraphs)
- 3-5 key insights from the podcast
- Visual breaks with emojis or bullets
- Clear CTA at the end
- 400-600 words total
- Conversational, friendly tone

Format:
---
SUBJECT: [Subject line]
PREHEADER: [Preheader text]

[Opening paragraph]

🎯 Key Insights:

• [Insight 1]
• [Insight 2]
• [Insight 3]

[Body content]

[CTA section]
---

Generate the newsletter now:
```

### 3.6 Show Notes
```
CREATE DETAILED EPISODE SHOW NOTES

Instructions:
- Episode summary (2-3 paragraphs)
- Key topics discussed with timestamps (if identifiable from context)
- Main takeaways (5-7 bullet points)
- Guest bio (if mentioned)
- Relevant links or resources mentioned
- Memorable quotes (3-5)
- Well-organized and scannable format

Format:
---
EPISODE SUMMARY:
[2-3 paragraph summary]

KEY TOPICS:
• [Topic 1] - [Approximate time or context]
• [Topic 2] - [Approximate time or context]
...

MAIN TAKEAWAYS:
1. [Takeaway 1]
2. [Takeaway 2]
...

MEMORABLE QUOTES:
"[Quote 1]" - [Speaker]
"[Quote 2]" - [Speaker]
...

RESOURCES MENTIONED:
• [Resource 1]
• [Resource 2]
...
---

Generate the show notes now:
```

### 3.7 Quote Graphics
```
CREATE ${count} PULL QUOTE${count > 1 ? 'S' : ''} FOR GRAPHICS

Instructions:
- Each quote should be 20-40 words maximum
- Must be actual quotes from the transcript
- Powerful, memorable, and shareable
- Include speaker attribution
- Stand alone without context
- Avoid jargon or complex terms
- Format for visual design (square graphic)

Format:
---
QUOTE 1:
"[The actual quote from transcript]"
- [Speaker Name]

QUOTE 2:
"[The actual quote from transcript]"
- [Speaker Name]
---

Generate ${count} distinct quote${count > 1 ? 's' : ''} now:
```

**Parameters:**
- Temperature: 0.7 (balanced creativity)
- Max tokens: 4000

---

## 4. NARRATIVE COVERAGE ANALYSIS (Claude Sonnet 4.5)
**File:** `lib/narrative-coverage-analyzer.ts`
**Model:** `claude-sonnet-4-5-20250929`
**Cost:** ~$0.02-$0.04 per analysis
**Purpose:** Analyze topic coverage, CTAs, and editorial gaps (MANUAL ONLY)

### Prompt:
```
You are an editorial analyst. Given a podcast transcript (and a short summary if available), produce a structured JSON object describing narrative coverage.

Requirements:
- Return ONLY valid JSON (no markdown fences).
- JSON structure:
{
  "coverage_window": "${coverageWindow}",
  "topics": [
    {
      "id": "kebab_case_id",
      "label": "Human readable topic",
      "keywords": ["keyword", "secondary"],
      "mentionCount": number,
      "sentimentScore": number between -1 and 1,
      "shareOfVoice": 0-1,
      "relatedCtas": ["cta_id"],
      "assetsCovered": ["summary","quotes"]
    }
  ],
  "ctas": [
    {
      "id": "cta_id",
      "label": "CTA label",
      "mentionCount": number,
      "cadenceDays": number,
      "sentimentScore": number between -1 and 1
    }
  ],
  "opportunities": [
    {
      "type": "underrepresented|overindexed|debt|cta-gap|balanced",
      "label": "Opportunity title",
      "topicId": "optional topic id",
      "severity": "low|medium|high",
      "summary": "Short explanation",
      "recommendedAction": "Specific follow-up",
      "supportingTopics": ["topic ids"]
    }
  ],
  "notes": "Optional analyst notes"
}
- Limit topics to ${maxTopics} entries focusing on the clearest themes.
- Mention counts should be relative estimates; set to 0 if unsure.
- Share of voice values should sum to roughly 1.
- Always include at least one opportunity entry even if it is "balanced" feedback.

Context:
- Project: ${projectTitle || 'Untitled Project'}
- Tier: ${tier || 'unknown'}
- Goals & guardrails: ${goalsText || 'None provided'}
- Transcript slice (<=${MAX_TRANSCRIPT_CHARS} chars):
"""${transcriptSlice}"""

${summarySnippet ? `Existing summary:\n"""${summarySnippet}"""\n` : ''}
```

**Parameters:**
- Temperature: 0.2 (low for structured analysis)
- Max tokens: 1800

---

## 5. SPEAKER NAME EXTRACTION (OpenAI GPT-4o-mini)
**File:** `lib/name-extraction.ts`
**Model:** `gpt-4o-mini`
**Cost:** Minimal (~$0.001 per extraction)
**Purpose:** Extract speaker names from transcript

### System Message:
```
You are a name extraction specialist. Return only valid JSON arrays, no explanations.
```

### Strategy 1: General Extraction (Primary)
```
Task:
Extract the names of people who are active speakers in the conversation from the first ~2500 characters of a podcast transcript.

A speaker is someone who is explicitly introduced as being present.

✅ RULES FOR EXTRACTION

1. Self-Introductions

Extract the name when someone introduces themselves:
- "I'm <Name>"
- "I am <Name>"
- "My name is <Name>"
- "This is <Name>"
- "I'm your host <Name>"

Correct Examples:
- "Hi everyone, I'm Julia Rivera" → Julia Rivera
- "My name is Tom Lee" → Tom Lee
- "This is your host Maria Torres" → Maria Torres

2. Host Introducing Guest or Co-Host

Extract the name when the host identifies someone as being present:
- "Today I'm joined by <Name>"
- "Our guest today is <Name>"
- "With me today is <Name>"
- "Welcome <Name>"
- "We have <Name> on the show"

If descriptors appear, discard descriptors and extract only the proper name.

Correct Examples (Extract the name at the end of the phrase):
- "Today I'm joined by political commentator Sarah Johnson" → Sarah Johnson
- "Our guest today is best-selling author Dr. Michael Carter" → Michael Carter (ignore Dr.)
- "With me today is journalist and historian Rachel Ahmed" → Rachel Ahmed
- "Welcome my friend, entrepreneur and CEO Jacob Miles" → Jacob Miles
- "Here with us is lawyer and political commentator Aaron Parness" → Aaron Parness

❌ DO NOT EXTRACT (These are the most common false positives):

Type | Example | Do Not Extract Because
-----|---------|----------------------
Mention of non-present person | "I was talking to John yesterday" | John is not a speaker
Addressing someone | "So John, what do you think?" | Name is used, not introduced
Reference to public figure | "Like Obama said one time" | Not present
Title with no name | "The analyst said" | No name
Nicknames only | "We call him Big Mike" | Not a full name
Group references | "The Johnson family was there" | Not an individual speaker

📦 OUTPUT FORMAT

Return a unique JSON list of names:

[
  "First Last",
  "First Last"
]

If no names, return:

[]

Do not include commentary, explanation, or any extra text.

🧠 FINAL INSTRUCTION TO MODEL

Analyze the transcript and return only the names of speakers who are explicitly introduced as being present in the conversation, according to the rules and examples above.
Return only the deduplicated JSON list of names.
Do not include titles, descriptors, nicknames, or third-party mentions.

Transcription:
${transcriptionText.substring(0, 2500)}...
```

### Strategy 2: Introduction-Focused (Fallback)
```
Analyze this podcast/interview transcription and extract speaker names ONLY from self-introductions. Focus on:

1. SELF-introductions ONLY: "I'm [Name]", "My name is [Name]", "I am [Name]"
2. Host self-introductions: "This is [Name] from...", "I'm your host [Name]"

IGNORE these patterns:
- Names mentioned about other people: "John told me...", "I spoke with Sarah..."
- Guest introductions by host: "Today we have [Name]" (this is the host speaking, not the guest)
- References to other people: "Thanks [Name]" (person thanking is the speaker)
- TITLES and ROLES: "commentator", "analyst", "lawyer", "host", etc. are NOT names

CRITICAL: Extract ONLY proper names, NOT titles:
- "lawyer and political commentator Aaron Parness" → Extract "Aaron Parness" only
- "journalist Sarah Johnson" → Extract "Sarah Johnson" only
- Always prioritize person names over job titles

Return ONLY a valid JSON array:

[
  {
    "name": "Primary name used",
    "fullName": "Full name if mentioned (optional)",
    "nicknames": ["alternative names"],
    "context": "Self-introduction phrase used",
    "confidence": 0.95
  }
]

Rules:
- Only extract proper names (first + last name), NOT titles or roles
- If both title and name mentioned, extract name only
- Rate confidence 0.1-1.0 based on clarity of self-identification
- Return empty array [] if no clear self-introductions found
- Return ONLY the JSON array, no other text

Transcription:
${transcriptionText.substring(0, 2000)}...
```

### Strategy 3: Q&A Pattern (Fallback)
```
Analyze this conversation transcript for direct address patterns where someone speaks TO another person. Look for:

1. Direct address responses: "Well [Interviewer name], I believe..." (person being addressed is speaking)
2. Response acknowledgments: "Thanks for that question, [Host name]..." (person being addressed is speaking)
3. Conversational responses: "You're right about that, [Name]..." (person being addressed is speaking)

IGNORE these patterns:
- Questions TO others: "[Name], what do you think..." (questioner is speaking, not [Name])
- References ABOUT others: "As [Name] mentioned earlier..." (speaker is mentioning someone else)
- Third-person mentions: "[Name] told me..." (speaker is talking about someone else)

Return ONLY a valid JSON array:

[
  {
    "name": "Primary name used",
    "fullName": "Full name if mentioned (optional)",
    "nicknames": ["alternative names"],
    "context": "How the speaker addressed the other person",
    "confidence": 0.85
  }
]

Rules:
- Only extract names when the speaker is responding TO or addressing that person
- Ignore names mentioned when speaking ABOUT other people
- Rate confidence based on clarity of direct address
- Return empty array [] if no clear patterns found
- Return ONLY the JSON array, no other text

Transcription:
${transcriptionText.substring(1000, 2500)}...
```

**Parameters:**
- Temperature: 0.1 (very low for precision)
- Max tokens: 1000
- Uses multi-pass strategy (general → introduction → Q&A) until enough names found

---

## 6. SPEAKER ROLE CLASSIFICATION (OpenAI GPT-4o-mini)
**File:** `lib/speaker-role-classifier.ts`
**Model:** `gpt-4o-mini`
**Cost:** Minimal
**Purpose:** Classify speakers as host, guest, moderator, etc.

### Prompt:
```
You are analyzing a podcast or interview conversation.
Classify each speaker into the most likely conversational role and summarize why.
You MUST respond with a JSON array. Each object must include:
{ "speakerId": "...", "role": "one of roles", "displayName": "human friendly name", "confidence": 0-1, "summary": "...", "evidence": ["short quotes"] }

Allowed roles: host, co_host, guest, interviewer, moderator, panelist, narrator, storyteller, ad_reader, sponsor_voice, promo_voice, call_to_action, expert_commentator, audience_question, unknown. If none apply, use "unknown".

Display names should be concise (e.g., "Primary Host", "Ad Read Voice", "Guest Expert").
Use evidence snippets actually spoken by that speaker.

Speakers:
Speaker 1 (id: ${summary.id}, duration: ${summary.duration}s, segments: ${summary.segmentCount})
${summary.sample}
---
Speaker 2 (id: ${summary.id}, duration: ${summary.duration}s, segments: ${summary.segmentCount})
${summary.sample}
---

Conversation context snippet:
${transcriptSnippet}
```

**Parameters:**
- Temperature: 0.2 (low for consistent classification)
- Max tokens: 900

---

## Summary of AI Usage

| Feature | Model | Cost/Unit | Automatic | Manual |
|---------|-------|-----------|-----------|---------|
| **Insight Extraction** | Claude Haiku 3.5 | ~$0.02 | ✅ | ❌ |
| **Research Links** | Perplexity Sonar Pro | ~$0.004 | ✅ | ❌ |
| **Content Generation** | Claude Sonnet 3.5 | $0.015-$0.08 | ❌ | ✅ |
| **Narrative Coverage** | Claude Sonnet 4.5 | ~$0.02-$0.04 | ❌ | ✅ |
| **Name Extraction** | GPT-4o-mini | ~$0.001 | ✅ | ❌ |
| **Role Classification** | GPT-4o-mini | ~$0.001 | ✅ | ❌ |

**Total Automatic Cost per Podcast:** ~$0.03-$0.04
**Optional Manual Features:** Content Generation + Narrative Coverage

---

## Optimization Recommendations

1. **Insight Extraction**: Consider reducing from 10-15 to 8-12 insights to save tokens
2. **Perplexity**: Currently enriches top 5 insights - could reduce to top 3
3. **Content Generation**: Truncates transcript at 15,000 chars - could reduce if patterns emerge
4. **Narrative Coverage**: Manual feature with good cost control
5. **Name Extraction**: Multi-pass strategy is efficient - only runs additional passes if needed

---

*Last Updated: 2025-01-14*
