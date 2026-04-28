// ═══════════════════════════════════════════════════════════════
// Dirty Cluster Resolution (Pass 2c)
// ═══════════════════════════════════════════════════════════════
//
// When diarization fails and groups multiple speakers under one label
// (a "dirty cluster"), this module resolves individual segments by
// analyzing conversational context.
//
// Uses GPT-4o-mini for cost efficiency (~$0.0003/call).

import OpenAI from 'openai';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
import { SpeakerSegment } from './types';
import { GPTSpeaker } from './gpt-speaker-intelligence';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

export interface DirtyClusterResolutionResult {
  segments: SpeakerSegment[];
  resolvedCount: number;
  diagnostics: {
    dirtyClusterLabel: string;
    totalSegments: number;
    batchCount: number;
    reasoning: string[];
  };
}

const SYSTEM_PROMPT = `You are a speaker attribution specialist. Your task is to determine WHO IS SPEAKING in each highlighted segment based on conversational context.

KEY RULE — Direct Address (apply FIRST, before all other reasoning):
If a segment addresses someone by name or title at the start, the CURRENT SPEAKER is the one doing
the addressing — NOT the person being named or titled. Examples:
  "Prime Minister, where does this podcast find you?" → speaker is the HOST (not the PM)
  "I'm in Montreal right now, Professor." → speaker is the GUEST (not the Professor)
  "Thank you, Scott." → speaker is someone OTHER than Scott
  "Senator, can you explain..." → speaker is the INTERVIEWER (not the Senator)
  "Professor, what do you think?" → speaker is the INTERVIEWER (not the Professor)
Do NOT pull a segment into a speaker's bucket just because that speaker's title or name appears at
the start of the segment. That is a DIRECT ADDRESS, not a self-identification.

RULES:
1. You can ONLY assign speakers from the provided roster. Never invent IDs.
2. Use conversational flow to determine speaker:
   - Questions are usually answered by the person asked
   - "Thanks Emily, Mariam what do you think?" → next segment is Mariam
   - "I disagree with what X said" → speaker is NOT X
3. Look for name mentions that indicate who speaks next
4. Consider topic continuity - same argument usually = same speaker

CONFIDENCE LEVELS:
- 0.95: Explicit address ("Mariam, your turn")
- 0.85: Clear conversational flow
- 0.70: Reasonable inference from context
- 0.50: Uncertain, best guess

Return valid JSON only.`;

/**
 * Detect if a cluster is "dirty" (contains multiple speakers)
 *
 * Checks BOTH:
 * 1. Original raw labels (initialSpeakerId) - for diarization errors
 * 2. Final speaker IDs (speakerId/finalSpeakerId) - for mapping errors where
 *    different raw labels got incorrectly merged to the same speaker
 */
