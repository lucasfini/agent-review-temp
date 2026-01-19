// PASS 2: Deterministic Speaker Mapping (NO AI COST)
// Maps AssemblyAI speaker IDs to GPT speaker IDs using simple heuristics
// Replaces expensive Claude API call

import { SpeakerSegment } from './types';
import { GPTSpeaker } from './gpt-speaker-intelligence';

export interface MappingResult {
  mappings: Record<string, string>; // AssemblyAI ID → GPT ID
  segments: SpeakerSegment[];
  confidence: Record<string, number>; // Per-mapping confidence
}

/**
 * Map AssemblyAI speaker IDs to GPT speaker IDs using deterministic logic
 * NO AI COST - pure heuristics
 *
 * Strategy:
 * 1. Match by introduction timing (first speaker → first introduced)
 * 2. Match by role content (ads → advertiser, clips → quoted_audio)
 * 3. Match by speaking patterns
 */
export function mapSpeakersDeterministically(
  segments: SpeakerSegment[],
  gptSpeakers: GPTSpeaker[]
): MappingResult {
  console.log('[DETERMINISTIC MAPPING] Starting free speaker mapping');
  console.log(`[DETERMINISTIC MAPPING] ${segments.length} segments, ${gptSpeakers.length} GPT speakers`);

  const assemblyAIIds = Array.from(new Set(segments.map(s => s.speakerId)));
  const mappings: Record<string, string> = {};
  const confidence: Record<string, number> = {};

  // Step 1: Map special roles first (advertiser, quoted_audio)
  const specialRoles = gptSpeakers.filter(s =>
    s.role === 'advertiser' || s.role === 'quoted_audio'
  );

  for (const gptSpeaker of specialRoles) {
    const assemblyAISpeaker = findSpeakerByContent(segments, gptSpeaker.role as 'advertiser' | 'quoted_audio');
    if (assemblyAISpeaker) {
      mappings[assemblyAISpeaker] = gptSpeaker.id;
      confidence[assemblyAISpeaker] = 0.95;
      console.log(`[DETERMINISTIC MAPPING] ${assemblyAISpeaker} → ${gptSpeaker.id} (${gptSpeaker.role}) [high confidence]`);
    }
  }

  // Step 2: Map remaining speakers by order of appearance
  const unmappedAssemblyAI = assemblyAIIds.filter(id => !mappings[id]);
  const unmappedGPT = gptSpeakers.filter(s =>
    s.role !== 'advertiser' &&
    s.role !== 'quoted_audio' &&
    !Object.values(mappings).includes(s.id)
  );

  // Sort by first appearance
  const assemblyAIByAppearance = unmappedAssemblyAI.sort((a, b) => {
    const firstA = segments.find(s => s.speakerId === a)?.startTime || 0;
    const firstB = segments.find(s => s.speakerId === b)?.startTime || 0;
    return firstA - firstB;
  });

  // Sort GPT speakers by role priority (host > co_host > guest > narrator)
  const rolePriority: Record<string, number> = {
    host: 1,
    co_host: 2,
    guest: 3,
    narrator: 4,
    unknown: 5
  };

  const gptByPriority = unmappedGPT.sort((a, b) => {
    return (rolePriority[a.role] || 99) - (rolePriority[b.role] || 99);
  });

  // Map in order
  for (let i = 0; i < Math.min(assemblyAIByAppearance.length, gptByPriority.length); i++) {
    const assemblyAIId = assemblyAIByAppearance[i];
    const gptSpeaker = gptByPriority[i];

    mappings[assemblyAIId] = gptSpeaker.id;
    confidence[assemblyAIId] = 0.85;
    console.log(`[DETERMINISTIC MAPPING] ${assemblyAIId} → ${gptSpeaker.id} (${gptSpeaker.name || gptSpeaker.role}) [order-based]`);
  }

  // Apply mappings to segments
  const mappedSegments = segments.map(seg => ({
    ...seg,
    speakerId: mappings[seg.speakerId] || seg.speakerId
  }));

  console.log(`[DETERMINISTIC MAPPING] Completed: ${Object.keys(mappings).length} mappings`);

  return {
    mappings,
    segments: mappedSegments,
    confidence
  };
}

/**
 * Find AssemblyAI speaker ID by content type
 */
function findSpeakerByContent(
  segments: SpeakerSegment[],
  role: 'advertiser' | 'quoted_audio'
): string | null {
  if (role === 'advertiser') {
    // Look for ad-like content
    const adPatterns = [
      /brought to you by/i,
      /sponsor/i,
      /promo code/i,
      /discount/i,
      /visit.*\.com/i,
      /percent off/i
    ];

    for (const pattern of adPatterns) {
      const adSegment = segments.find(s => pattern.test(s.text));
      if (adSegment) return adSegment.speakerId;
    }
  }

  if (role === 'quoted_audio') {
    // Look for quoted speech patterns
    const quotePatterns = [
      /in a speech/i,
      /said today/i,
      /president.*said/i,
      /clip from/i,
      /earlier today/i
    ];

    for (const pattern of quotePatterns) {
      const quoteSegment = segments.find(s => pattern.test(s.text));
      if (quoteSegment) return quoteSegment.speakerId;
    }

    // Also look for very short speakers (likely clips)
    const speakerDurations = new Map<string, number>();
    for (const seg of segments) {
      const current = speakerDurations.get(seg.speakerId) || 0;
      speakerDurations.set(seg.speakerId, current + (seg.endTime - seg.startTime));
    }

    // Find shortest speaker (likely quoted audio)
    let shortestId: string | null = null;
    let shortestDuration = Infinity;
    for (const [id, duration] of speakerDurations) {
      if (duration < shortestDuration && duration < 30) { // Less than 30 seconds
        shortestDuration = duration;
        shortestId = id;
      }
    }

    if (shortestId) return shortestId;
  }

  return null;
}
