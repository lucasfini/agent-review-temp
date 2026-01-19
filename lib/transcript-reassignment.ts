// Pass 2: Transcript Reassignment (Claude)
// Reassigns every transcript segment to correct speaker IDs from Pass 1
// RULES:
// - Must NOT invent new speakers
// - Must merge fragmented speakers into correct identity
// - Use conversational continuity, Q&A flow, intro language

import Anthropic from '@anthropic-ai/sdk';
import { IntelligentSpeaker } from './speaker-intelligence';

export interface ReassignedUtterance {
  originalSpeakerId: string;
  assignedSpeakerId: string;
  assignedSpeakerName: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  reassignmentReason?: string;
}

export interface TranscriptReassignmentResult {
  utterances: ReassignedUtterance[];
  mappings: Record<string, string>; // original speaker ID -> assigned speaker ID
  diagnostics: string[];
  stats: {
    totalUtterances: number;
    speakersConsolidated: number;
    ambiguousAssignments: number;
  };
}

const SYSTEM_PROMPT = `You are a transcript reassignment system. Your job is to map every utterance in a podcast transcript to the correct speaker from a known speaker list.

CRITICAL RULES:

1. You MUST use ONLY the speaker IDs provided in the speaker list
2. DO NOT invent new speakers
3. DO NOT skip utterances - every utterance must be assigned
4. Merge fragmented speakers into the correct identity

DECISION CRITERIA (in order of priority):

1. **Conversational continuity**: Who is most likely speaking based on context?
2. **Question/Answer flow**: If someone asks a question, the next speaker is likely answering
3. **Intro language**: "I'm joined by..." indicates next speaker is the person mentioned
4. **Speaking patterns**: Hosts typically speak more, ask questions, transition topics
5. **Content consistency**: Technical topics → likely guest expert, ads → likely Advertiser

WHEN UNCERTAIN:
- Assign to the most likely speaker based on conversational flow
- If truly ambiguous between Host and Guest, choose the one who spoke previously in that exchange
- Document the reason in your diagnostic notes

OUTPUT FORMAT:
Return ONLY valid JSON. No markdown, no explanations.

{
  "mappings": {
    "Speaker_A": "speaker_1",
    "Speaker_B": "speaker_2"
  },
  "diagnostics": ["notes about ambiguous decisions"],
  "ambiguous_utterance_indices": [5, 12, 34]
}

The mappings object maps original speaker IDs to your assigned speaker IDs from the known list.`;

/**
 * Pass 2: Reassign all utterances to correct speakers from Pass 1
 * Uses Claude to handle conversational context and merge fragmented speakers
 */
export async function reassignTranscript(
  utterances: Array<{ speaker_id: string; text: string; start: number; end: number }>,
  knownSpeakers: IntelligentSpeaker[],
  options: {
    apiKey?: string;
    model?: string;
  } = {}
): Promise<TranscriptReassignmentResult> {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic API key required for transcript reassignment');
  }

  const anthropic = new Anthropic({ apiKey });
  const model = options.model || 'claude-sonnet-4-5-20250929';

  console.log('[TRANSCRIPT REASSIGNMENT] Starting Pass 2 - Claude reassignment');
  console.log(`[TRANSCRIPT REASSIGNMENT] ${utterances.length} utterances to reassign`);
  console.log(`[TRANSCRIPT REASSIGNMENT] ${knownSpeakers.length} known speakers`);

  // Build context for Claude
  const speakerListContext = buildSpeakerListContext(knownSpeakers);
  const transcriptContext = buildTranscriptContextForReassignment(utterances);

  const userPrompt = `You must reassign every utterance in this transcript to one of the known speakers.

KNOWN SPEAKERS (ONLY use these IDs):
${speakerListContext}

TRANSCRIPT TO REASSIGN:
${transcriptContext}

For each original speaker ID (Speaker_A, Speaker_B, etc.), determine which known speaker they actually are.

Return the mapping as JSON.`;

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format from Claude');
    }

    // Parse JSON (remove markdown fences if present)
    const jsonText = content.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonText);

    const mappings: Record<string, string> = parsed.mappings || {};
    const diagnostics: string[] = Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [];
    const ambiguousIndices: number[] = Array.isArray(parsed.ambiguous_utterance_indices)
      ? parsed.ambiguous_utterance_indices
      : [];

    console.log(`[TRANSCRIPT REASSIGNMENT] Mappings:`, mappings);
    console.log(`[TRANSCRIPT REASSIGNMENT] Ambiguous utterances: ${ambiguousIndices.length}`);

    // Apply mappings to utterances
    const reassigned = applyMappings(utterances, mappings, knownSpeakers, ambiguousIndices);

    // Calculate stats
    const stats = calculateStats(utterances, reassigned);

    console.log(`[TRANSCRIPT REASSIGNMENT] Stats:`, stats);
    if (diagnostics.length > 0) {
      console.log(`[TRANSCRIPT REASSIGNMENT] Diagnostics:`, diagnostics);
    }

    return {
      utterances: reassigned,
      mappings,
      diagnostics,
      stats
    };

  } catch (error: any) {
    console.error('[TRANSCRIPT REASSIGNMENT] Claude reassignment failed:', error);

    // Fallback: Create 1:1 mapping if reassignment fails
    console.warn('[TRANSCRIPT REASSIGNMENT] Using fallback 1:1 mapping');
    const fallbackMappings = createFallbackMappings(utterances, knownSpeakers);
    const reassigned = applyMappings(utterances, fallbackMappings, knownSpeakers, []);

    return {
      utterances: reassigned,
      mappings: fallbackMappings,
      diagnostics: [`Reassignment failed: ${error.message}. Using fallback mapping.`],
      stats: calculateStats(utterances, reassigned)
    };
  }
}