export function detectDirtyClusters(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): string[] {
  const dirtyClusters: string[] = [];
  const seen = new Set<string>();

  // Self-ID patterns
  const selfIdPatterns = [
    /\bmy name is\s+([A-Z][a-z]+)/i,
    /\bI'm\s+([A-Z][a-z]+)/i,
    /\bI am\s+([A-Z][a-z]+)/i,
  ];

  // Check 1: Group by original raw label (diarization errors)
  const rawLabelGroups: Record<string, SpeakerSegment[]> = {};
  for (const seg of segments) {
    const label = seg.initialSpeakerId || seg.speakerId;
    if (!rawLabelGroups[label]) rawLabelGroups[label] = [];
    rawLabelGroups[label].push(seg);
  }

  for (const [label, segs] of Object.entries(rawLabelGroups)) {
    const namesFound = new Set<string>();

    for (const seg of segs) {
      for (const pattern of selfIdPatterns) {
        const match = seg.text.match(pattern);
        if (match?.[1]) {
          namesFound.add(match[1].toLowerCase());
        }
      }
    }

    if (namesFound.size > 1 && !seen.has(label)) {
      console.log(`[DIRTY CLUSTER] Detected (raw label): ${label} has ${namesFound.size} self-IDs: [${[...namesFound].join(', ')}]`);
      dirtyClusters.push(label);
      seen.add(label);
    }
  }

  // Check 2: Group by FINAL speaker ID (mapping errors)
  // This catches cases where GPT-4o-mini incorrectly mapped different people to the same speaker
  const finalSpeakerGroups: Record<string, SpeakerSegment[]> = {};
  for (const seg of segments) {
    const finalId = (seg as any).finalSpeakerId || seg.speakerId;
    if (!finalSpeakerGroups[finalId]) finalSpeakerGroups[finalId] = [];
    finalSpeakerGroups[finalId].push(seg);
  }

  for (const [finalId, segs] of Object.entries(finalSpeakerGroups)) {
    const namesFound = new Set<string>();
    const rawLabelsInvolved = new Set<string>();

    for (const seg of segs) {
      rawLabelsInvolved.add(seg.initialSpeakerId || seg.speakerId);

      for (const pattern of selfIdPatterns) {
        const match = seg.text.match(pattern);
        if (match?.[1]) {
          namesFound.add(match[1].toLowerCase());
        }
      }
    }

    // If multiple different names self-identify under this FINAL speaker ID, it's dirty
    // This means the mapping incorrectly merged different people
    if (namesFound.size > 1) {
      // Find which raw labels are dirty (contain segments that self-ID as someone else)
      const speaker = roster.find(s => s.id === finalId);
      const speakerName = speaker?.name?.toLowerCase() || '';

      console.log(`[DIRTY CLUSTER] Detected (mapping error): ${finalId} (${speaker?.name || 'unnamed'}) has ${namesFound.size} self-IDs: [${[...namesFound].join(', ')}]`);
      console.log(`[DIRTY CLUSTER]   Raw labels involved: [${[...rawLabelsInvolved].join(', ')}]`);

      // Mark all raw labels that have segments assigned to this speaker but self-ID as someone else
      for (const rawLabel of rawLabelsInvolved) {
        if (!seen.has(rawLabel)) {
          // Check if this raw label has self-IDs that don't match the final speaker
          const rawSegs = rawLabelGroups[rawLabel] || [];
          for (const seg of rawSegs) {
            for (const pattern of selfIdPatterns) {
              const match = seg.text.match(pattern);
              if (match?.[1] && match[1].toLowerCase() !== speakerName.split(' ')[0]?.toLowerCase()) {
                console.log(`[DIRTY CLUSTER]   Adding ${rawLabel} (has self-ID "${match[1]}" != "${speaker?.name}")`);
                dirtyClusters.push(rawLabel);
                seen.add(rawLabel);
                break;
              }
            }
            if (seen.has(rawLabel)) break;
          }
        }
      }
    }
  }

  return dirtyClusters;
}

/**
 * Resolve segments in a dirty cluster using GPT-4o-mini
 */
