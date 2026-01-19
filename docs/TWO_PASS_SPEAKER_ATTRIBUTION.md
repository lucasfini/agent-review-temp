# Two-Pass Speaker Attribution System

## Overview

A robust speaker attribution system that eliminates false speakers (locations, networks, shows) and consolidates fragmented speaker identities.

## Architecture

```
Audio File
    ↓
AssemblyAI Diarization (Speaker_A, Speaker_B, Speaker_C...)
    ↓
┌─────────────────────────────────────────────────────────┐
│ PASS 1: SPEAKER INTELLIGENCE (GPT-4o)                   │
│ - Identify real human speakers                          │
│ - Consolidate aliases (Alice, Alice Fraser → Alice F.)  │
│ - Assign roles (Host, Guest, Advertiser, etc.)          │
│ - Quality checks (no locations/networks/shows)          │
└─────────────────────────────────────────────────────────┘
    ↓
Known Speakers:
  - speaker_1: Jessica Tarlov (Host)
  - speaker_2: Harold Ford Jr. (Co-host)
  - speaker_3: Quoted Audio (Quoted Audio)
    ↓
┌─────────────────────────────────────────────────────────┐
│ PASS 2: TRANSCRIPT REASSIGNMENT (Claude)                │
│ - Map Speaker_A → speaker_1                             │
│ - Map Speaker_B → speaker_2                             │
│ - Map Speaker_C → speaker_3                             │
│ - Use conversational context                            │
│ - Merge fragmented speakers                             │
└─────────────────────────────────────────────────────────┘
    ↓
Final Output:
  - Clean speaker list
  - Fully reassigned transcript
  - Quality diagnostics
```

## Usage

### Basic Usage

```typescript
import { runTwoPassAttribution } from '@/lib/two-pass-speaker-attribution';

// After AssemblyAI diarization
const segments: SpeakerSegment[] = [...]; // from AssemblyAI

const result = await runTwoPassAttribution(segments, {
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  projectTitle: 'Raging Moderates Podcast'
});

// Check quality
if (!result.qualityPassed) {
  console.error('Quality issues:', result.qualityIssues);
}

// Use clean speakers and reassigned transcript
console.log('Speakers:', result.speakers);
console.log('Utterances:', result.utterances);
console.log('Stats:', result.stats);
```

### Integration with Existing Pipeline

```typescript
import { runTwoPassAttribution, convertToSpeakerSegments } from '@/lib/two-pass-speaker-attribution';

// After AssemblyAI transcription
const assemblyAIResult = await transcribeWithAssemblyAI(audioFilePath);

// Run two-pass attribution
const twoPassResult = await runTwoPassAttribution(
  assemblyAIResult.speaker_segments!,
  {
    projectTitle: projectTitle,
    userId: userId,
    projectId: projectId
  }
);

// Convert back to existing format
const { segments, speakers } = convertToSpeakerSegments(twoPassResult);

// Save to database
await supabase.from('projects').update({
  speaker_data: {
    segments,
    speakers,
    detectionMetadata: {
      totalSpeakers: twoPassResult.stats.finalSpeakerCount,
      totalSegments: segments.length,
      processedAt: new Date().toISOString(),
      twoPassAttribution: true,
      qualityPassed: twoPassResult.qualityPassed
    }
  }
});
```

## Speaker Roles

The system uses these **strict** speaker roles:

| Role | Description | Examples |
|------|-------------|----------|
| `Host` | Primary podcast host | Main presenter, show lead |
| `Co-host` | Secondary host | Regular co-presenter |
| `Guest` | Invited guest speaker | Interview subject, expert |
| `Narrator` | Narration voice | Storyteller, voiceover |
| `Advertiser` | Advertisement voice | Sponsor reads, promo content |
| `Quoted Audio` | Archival/quoted clips | News clips, montages, speeches |

## Quality Rules

The system **rejects** output if:

### ❌ Invalid Speaker Names
- **Locations**: New York, Los Angeles, New Jersey, Boston
- **Networks**: NBC, CNN, Fox News, BBC, NPR
- **Show Titles**: Pod Save America, The Daily Show, The Bugle
- **Venues**: Leicester Square Theatre, Madison Square Garden
- **Companies**: Microsoft, Apple, Google

### ❌ Duplicate Speakers
- Same human appears under multiple speaker IDs
- Example: "Alice Fraser" as speaker_1 AND speaker_2

### ❌ Misclassified Roles
- Ad reads labeled as "Host" or "Guest"
- Host dialogue labeled as "Advertiser"

## Output Format

### Speakers
```typescript
interface IntelligentSpeaker {
  id: string;               // "speaker_1"
  name: string;             // "Jessica Tarlov"
  role: SpeakerRole;        // "Host"
  confidence: number;       // 0.95
  aliases?: string[];       // ["Jessica", "Tarlov"]
  evidence: string[];       // Quotes supporting identification
}
```

### Reassigned Utterances
```typescript
interface ReassignedUtterance {
  originalSpeakerId: string;    // "Speaker_A" (from AssemblyAI)
  assignedSpeakerId: string;    // "speaker_1" (from Pass 1)
  assignedSpeakerName: string;  // "Jessica Tarlov"
  text: string;
  start: number;
  end: number;
  confidence: number;           // 0.9 (high) or 0.6 (ambiguous)
  reassignmentReason?: string;  // "Ambiguous assignment"
}
```

### Statistics
```typescript
stats: {
  originalSpeakerCount: 8,      // AssemblyAI detected 8 speakers
  finalSpeakerCount: 3,         // Actually 3 real speakers
  speakersConsolidated: 5,      // 5 speakers merged
  totalUtterances: 234,
  ambiguousAssignments: 12      // 12 uncertain assignments
}
```

## Diagnostics

The system provides detailed diagnostics for debugging:

```typescript
diagnostics: {
  pass1: [
    "Consolidated 'Alice' and 'Alice Fraser' into speaker_1",
    "Identified Speaker_C as ad read content → Advertiser"
  ],
  pass2: [
    "Ambiguous: Segment 45 could be Host or Co-host, assigned to Host based on question pattern",
    "Speaker_A and Speaker_F merged into speaker_1 based on conversational flow"
  ]
}
```

## Error Handling

### Pass 1 Failure (GPT)
If GPT fails, the system **throws an error** and stops processing.

### Pass 2 Failure (Claude)
If Claude fails, the system creates a **fallback 1:1 mapping**:
- Speaker_A → speaker_1
- Speaker_B → speaker_2
- etc.

### Quality Check Failure
If quality checks fail, the system returns the speakers but marks `qualityPassed: false`.

## Configuration

### Environment Variables
```bash
OPENAI_API_KEY=sk-...        # Required for Pass 1
ANTHROPIC_API_KEY=sk-...     # Required for Pass 2
```

### Optional Parameters
```typescript
{
  gptModel: 'gpt-4o',          // Default: gpt-4o
  claudeModel: 'claude-3-5-sonnet-20241022',
  projectTitle: 'Podcast Name' // Helps GPT with context
}
```

## Performance

### Pass 1 (GPT)
- **Time**: 5-15 seconds
- **Cost**: $0.01-0.05 per transcript
- **Token usage**: ~3,000-8,000 tokens

### Pass 2 (Claude)
- **Time**: 10-30 seconds
- **Cost**: $0.02-0.10 per transcript
- **Token usage**: ~5,000-15,000 tokens

### Total
- **Time**: 15-45 seconds for typical 1-hour podcast
- **Cost**: $0.03-0.15 per transcript

## Examples

### Example 1: Simple Podcast
**Input** (AssemblyAI):
- Speaker_A (80 utterances)
- Speaker_B (65 utterances)