/**
 * Build speaker list context for Claude
 */
function buildSpeakerListContext(speakers: IntelligentSpeaker[]): string {
  return speakers.map(speaker => {
    let line = `${speaker.id}: ${speaker.name} (${speaker.role})`;
    if (speaker.aliases && speaker.aliases.length > 0) {
      line += ` - Also known as: ${speaker.aliases.join(', ')}`;
    }
    return line;
  }).join('\n');
}

/**
 * Build transcript context for reassignment
 * Shows original speaker IDs with timestamps and text
 */
function buildTranscriptContextForReassignment(
  utterances: Array<{ speaker_id: string; text: string; start: number; end: number }>,
  maxChars: number = 40000
): string {
  const lines: string[] = [];
  let totalChars = 0;

  for (let i = 0; i < utterances.length; i++) {
    const utterance = utterances[i];
    const timestamp = formatTimestamp(utterance.start);
    const line = `[${i}] ${utterance.speaker_id} ${timestamp}: ${utterance.text}\n`;

    if (totalChars + line.length > maxChars) {
      lines.push(`... (${utterances.length - i} more utterances)\n`);
      break;
    }

    lines.push(line);
    totalChars += line.length;
  }

  return lines.join('');
}

/**
 * Format seconds to MM:SS
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Apply speaker mappings to utterances
 */
function applyMappings(
  utterances: Array<{ speaker_id: string; text: string; start: number; end: number }>,
  mappings: Record<string, string>,
  knownSpeakers: IntelligentSpeaker[],
  ambiguousIndices: number[]
): ReassignedUtterance[] {
  const speakerMap = new Map(knownSpeakers.map(s => [s.id, s]));

  return utterances.map((utterance, index) => {
    const assignedId = mappings[utterance.speaker_id] || utterance.speaker_id;
    const speaker = speakerMap.get(assignedId);

    const isAmbiguous = ambiguousIndices.includes(index);

    return {
      originalSpeakerId: utterance.speaker_id,
      assignedSpeakerId: assignedId,
      assignedSpeakerName: speaker?.name || 'Unknown',
      text: utterance.text,
      start: utterance.start,
      end: utterance.end,
      confidence: isAmbiguous ? 0.6 : 0.9,
      reassignmentReason: isAmbiguous ? 'Ambiguous assignment' : undefined
    };
  });
}

/**
 * Create fallback 1:1 mappings if reassignment fails
 */
function createFallbackMappings(
  utterances: Array<{ speaker_id: string }>,
  knownSpeakers: IntelligentSpeaker[]
): Record<string, string> {
  const uniqueOriginalIds = Array.from(new Set(utterances.map(u => u.speaker_id)));
  const mappings: Record<string, string> = {};

  uniqueOriginalIds.forEach((originalId, index) => {
    // Map to known speakers in order, or use original ID if not enough known speakers
    mappings[originalId] = knownSpeakers[index]?.id || originalId;
  });

  return mappings;
}

/**
 * Calculate reassignment statistics
 */
function calculateStats(
  original: Array<{ speaker_id: string }>,
  reassigned: ReassignedUtterance[]
): {
  totalUtterances: number;
  speakersConsolidated: number;
  ambiguousAssignments: number;
} {
  const originalSpeakers = new Set(original.map(u => u.speaker_id));
  const assignedSpeakers = new Set(reassigned.map(u => u.assignedSpeakerId));
  const ambiguousCount = reassigned.filter(u => u.confidence < 0.8).length;

  return {
    totalUtterances: reassigned.length,
    speakersConsolidated: originalSpeakers.size - assignedSpeakers.size,
    ambiguousAssignments: ambiguousCount
  };
}