export async function resolveDirtyCluster(
  allSegments: SpeakerSegment[],
  dirtyClusterLabel: string,
  roster: GPTSpeaker[],
  options: {
    apiKey?: string;
    userId?: string;
    projectId?: string;
    reservationId?: string;
  } = {}
): Promise<DirtyClusterResolutionResult> {
  const apiKey = options.apiKey ?? await getOpenAIApiKeyForUser(options.userId);
  if (!apiKey) {
    throw new Error('OpenAI API key not configured for dirty cluster resolution');
  }

  console.log(`[DIRTY CLUSTER] Resolving cluster: ${dirtyClusterLabel}`);

  const openai = new OpenAI({ apiKey, timeout: 45000 });
  const model = 'gpt-5-mini';

  // Find segments belonging to the dirty cluster
  const dirtySegmentIndices: number[] = [];
  for (let i = 0; i < allSegments.length; i++) {
    const label = allSegments[i].initialSpeakerId || allSegments[i].speakerId;
    if (label === dirtyClusterLabel) {
      dirtySegmentIndices.push(i);
    }
  }

  console.log(`[DIRTY CLUSTER] ${dirtySegmentIndices.length} segments to resolve`);

  if (dirtySegmentIndices.length === 0) {
    return {
      segments: allSegments,
      resolvedCount: 0,
      diagnostics: {
        dirtyClusterLabel,
        totalSegments: 0,
        batchCount: 0,
        reasoning: [],
      }
    };
  }

  // Build roster context
  const rosterContext = roster.map(s =>
    `${s.id}: ${s.name || '(unnamed)'} [${s.role}]`
  ).join('\n');

  // Process in batches of 10 segments
  const BATCH_SIZE = 10;
  const results: Array<{ index: number; speakerId: string; confidence: number; reasoning: string }> = [];
  let batchCount = 0;

  for (let batchStart = 0; batchStart < dirtySegmentIndices.length; batchStart += BATCH_SIZE) {
    const batchIndices = dirtySegmentIndices.slice(batchStart, batchStart + BATCH_SIZE);
    batchCount++;

    // Build context windows for each segment in the batch
    const segmentWindows = batchIndices.map(idx => {
      const seg = allSegments[idx];

      // Helper to format segment with embedding info
      const formatSegment = (s: any, i: number) => {
        const embedding = s.embedding as number[] | undefined;
        const embeddingHint = embedding
          ? ` [acoustic_magnitude: ${Math.sqrt(embedding.reduce((sum: number, v: number) => sum + v*v, 0)).toFixed(2)}]`
          : '';
        return `[${i}] ${s.speakerId}${embeddingHint}: "${truncate(s.text, 150)}"`;
      };

      const contextBefore = allSegments
        .slice(Math.max(0, idx - 3), idx)
        .map((s, i) => formatSegment(s, idx - 3 + i))
        .join('\n');

      const contextAfter = allSegments
        .slice(idx + 1, Math.min(allSegments.length, idx + 4))
        .map((s, i) => formatSegment(s, idx + 1 + i))
        .join('\n');

      const targetEmbedding = (seg as any).embedding as number[] | undefined;
      const targetEmbeddingHint = targetEmbedding
        ? ` [acoustic_magnitude: ${Math.sqrt(targetEmbedding.reduce((sum: number, v: number) => sum + v*v, 0)).toFixed(2)}]`
        : '';

      return {
        index: idx,
        window: `--- CONTEXT BEFORE ---
${contextBefore || '(start of transcript)'}

>>> TARGET SEGMENT [${idx}]${targetEmbeddingHint} <<<
"${truncate(seg.text, 300)}"

--- CONTEXT AFTER ---
${contextAfter || '(end of transcript)'}`
      };
    });

    const userPrompt = `Determine who is speaking in each TARGET SEGMENT.

ROSTER (the ONLY valid speaker IDs):
${rosterContext}

${segmentWindows.map(sw => sw.window).join('\n\n========================================\n\n')}

**Reasoning guidelines**:
1. Look for self-identifications ("My name is...", "I'm...")
2. Check acoustic hints (segments with similar acoustic_magnitude values likely belong to the same speaker)
3. Maintain speaker continuity across adjacent segments
4. Cross-reference with roster names and roles

For each target segment, analyze the conversational context and determine the speaker.

OUTPUT (JSON only):
{
  "attributions": [
    {
      "segmentIndex": ${segmentWindows[0].index},
      "speakerId": "speaker_X",
      "confidence": 0.85,
      "reasoning": "Brief explanation"
    }
  ]
}`;

    try {
      const response = await openai.chat.completions.create({
        model,
        max_completion_tokens: 4000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
      });

      // Track usage
      if (options.userId) {
        await trackOpenAIUsage({
          userId: options.userId,
          projectId: options.projectId,
          reservationId: options.reservationId,
          response,
          modelName: model,
          purpose: 'Dirty Cluster Resolution (Pass 2c)',
          shouldDebit: options.reservationId ? false : true
        });
      }

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);

      const attributions = parsed.attributions || [];

      // Validate and collect results
      const validIds = new Set(roster.map(s => s.id));
      for (const attr of attributions) {
        if (validIds.has(attr.speakerId)) {
          results.push({
            index: attr.segmentIndex,
            speakerId: attr.speakerId,
            confidence: attr.confidence || 0.7,
            reasoning: attr.reasoning || ''
          });
        } else {
          console.warn(`[DIRTY CLUSTER] Invalid speaker ID ${attr.speakerId} for segment ${attr.segmentIndex}`);
        }
      }

    } catch (error: any) {
      console.error(`[DIRTY CLUSTER] Batch ${batchCount} failed:`, error.message);
      // Continue with other batches
    }
  }

  // Apply results to segments
  const updatedSegments = [...allSegments];
  let resolvedCount = 0;

  for (const result of results) {
    const seg = updatedSegments[result.index];
    const speaker = roster.find(s => s.id === result.speakerId);

    updatedSegments[result.index] = {
      ...seg,
      speakerId: result.speakerId,
      finalSpeakerId: result.speakerId,
      confidence: result.confidence,
      status: result.confidence >= 0.8 ? 'confirmed' : 'tentative',
    };

    resolvedCount++;
    console.log(`[DIRTY CLUSTER] Segment ${result.index}: → ${result.speakerId} (${speaker?.name || 'unnamed'}) [${result.confidence}]`);
  }

  console.log(`[DIRTY CLUSTER] Resolved ${resolvedCount}/${dirtySegmentIndices.length} segments`);

  return {
    segments: updatedSegments,
    resolvedCount,
    diagnostics: {
      dirtyClusterLabel,
      totalSegments: dirtySegmentIndices.length,
      batchCount,
      reasoning: results.map(r => r.reasoning),
    }
  };
}

