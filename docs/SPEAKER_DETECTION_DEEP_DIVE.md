# Speaker Detection, Named Speakers & Roles - Complete Deep Dive

## Table of Contents
1. [Overview](#overview)
2. [The Complete Pipeline](#the-complete-pipeline)
3. [Phase 1: Speaker Diarization (AssemblyAI)](#phase-1-speaker-diarization-assemblyai)
4. [Phase 2: Speaker Grouping](#phase-2-speaker-grouping)
5. [Phase 3: Speaker Name Extraction](#phase-3-speaker-name-extraction)
6. [Phase 4: Speaker Role Classification](#phase-4-speaker-role-classification-premium)
7. [Data Flow & Storage](#data-flow--storage)
8. [Tier-Based Features](#tier-based-features)
9. [Cost Breakdown](#cost-breakdown)
10. [Example Output](#example-output)

---

## Overview

Your system uses a **multi-stage AI pipeline** to transform raw audio into richly-attributed conversation data. The process goes from anonymous speaker IDs → real names → contextual roles.

**Key Technologies:**
- **AssemblyAI**: Cloud-based transcription + speaker diarization
- **Claude Sonnet 4.5**: Speaker name extraction (Pro+)
- **Claude Sonnet 4.5**: Role classification (Premium)
- **OpenAI GPT-4**: Fallback for role classification

---

## The Complete Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. AUDIO UPLOAD                                                         │
│    User uploads podcast/audio file → Stored in memory                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. SPEAKER DIARIZATION (AssemblyAI)                                     │
│    • Transcribes audio to text                                          │
│    • Detects unique speakers (Speaker A, B, C, etc.)                    │
│    • Creates timestamped segments per speaker                           │
│    • Returns: Raw transcript + speaker segments                         │
│                                                                          │
│    Output: "Speaker_A", "Speaker_B", "Speaker_C" with timestamps        │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. SPEAKER GROUPING                                                     │
│    • Groups segments by speaker ID                                      │
│    • Calculates total speaking time per speaker                         │
│    • Counts segment frequency                                           │
│    • Creates DetectedSpeaker objects                                    │
│                                                                          │
│    Output: Speaker metadata (duration, segment count)                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 4A. ROSTER MATCHING (Optional - Pro+)                                   │
│     If user provided preset speakers:                                   │
│     • Match detected speakers to roster entries                         │
│     • Use AI + heuristics (speaking time, introductions, keywords)      │
│     • Assign pre-defined names and roles                                │
│                                                                          │
│     Skip to Phase 5 if roster match succeeds                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 4B. NAME EXTRACTION (Pro+ if no roster)                                 │
│     • Analyze transcript with Claude Sonnet 4.5                         │
│     • Identify self-introductions: "My name is Jane Doe"                │
│     • Identify third-party intros: "Today we're joined by John Smith"   │
│     • Identify direct address: "John, what do you think?"               │
│     • Extract confidence scores for each name                           │
│     • Map extracted names to speaker IDs                                │
│                                                                          │
│     Fallback: "Speaker 1", "Speaker 2" (Basic tier)                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. ROLE CLASSIFICATION (Premium Only)                                   │
│    • Analyze speaker patterns with Claude Sonnet 4.5 / OpenAI GPT-4     │
│    • Classify into roles: host, guest, interviewer, narrator, etc.      │
│    • Generate role summary with evidence                                │
│    • Assign display names: "Primary Host", "Guest Expert"               │
│    • Calculate confidence scores                                        │
│                                                                          │
│    Example: "Lucas → Host (confidence: 0.95)"                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. FINAL OUTPUT                                                         │
│    • Database storage with full speaker metadata                        │
│    • Display in UI with names, roles, timestamps                        │
│    • Enable conversation view, Teams-style transcript, etc.             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Speaker Diarization (AssemblyAI)

### What It Does
AssemblyAI performs **automatic speaker diarization** - the process of partitioning audio into segments based on who is speaking.

### Technical Implementation

**File:** `/lib/assemblyai-integration.ts`

**Process:**
1. Audio file uploaded to AssemblyAI
2. API processes with `speaker_labels: true` parameter
3. Returns:
   - Full transcript text
   - Utterances (speaker segments with timestamps)
   - Words with speaker attribution
   - Confidence scores

**API Request:**
```typescript
const transcript = await client.transcripts.transcribe({
  audio: audioFilePath,
  speaker_labels: true,       // Enable speaker diarization
  language_code: 'en',
  // Optional: auto_highlights, auto_chapters, entity_detection
});
```

**Raw Output Example:**
```javascript
{
  text: "Hi, I'm Lucas. Welcome to the show. Thanks for having me, Lucas...",
  utterances: [
    {
      speaker: "A",
      text: "Hi, I'm Lucas. Welcome to the show.",
      start: 0,      // milliseconds
      end: 3500,
      confidence: 0.95
    },
    {
      speaker: "B",
      text: "Thanks for having me, Lucas.",
      start: 3600,
      end: 5200,
      confidence: 0.92
    }
  ]
}
```

### Data Transformation

**File:** `/lib/assemblyai-integration.ts:179-249`

AssemblyAI output is converted to your internal format:

```typescript
// Convert utterances to SpeakerSegment[]
const speakerSegments: SpeakerSegment[] = transcript.utterances.map(utterance => ({
  speakerId: `Speaker_${utterance.speaker}`,  // "Speaker_A", "Speaker_B"
  startTime: utterance.start / 1000,          // Convert ms to seconds
  endTime: utterance.end / 1000,
  text: utterance.text,
  confidence: utterance.confidence
}));
```

**Output:**
```javascript
[
  {
    speakerId: "Speaker_A",
    startTime: 0,
    endTime: 3.5,
    text: "Hi, I'm Lucas. Welcome to the show.",
    confidence: 0.95
  },
  {
    speakerId: "Speaker_B",
    startTime: 3.6,
    endTime: 5.2,
    text: "Thanks for having me, Lucas.",
    confidence: 0.92
  }
]
```

### Key Characteristics
- **Speed**: ~2 minutes for a 2-hour podcast
- **Accuracy**: 97%+ speaker separation
- **Cost**: $0.27 per audio hour (includes transcription + diarization)
- **Speaker Limit**: Handles 2-10+ speakers automatically
- **No Training Required**: Zero-shot speaker detection

---

## Phase 2: Speaker Grouping

### What It Does
Organizes raw speaker segments into speaker profiles with metadata.

### Technical Implementation

**File:** `/lib/speaker-utils.ts:7-29`

```typescript
export function groupSegmentsBySpeaker(
  segments: SpeakerSegment[]
): Record<string, DetectedSpeaker> {
  const speakers: Record<string, DetectedSpeaker> = {};

  for (const segment of segments) {
    if (!speakers[segment.speakerId]) {
      speakers[segment.speakerId] = {
        id: segment.speakerId,
        segments: [],
        totalDuration: 0,
        segmentCount: 0,
        fallbackName: segment.speakerId  // "Speaker_A"
      };
    }

    speakers[segment.speakerId].segments.push(segment);
    speakers[segment.speakerId].totalDuration += segment.endTime - segment.startTime;
    speakers[segment.speakerId].segmentCount++;
  }

  return speakers;
}
```

### Output Structure

```javascript
{
  "Speaker_A": {
    id: "Speaker_A",
    segments: [/* array of all segments */],
    totalDuration: 1847.3,     // seconds (30+ minutes)
    segmentCount: 156,         // spoke 156 times
    fallbackName: "Speaker_A"
  },
  "Speaker_B": {
    id: "Speaker_B",
    segments: [/* array of all segments */],
    totalDuration: 1203.8,     // seconds (20 minutes)
    segmentCount: 89,
    fallbackName: "Speaker_B"
  }
}
```

### Why This Matters
- **Speaking Time Analysis**: Identify dominant speakers (likely hosts)
- **Segment Frequency**: Understand conversation dynamics
- **Name Extraction Context**: Provides samples for AI analysis
- **Role Classification Input**: Duration and pattern inform role detection

---

## Phase 3: Speaker Name Extraction

### What It Does
Uses AI to identify real speaker names from the transcript.

### Technical Implementation

**File:** `/lib/name-extraction.ts:50-187`

### Priority 1: Roster Matching (Optional)

**File:** `/lib/speaker-roster-matcher.ts`

If user provides preset speakers:

```typescript
const rosterSpeakers = [
  { id: "1", name: "Lucas Finiello", role: "host", priority: 1 },
  { id: "2", name: "John Smith", role: "guest", priority: 2 }
];
```

**Matching Strategy:**
1. **Self-Introduction**: "My name is Lucas" → Match to Lucas Finiello
2. **Speaking Time**: Longest speaker → Likely host (Lucas)
3. **Direct Address**: "John, what do you think?" → Match to John Smith
4. **Keyword Frequency**: Name mentions in transcript
5. **Speaker Order**: First speaker often host

**Output:**
```javascript
{
  "Speaker_A": {
    finalName: "Lucas Finiello",
    role: "host",
    rosterMatched: true,
    rosterMatchMethod: "self_intro",
    rosterMatchConfidence: 0.95
  },
  "Speaker_B": {
    finalName: "John Smith",
    role: "guest",
    rosterMatched: true,
    rosterMatchMethod: "speaking_time",
    rosterMatchConfidence: 0.88
  }
}
```

### Priority 2: AI Name Extraction (Fallback)

**File:** `/lib/name-extraction.ts:192-333`

**Model:** Claude Sonnet 4.5 (`claude-3-5-sonnet-latest`)

**Prompt Configuration:** `/config/prompts.json:84-94`

**Prompt Strategy:**
```
Analyze the following transcript and extract the names of the speakers.

Focus on these patterns:
- Self-introductions (e.g., "My name is Jane Doe", "I'm John").
- Introductions by others (e.g., "Today we're joined by Jane Doe", "Welcome, John").
- Direct address (e.g., "John, what are your thoughts?", "That's a great point, Jane").

Rules:
1. Only extract names of people who are actively part of the conversation.
2. Do NOT extract names of people who are only mentioned but not speaking.
3. Extract the most complete name available (e.g., "Jane Doe" instead of just "Jane").
4. Do not invent or infer parts of a name.
5. Return a unique list of names.

Return ONLY a JSON array of strings. If no names can be confidently identified, return an empty array `[]`.

Transcript (first 4000 characters):
[TRANSCRIPT SNIPPET]
```

**API Call:**
```typescript
const response = await getAICompletion({
  model: 'claude-3-5-sonnet-latest',
  messages: [
    { role: 'system', content: 'You are an expert in analyzing transcripts to identify speakers...' },
    { role: 'user', content: prompt }
  ],
  temperature: 0.1,  // Low temperature for deterministic output
  maxTokens: 1000
});
```

**Example AI Response:**
```json
["Lucas Finiello", "John Smith"]
```

### Name-to-Speaker Mapping

**Challenge:** AI returns names, but doesn't know which speaker ID maps to which name.

**Solution:** Heuristic matching based on:
1. **First Mention**: Find where each name first appears in transcript
2. **Proximity**: Match to speaker segment closest in time
3. **Frequency**: Prefer speakers mentioned more often
4. **Context**: Use surrounding speaker segments

**File:** `/lib/name-extraction.ts:250-450` (simplified example)

```typescript
async function extractNamesFromSegments(
  segments: SpeakerSegment[],
  transcript: string
): Promise<Map<string, ExtractedName>> {
  // 1. Get names from AI
  const extractedNames = await identifyNamesWithAI(transcript);
  // Returns: ["Lucas Finiello", "John Smith"]

  // 2. Map names to speaker IDs
  const nameMap = new Map();

  for (const name of extractedNames) {
    // Find where this name appears in transcript
    const mentionIndex = transcript.indexOf(name);

    // Find which speaker segment contains this mention
    let cumulativeLength = 0;
    for (const segment of segments) {
      cumulativeLength += segment.text.length;
      if (cumulativeLength >= mentionIndex) {
        nameMap.set(segment.speakerId, {
          name: name,
          confidence: 0.85,
          firstMentionTime: segment.startTime,
          context: segment.text
        });
        break;
      }
    }
  }

  return nameMap;
}
```

### Priority 3: Fallback Names

If AI extraction fails or no names found:

```typescript
function generateFallbackName(speaker: DetectedSpeaker, index: number, totalSpeakers: number): string {
  if (totalSpeakers === 2) {
    // Classic 2-person podcast
    return index === 0 ? 'Host' : 'Guest';
  } else {
    // Multi-speaker format
    return `Speaker ${index + 1}`;
  }
}
```

**Output Examples:**
- **2 speakers**: "Host", "Guest"
- **3+ speakers**: "Speaker 1", "Speaker 2", "Speaker 3"

### Final Named Speaker Structure

```typescript
interface NamedSpeaker {
  id: string;                        // "Speaker_A"
  segments: SpeakerSegment[];        // All segments
  totalDuration: number;             // Total speaking time
  segmentCount: number;              // Number of turns
  fallbackName: string;              // "Speaker_A" (original)

  // Name extraction results
  extractedName: ExtractedName | null;  // AI-extracted name data
  finalName: string;                    // Display name (AI or fallback)

  // Roster matching (if applicable)
  rosterMatched?: boolean;
  rosterMatchMethod?: string;
  rosterMatchConfidence?: number;

  // Custom user edits
  customName?: string;               // User can rename
}
```

**Example Output:**
```javascript
{
  "Speaker_A": {
    id: "Speaker_A",
    segments: [/* ... */],
    totalDuration: 1847.3,
    segmentCount: 156,
    fallbackName: "Speaker_A",
    extractedName: {
      name: "Lucas Finiello",
      fullName: "Lucas Finiello",
      nicknames: [],
      firstMentionTime: 12.5,
      confidence: 0.92,
      context: "Hi, I'm Lucas Finiello and welcome to the show."
    },
    finalName: "Lucas Finiello",
    rosterMatched: false
  }
}
```

---

## Phase 4: Speaker Role Classification (Premium)

### What It Does
Analyzes speaker behavior to assign conversational roles (host, guest, interviewer, etc.).

### Technical Implementation

**File:** `/lib/speaker-role-classifier.ts:42-200`

**Models:**
- Primary: OpenAI GPT-4 (`gpt-4o`)
- Alternative: Claude Sonnet 4.5

**When It Runs:** Premium tier only, after name extraction

### Available Roles

```typescript
const ROLE_OPTIONS = [
  'host',              // Primary host
  'co_host',           // Co-host
  'guest',             // Interview guest
  'interviewer',       // Person asking questions
  'moderator',         // Panel moderator
  'panelist',          // Panel participant
  'narrator',          // Story narrator
  'storyteller',       // Story contributor
  'ad_reader',         // Advertisement voice
  'sponsor_voice',     // Sponsor message
  'promo_voice',       // Promo/trailer voice
  'call_to_action',    // CTA voice
  'expert_commentator',// Expert commentary
  'audience_question', // Audience member
  'unknown'            // Unclear role
];
```

### Input to AI

**Speaker Summaries:**
```typescript
const speakerSummaries = [
  {
    id: "Speaker_A",
    fallbackName: "Lucas Finiello",
    duration: 1847.3,        // 30+ minutes
    segmentCount: 156,
    sample: "Hi, I'm Lucas Finiello and welcome to the show. Today we're discussing... Let me ask you, John... That's fascinating. Let's dive deeper into that..."
  },
  {
    id: "Speaker_B",
    fallbackName: "John Smith",
    duration: 1203.8,        // 20 minutes
    segmentCount: 89,
    sample: "Thanks for having me, Lucas. Well, I think the key issue is... In my research, we found... That's a great question..."
  }
];
```

**AI Prompt:**
```
You are analyzing a podcast or interview conversation.
Classify each speaker into the most likely conversational role and summarize why.

Allowed roles: host, co_host, guest, interviewer, moderator, panelist, narrator,
storyteller, ad_reader, sponsor_voice, promo_voice, call_to_action,
expert_commentator, audience_question, unknown.

Return JSON array:
[
  {
    "speakerId": "Speaker_A",
    "role": "host",
    "displayName": "Primary Host",
    "confidence": 0.95,
    "summary": "Guides conversation, introduces guest, asks questions consistently",
    "evidence": [
      "Welcome to the show",
      "Let me ask you",
      "That's fascinating"
    ]
  },
  {
    "speakerId": "Speaker_B",
    "role": "guest",
    "displayName": "Guest Expert",
    "confidence": 0.92,
    "summary": "Provides expertise, responds to questions, shares research findings",
    "evidence": [
      "Thanks for having me",
      "In my research",
      "That's a great question"
    ]
  }
]

Speakers:
Speaker 1 (id: Speaker_A, duration: 1847.3s, segments: 156)
Hi, I'm Lucas Finiello and welcome to the show. Today we're discussing...
---
Speaker 2 (id: Speaker_B, duration: 1203.8s, segments: 89)
Thanks for having me, Lucas. Well, I think the key issue is...
---

Conversation context snippet:
[First 1200 characters of transcript]
```

### AI Analysis Factors

The AI considers:

1. **Speaking Patterns**:
   - Host: Asks questions, transitions topics, does intros/outros
   - Guest: Answers questions, provides expertise
   - Interviewer: Primarily asks questions, minimal self-disclosure

2. **Duration & Frequency**:
   - Host: Often speaks most (but not always)
   - Guest: Typically 30-70% of total time
   - Ad Reader: Short, isolated segments

3. **Linguistic Markers**:
   - Host: "Welcome", "Today we're", "Let's talk about"
   - Guest: "Thanks for having me", "In my experience"
   - Narrator: "Once upon a time", storytelling language

4. **Conversation Flow**:
   - Host: Controls pacing, introduces new topics
   - Guest: Responds to prompts, elaborates
   - Moderator: Manages multiple speakers, keeps order

### API Call

```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  temperature: 0.2,  // Low temperature for consistency
  max_tokens: 900,
  messages: [
    {
      role: 'system',
      content: 'You are a precise analyst that strictly returns valid JSON objects describing speaker roles.'
    },
    {
      role: 'user',
      content: [prompt with speaker data]
    }
  ]
});
```

### Output Processing

**File:** `/lib/speaker-role-classifier.ts:140-180`

```typescript
const raw = response.choices[0]?.message?.content || '{}';
const parsed = JSON.parse(raw);

const classifications: Record<string, SpeakerRoleClassification> = {};

parsed.speakers.forEach((item) => {
  const speakerId = item.speakerId;
  const role = normalizeRole(item.role);  // Validate against ROLE_OPTIONS

  classifications[speakerId] = {
    speakerId,
    role,
    displayName: item.displayName || role.replace(/_/g, ' '),
    confidence: item.confidence || 0.7,
    summary: item.summary || '',
    evidence: item.evidence || []
  };
});
```

**Example Output:**
```javascript
{
  "Speaker_A": {
    speakerId: "Speaker_A",
    role: "host",
    displayName: "Primary Host",
    confidence: 0.95,
    summary: "Guides conversation, introduces guest, asks questions consistently",
    evidence: [
      "Welcome to the show",
      "Let me ask you, John",
      "That's fascinating. Let's dive deeper"
    ]
  },
  "Speaker_B": {
    speakerId: "Speaker_B",
    role: "guest",
    displayName: "Guest Expert",
    confidence: 0.92,
    summary: "Provides expertise, responds to questions, shares research findings",
    evidence: [
      "Thanks for having me, Lucas",
      "In my research, we found",
      "That's a great question"
    ]
  }
}
```

### Integration with Named Speakers

**File:** `/app/api/transcribe/route.ts:498-506`

```typescript
for (const [speakerId, assignment] of Object.entries(roleAssignments)) {
  speakersWithNames[speakerId].role = assignment.role;
  speakersWithNames[speakerId].roleConfidence = assignment.confidence;
  speakersWithNames[speakerId].roleSummary = assignment.summary;
  speakersWithNames[speakerId].roleEvidence = assignment.evidence;
  speakersWithNames[speakerId].autoRoleAssigned = true;

  // Optionally override display name
  speakersWithNames[speakerId].finalName = assignment.displayName || speakersWithNames[speakerId].finalName;
}
```

---

## Data Flow & Storage

### Processing Pipeline

**File:** `/app/api/transcribe/route.ts:68-650`

```
1. Upload Audio → In-memory storage
2. Transcribe with AssemblyAI → Get segments
3. Group segments → Speaker metadata
4. Cache base transcription (if fingerprinted)
5. Pro+: Extract speaker names
6. Premium: Classify speaker roles
7. Premium: Generate summary, chapters, takeaways, quotes
8. Save to database
9. Clean up temporary files
```

### Database Schema

**Table:** `projects`

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,

  -- Audio metadata
  audio_duration FLOAT,              -- seconds
  audio_file_size BIGINT,            -- bytes
  audio_file_name TEXT,

  -- Transcription data
  transcription_text TEXT,           -- Full transcript
  transcription_segments JSONB,     -- AssemblyAI segments with timestamps

  -- Speaker data (CRITICAL)
  speaker_data JSONB,                -- Full speaker structure

  -- Tier-based AI features
  performance_level TEXT,            -- 'basic' | 'pro' | 'premium'
  ai_summary TEXT,                   -- Pro+
  chapters JSONB,                    -- Premium: [{title, start_time, end_time, description}]
  key_takeaways JSONB,               -- Premium: [{takeaway, timestamp}]
  social_quotes JSONB,               -- Premium: [{quote, speaker, timestamp}]

  -- Cost tracking
  estimated_cost DECIMAL,
  actual_processing_cost DECIMAL,
  cost_breakdown JSONB
);
```

### Speaker Data Structure (JSON)

**Column:** `speaker_data`

```json
{
  "segments": [
    {
      "speakerId": "Speaker_A",
      "startTime": 0,
      "endTime": 3.5,
      "text": "Hi, I'm Lucas Finiello and welcome to the show.",
      "confidence": 0.95
    },
    {
      "speakerId": "Speaker_B",
      "startTime": 3.6,
      "endTime": 5.2,
      "text": "Thanks for having me, Lucas.",
      "confidence": 0.92
    }
  ],
  "speakers": {
    "Speaker_A": {
      "id": "Speaker_A",
      "segments": [/* references to segments */],
      "totalDuration": 1847.3,
      "segmentCount": 156,
      "fallbackName": "Speaker_A",

      "extractedName": {
        "name": "Lucas Finiello",
        "fullName": "Lucas Finiello",
        "nicknames": [],
        "firstMentionTime": 0,
        "confidence": 0.95,
        "context": "Hi, I'm Lucas Finiello and welcome to the show."
      },
      "finalName": "Lucas Finiello",

      "role": "host",
      "roleConfidence": 0.95,
      "roleSummary": "Guides conversation, introduces guest, asks questions",
      "roleEvidence": ["Welcome to the show", "Let me ask you"],
      "autoRoleAssigned": true,

      "rosterMatched": false
    },
    "Speaker_B": {
      "id": "Speaker_B",
      "totalDuration": 1203.8,
      "segmentCount": 89,
      "fallbackName": "Speaker_B",

      "extractedName": {
        "name": "John Smith",
        "confidence": 0.88,
        "context": "Thanks for having me, Lucas."
      },
      "finalName": "John Smith",

      "role": "guest",
      "roleConfidence": 0.92,
      "roleSummary": "Provides expertise, responds to questions",
      "roleEvidence": ["Thanks for having me", "In my research"],
      "autoRoleAssigned": true
    }
  },
  "detectionMetadata": {
    "method": "assemblyai",
    "totalSpeakers": 2,
    "totalSegments": 245,
    "processedAt": "2025-12-15T10:30:00Z",
    "audio_duration": 3051.1,
    "processing_time": 127.3,
    "confidence": 0.94
  }
}
```

---

## Tier-Based Features

### Basic Tier

**Price:** ~$0.37 per audio hour

**Features:**
- ✅ AssemblyAI transcription
- ✅ Speaker diarization (segments)
- ✅ Numbered speaker labels ("Speaker 1", "Speaker 2")
- ❌ No AI name extraction
- ❌ No role classification

**Speaker Display:**
```
Speaker 1 0 minutes 0 seconds
Hi, I'm Lucas Finiello and welcome to the show.

Speaker 2 0 minutes 3 seconds
Thanks for having me, Lucas.
```

### Pro Tier

**Price:** ~$0.40-0.45 per audio hour

**Features:**
- ✅ Everything in Basic
- ✅ **AI speaker name extraction** (Claude Sonnet 4.5)
- ✅ **AI-generated summary**
- ✅ Speaker roster matching (optional)
- ❌ No role classification

**Speaker Display:**
```
Lucas Finiello 0 minutes 0 seconds
Hi, I'm Lucas Finiello and welcome to the show.

John Smith 0 minutes 3 seconds
Thanks for having me, Lucas.
```

### Premium Tier

**Price:** ~$0.50-0.60 per audio hour

**Features:**
- ✅ Everything in Pro
- ✅ **Speaker role classification** (host, guest, etc.)
- ✅ **Role badges with confidence**
- ✅ **Chapters** (timestamped topic boundaries)
- ✅ **Key takeaways** (actionable insights)
- ✅ **Social quotes** (shareable quotations)
- ✅ **Inline entity insights** (people, orgs, concepts)

**Speaker Display:**
```
Lucas Finiello, host 0 minutes 0 seconds
Hi, I'm Lucas Finiello and welcome to the show.

John Smith, guest 0 minutes 3 seconds
Thanks for having me, Lucas.
```

**UI Features:**
- Role badges with "AUTO" indicator
- Role summary on hover
- Evidence quotes
- Color-coded speaker avatars

---

## Cost Breakdown

### Processing Costs (1-hour podcast)

| Service | Tier | Cost | Details |
|---------|------|------|---------|
| **AssemblyAI** | All | $0.27 | Transcription + speaker diarization |
| **Name Extraction** | Pro+ | ~$0.03-0.05 | Claude Sonnet 4.5 (1k-2k tokens) |
| **AI Summary** | Pro+ | ~$0.05-0.08 | Claude Sonnet 4.5 (2k-3k tokens) |
| **Role Classification** | Premium | ~$0.03-0.05 | OpenAI GPT-4 (800-900 tokens) |
| **Chapters** | Premium | ~$0.05-0.08 | Claude Sonnet 4.5 |
| **Takeaways** | Premium | ~$0.03-0.05 | Claude Sonnet 4.5 |
| **Social Quotes** | Premium | ~$0.03-0.05 | Claude Sonnet 4.5 |

**Total Costs:**
- **Basic:** $0.37/hour
- **Pro:** $0.40-0.45/hour
- **Premium:** $0.50-0.60/hour

### Token Usage Estimates

**Name Extraction:**
- Input: ~1,500 tokens (first 4000 chars of transcript)
- Output: ~50-150 tokens (JSON array of names)
- Model: Claude Sonnet 4.5

**Role Classification:**
- Input: ~800 tokens (speaker samples + context)
- Output: ~100-200 tokens (JSON role assignments)
- Model: OpenAI GPT-4

**Caching Benefits:**
- Base transcription cached by audio fingerprint
- Cache hit = skip AssemblyAI ($0.27 saved)
- Still run AI enhancements for tier upgrades
- ~75% cost reduction on repeated processing

---

## Example Output

### Complete Speaker Data Example

**Scenario:** 2-person podcast (host + guest), 1 hour duration, Premium tier

**Input Audio:**
- Duration: 3,600 seconds (1 hour)
- Speakers: 2 (Host: Lucas Finiello, Guest: John Smith)
- Processing time: ~2 minutes

**Final Output:**

```json
{
  "segments": [
    {
      "speakerId": "Speaker_A",
      "startTime": 0,
      "endTime": 8.5,
      "text": "Hi everyone, I'm Lucas Finiello and welcome to another episode of Tech Insights. Today I'm joined by John Smith, a renowned AI researcher from Stanford.",
      "confidence": 0.96
    },
    {
      "speakerId": "Speaker_B",
      "startTime": 8.7,
      "endTime": 12.3,
      "text": "Thanks for having me, Lucas. It's great to be here.",
      "confidence": 0.94
    },
    {
      "speakerId": "Speaker_A",
      "startTime": 12.5,
      "endTime": 18.2,
      "text": "John, let's dive right in. Can you tell us about your latest research on transformer models?",
      "confidence": 0.95
    },
    {
      "speakerId": "Speaker_B",
      "startTime": 18.4,
      "endTime": 35.8,
      "text": "Absolutely. In my lab, we've been working on making transformers more efficient. The key insight is that we can reduce computational complexity by 40% without sacrificing accuracy.",
      "confidence": 0.93
    }
  ],
  "speakers": {
    "Speaker_A": {
      "id": "Speaker_A",
      "totalDuration": 2145.6,
      "segmentCount": 187,
      "fallbackName": "Speaker_A",

      "extractedName": {
        "name": "Lucas Finiello",
        "fullName": "Lucas Finiello",
        "nicknames": ["Lucas"],
        "firstMentionTime": 0,
        "confidence": 0.96,
        "context": "Hi everyone, I'm Lucas Finiello and welcome to another episode"
      },
      "finalName": "Lucas Finiello",

      "role": "host",
      "roleConfidence": 0.97,
      "roleSummary": "Primary host who introduces guest, guides conversation flow, asks probing questions, and manages episode structure",
      "roleEvidence": [
        "welcome to another episode",
        "Today I'm joined by",
        "let's dive right in",
        "Can you tell us about"
      ],
      "autoRoleAssigned": true,

      "rosterMatched": false
    },
    "Speaker_B": {
      "id": "Speaker_B",
      "totalDuration": 1454.4,
      "segmentCount": 134,
      "fallbackName": "Speaker_B",

      "extractedName": {
        "name": "John Smith",
        "fullName": "John Smith",
        "nicknames": ["John"],
        "firstMentionTime": 8.5,
        "confidence": 0.94,
        "context": "Today I'm joined by John Smith, a renowned AI researcher"
      },
      "finalName": "John Smith",

      "role": "guest",
      "roleConfidence": 0.95,
      "roleSummary": "Expert guest providing technical insights and research findings. Responds to host's questions with detailed explanations.",
      "roleEvidence": [
        "Thanks for having me",
        "In my lab, we've been working",
        "The key insight is",
        "we can reduce computational complexity"
      ],
      "autoRoleAssigned": true,

      "rosterMatched": false
    }
  },
  "detectionMetadata": {
    "method": "assemblyai",
    "totalSpeakers": 2,
    "totalSegments": 321,
    "processedAt": "2025-12-15T10:30:00Z",
    "audio_duration": 3600,
    "processing_time": 123.5,
    "confidence": 0.945,
    "language_code": "en"
  }
}
```

### Display in UI

**Teams-Style Transcript:**
```
Lucas Finiello, host 0 minutes 0 seconds
Hi everyone, I'm Lucas Finiello and welcome to another episode of Tech Insights.
Today I'm joined by John Smith, a renowned AI researcher from Stanford.

John Smith, guest 0 minutes 8 seconds
Thanks for having me, Lucas. It's great to be here.

Lucas Finiello, host 0 minutes 12 seconds
John, let's dive right in. Can you tell us about your latest research on
transformer models?

John Smith, guest 0 minutes 18 seconds
Absolutely. In my lab, we've been working on making transformers more efficient.
The key insight is that we can reduce computational complexity by 40% without
sacrificing accuracy.
```

**Conversation View:**
```
┌─────────────────────────────────────────────────────────────────┐
│ 👤 LF │ Lucas Finiello  [HOST] [AUTO]          00:00 • 8.5s    │
├─────────────────────────────────────────────────────────────────┤
│ Hi everyone, I'm Lucas Finiello and welcome to another episode  │
│ of Tech Insights. Today I'm joined by John Smith, a renowned AI │
│ researcher from Stanford.                                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 👤 JS │ John Smith  [GUEST] [AUTO]             00:08 • 3.6s    │
├─────────────────────────────────────────────────────────────────┤
│ Thanks for having me, Lucas. It's great to be here.             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary

### Pipeline at a Glance

1. **AssemblyAI** → Detects speakers, creates segments
2. **Grouping** → Aggregates metadata per speaker
3. **Roster Match / AI Extraction** → Identifies real names
4. **Role Classification** → Assigns conversational roles (Premium)
5. **Storage** → Saves enriched data to database
6. **Display** → Renders in Teams-style or Conversation view

### Key Strengths

✅ **Zero-shot speaker detection** - No training data required
✅ **High accuracy** - 97%+ speaker separation from AssemblyAI
✅ **Intelligent name extraction** - Claude Sonnet 4.5 pattern recognition
✅ **Contextual role assignment** - GPT-4 behavioral analysis
✅ **Cost-effective** - $0.37-0.60 per hour depending on tier
✅ **Tier-based features** - Pay only for what you need
✅ **Caching optimization** - 75% cost savings on re-processing

### Limitations

⚠️ **Name extraction depends on mentions** - If speakers never introduce themselves, falls back to numbered speakers
⚠️ **Role accuracy varies** - Works best for standard formats (interview, panel), struggles with unusual formats
⚠️ **2-10 speaker sweet spot** - Performance degrades with 15+ speakers
⚠️ **English-optimized** - Works best with English audio (AssemblyAI supports other languages but may have lower accuracy)

---

## File Reference

**Core Implementation:**
- `/lib/assemblyai-integration.ts` - Speaker diarization
- `/lib/speaker-utils.ts` - Speaker grouping
- `/lib/name-extraction.ts` - Name extraction (Pro+)
- `/lib/speaker-role-classifier.ts` - Role classification (Premium)
- `/lib/speaker-roster-matcher.ts` - Roster matching
- `/app/api/transcribe/route.ts` - Main processing pipeline
- `/config/prompts.json` - AI prompt configurations

**Display Components:**
- `/components/TeamsStyleTranscript.tsx` - Teams-style display
- `/components/ConversationView.tsx` - Conversation view with roles
- `/app/dashboard/projects/page.tsx` - Main UI

**Database:**
- `projects` table → `speaker_data` JSONB column

---

**Last Updated:** December 15, 2025
**Version:** 1.0
**Author:** AudioRepurpose Development Team