**Output**:
```json
{
  "speakers": [
    {
      "id": "speaker_1",
      "name": "Sarah Mitchell",
      "role": "Host",
      "confidence": 0.95
    },
    {
      "id": "speaker_2",
      "name": "Dr. James Chen",
      "role": "Guest",
      "confidence": 0.92
    }
  ],
  "stats": {
    "originalSpeakerCount": 2,
    "finalSpeakerCount": 2,
    "speakersConsolidated": 0
  }
}
```

### Example 2: Complex Podcast with Ads
**Input** (AssemblyAI):
- Speaker_A (90 utterances) → Jessica Tarlov (Host)
- Speaker_B (75 utterances) → Harold Ford Jr. (Co-host)
- Speaker_C (5 utterances) → Ad read
- Speaker_D (3 utterances) → Quoted news clip
- Speaker_E (2 utterances) → Quoted news clip
- Speaker_F (80 utterances) → Jessica Tarlov (same as A, fragmented)

**Output**:
```json
{
  "speakers": [
    {
      "id": "speaker_1",
      "name": "Jessica Tarlov",
      "role": "Host",
      "confidence": 0.96,
      "aliases": ["Jessica", "Tarlov"]
    },
    {
      "id": "speaker_2",
      "name": "Harold Ford Jr.",
      "role": "Co-host",
      "confidence": 0.94
    },
    {
      "id": "speaker_3",
      "name": "Advertiser",
      "role": "Advertiser",
      "confidence": 0.90
    },
    {
      "id": "speaker_4",
      "name": "Quoted Audio",
      "role": "Quoted Audio",
      "confidence": 0.88
    }
  ],
  "stats": {
    "originalSpeakerCount": 6,
    "finalSpeakerCount": 4,
    "speakersConsolidated": 2
  }
}
```

**Reassignments**:
- Speaker_A → speaker_1 (Jessica Tarlov)
- Speaker_B → speaker_2 (Harold Ford Jr.)
- Speaker_C → speaker_3 (Advertiser)
- Speaker_D → speaker_4 (Quoted Audio)
- Speaker_E → speaker_4 (Quoted Audio) - merged
- Speaker_F → speaker_1 (Jessica Tarlov) - consolidated

## Testing

```typescript
// Test with sample transcript
import { runTwoPassAttribution } from '@/lib/two-pass-speaker-attribution';

const testSegments = [
  { speakerId: 'Speaker_A', text: "Welcome to Raging Moderates, I'm Jessica Tarlov", startTime: 0, endTime: 3 },
  { speakerId: 'Speaker_B', text: "And I'm Harold Ford Jr.", startTime: 3, endTime: 5 },
  { speakerId: 'Speaker_A', text: "Today we're discussing...", startTime: 5, endTime: 8 },
  { speakerId: 'Speaker_C', text: "This episode is brought to you by...", startTime: 60, endTime: 75 }
];

const result = await runTwoPassAttribution(testSegments);
console.log('Quality passed:', result.qualityPassed);
console.log('Speakers:', result.speakers);
```

## Troubleshooting

### Issue: GPT returns locations as speakers
**Solution**: Check quality issues in result. System should auto-reject these.

### Issue: Same person appears multiple times
**Solution**: Pass 1 should consolidate. Check diagnostics for consolidation notes.

### Issue: High ambiguous assignments (>30%)
**Solution**: May indicate poor transcript quality or unclear speaker patterns.

### Issue: Ad reads labeled as Host
**Solution**: Quality checks should flag this. Review evidence quotes.

## Best Practices

1. **Always check `qualityPassed`** before using results
2. **Review diagnostics** for ambiguous decisions
3. **Monitor consolidation stats** - high consolidation may indicate diarization issues
4. **Provide project title** for better GPT context
5. **Handle errors gracefully** - fallback to basic attribution if needed

## API Reference

See:
- `lib/speaker-intelligence.ts` - Pass 1 (GPT)
- `lib/transcript-reassignment.ts` - Pass 2 (Claude)
- `lib/two-pass-speaker-attribution.ts` - Orchestrator