/**
 * Resolve all dirty clusters in the transcript
 *
 * This function:
 * 1. Detects dirty clusters (multiple speakers merged into one)
 * 2. Creates new roster entries for speakers found via self-ID but not in roster
 * 3. Resolves segment attribution using GPT-4o-mini
 */
export async function resolveAllDirtyClusters(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[],
  options: {
    apiKey?: string;
    userId?: string;
    projectId?: string;
    reservationId?: string;
  } = {}
): Promise<{
  segments: SpeakerSegment[];
  roster: GPTSpeaker[];
  dirtyClustersResolved: string[];
  totalResolved: number;
  newSpeakersCreated: string[];
}> {
  // Create a mutable copy of roster
  let currentRoster = [...roster];
  const newSpeakersCreated: string[] = [];

  // First pass: Find self-IDs that aren't in the roster and create entries
  const selfIdPatterns = [
    /\bmy name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /\bI'm\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /\bI am\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];

  const existingNames = new Set(
    currentRoster
      .filter(s => s.name)
      .map(s => s.name!.toLowerCase().split(' ')[0])
  );

  // Scan for self-IDs not in roster
  for (const seg of segments) {
    for (const pattern of selfIdPatterns) {
      const match = seg.text.match(pattern);
      if (match?.[1]) {
        const name = match[1].trim();
        const firstName = name.toLowerCase().split(' ')[0];

        // Skip common false positives
        const stopwords = new Set(['here', 'back', 'going', 'just', 'not', 'so', 'very', 'happy', 'glad', 'excited']);
        if (stopwords.has(firstName)) continue;

        // Check if this name is already in roster
        if (!existingNames.has(firstName)) {
          // Create new roster entry
          const newId = `speaker_${currentRoster.length + 1}`;
          const newSpeaker: GPTSpeaker = {
            id: newId,
            name: name,
            role: 'guest',
            confidence: 0.85,
            source: 'dirty_cluster_self_id'
          };

          console.log(`[DIRTY CLUSTER] Creating new speaker from self-ID: "${name}" → ${newId}`);
          currentRoster.push(newSpeaker);
          existingNames.add(firstName);
          newSpeakersCreated.push(name);
        }
      }
    }
  }

  // Detect dirty clusters with updated roster
  const dirtyClusters = detectDirtyClusters(segments, currentRoster);

  if (dirtyClusters.length === 0 && newSpeakersCreated.length === 0) {
    console.log('[DIRTY CLUSTER] No dirty clusters detected');
    return {
      segments,
      roster: currentRoster,
      dirtyClustersResolved: [],
      totalResolved: 0,
      newSpeakersCreated: [],
    };
  }

  console.log(`[DIRTY CLUSTER] Found ${dirtyClusters.length} dirty cluster(s): [${dirtyClusters.join(', ')}]`);
  if (newSpeakersCreated.length > 0) {
    console.log(`[DIRTY CLUSTER] Created ${newSpeakersCreated.length} new speaker(s): [${newSpeakersCreated.join(', ')}]`);
  }

  let currentSegments = segments;
  let totalResolved = 0;

  // Resolve each dirty cluster
  for (const clusterLabel of dirtyClusters) {
    const result = await resolveDirtyCluster(
      currentSegments,
      clusterLabel,
      currentRoster,
      options
    );
    currentSegments = result.segments;
    totalResolved += result.resolvedCount;
  }

  return {
    segments: currentSegments,
    roster: currentRoster,
    dirtyClustersResolved: dirtyClusters,
    totalResolved,
    newSpeakersCreated,
  };
}

/**
 * Truncate text to max length
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}
