// Shared speaker alignment utilities for word-level diarization
// Used by both PyAnnote and NeMo integrations for consistent alignment logic

import { TranscriptionSegment, SpeakerSegment } from './speaker-detection';

// Configuration constants with environment variable fallbacks
const WORD_COLLAR = parseFloat(process.env.SPEAKER_WORD_COLLAR_S ?? '0.15'); // seconds
const MIN_TURN_DURATION_S = parseFloat(process.env.SPEAKER_MIN_TURN_S ?? '0.8');
const SANDWICH_MAX_S = parseFloat(process.env.SPEAKER_SANDWICH_MAX_S ?? '0.6');
const SAME_SPEAKER_GAP_S = parseFloat(process.env.SAME_SPEAKER_GAP_S ?? '1.2');
const WORD_GROUP_GAP_S = 1.0; // Gap between consecutive words to start new group

export interface WordWithSegment {
  start: number;
  end: number;
  word: string;
  segmentIndex: number;
}

export interface AlignmentConfig {
  collar: number;
  groupGap: number;
  minTurnDuration: number;
  sandwichMax: number;
  sameSpeakerGap: number;
}

export interface AlignmentStats {
  totalWords: number;
  assignedWords: number;
  unassignedWords: number;
  turnsCreated: number;
  speakerDistribution: Record<string, number>;
  mergingApplied: {
    sameSpeakerMerges: number;
    sandwichMerges: number;
    shortTurnMerges: number;
  };
}

/**
 * Get alignment configuration from environment variables
 */
export function getAlignmentConfig(): AlignmentConfig {
  return {
    collar: WORD_COLLAR,
    groupGap: WORD_GROUP_GAP_S,
    minTurnDuration: MIN_TURN_DURATION_S,
    sandwichMax: SANDWICH_MAX_S,
    sameSpeakerGap: SAME_SPEAKER_GAP_S
  };
}

/**
 * Align diarization turns with transcription using word-level mapping
 */
export function alignByWords(
  turns: SpeakerSegment[],
  segments: TranscriptionSegment[],
  method: string = 'speaker_detection'
): { alignedSegments: SpeakerSegment[]; stats: AlignmentStats } {
  const config = getAlignmentConfig();
  
  console.log(`[${method.toUpperCase()}] 🔄 Starting word-level alignment with ${turns.length} turns and ${segments.length} segments`);
  console.log(`[${method.toUpperCase()}] Config:`, config);
  
  // Step 1: Flatten words from all transcription segments
  const words = flattenWordsFromSegments(segments, method);
  
  if (words.length === 0) {
    console.log(`[${method.toUpperCase()}] ⚠️ No words available, falling back to segment-level alignment`);
    return alignBySegmentsFallback(turns, segments, method);
  }
  
  console.log(`[${method.toUpperCase()}] 📊 Flattened ${words.length} words from ${segments.length} segments`);
  
  // Step 2: Assign words to diarization turns
  const turnWordAssignments = assignWordsToTurns(turns, words, config, method);
  
  // Step 3: Group words into runs and create speaker segments
  const rawSegments = createSpeakerSegmentsFromWords(turnWordAssignments, segments, config, method);
  
  // Step 4: Apply post-processing smoothing
  const smoothedSegments = applyPostProcessing(rawSegments, config, method);
  
  // Step 5: Calculate alignment statistics
  const stats = calculateAlignmentStats(words, turnWordAssignments, smoothedSegments, method);
  
  console.log(`[${method.toUpperCase()}] ✅ Word-level alignment complete:`, stats);
  
  return { alignedSegments: smoothedSegments, stats };
}

/**
 * Flatten words from transcription segments with absolute timestamps
 */
function flattenWordsFromSegments(segments: TranscriptionSegment[], method: string): WordWithSegment[] {
  const words: WordWithSegment[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    if (segment.words && segment.words.length > 0) {
      // Use word-level timestamps if available
      for (const word of segment.words) {
        words.push({
          start: word.start,
          end: word.end,
          word: word.word,
          segmentIndex: i
        });
      }
    } else {
      // Fallback: split segment text into approximate words
      const segmentWords = segment.text.trim().split(/\s+/).filter(w => w.length > 0);
      if (segmentWords.length > 0) {
        const segmentDuration = segment.end - segment.start;
        const wordDuration = segmentDuration / segmentWords.length;
        
        for (let j = 0; j < segmentWords.length; j++) {
          words.push({
            start: segment.start + (j * wordDuration),
            end: segment.start + ((j + 1) * wordDuration),
            word: segmentWords[j],
            segmentIndex: i
          });
        }
      }
    }
  }
  
  // Sort words by start time
  words.sort((a, b) => a.start - b.start);
  
  console.log(`[${method.toUpperCase()}] 📝 Extracted ${words.length} words from ${segments.length} segments`);
  return words;
}

/**
 * Assign words to diarization turns based on temporal overlap with collar
 */
function assignWordsToTurns(
  turns: SpeakerSegment[],
  words: WordWithSegment[],
  config: AlignmentConfig,
  method: string
): Array<{ turn: SpeakerSegment; words: WordWithSegment[] }> {
  const turnWordAssignments: Array<{ turn: SpeakerSegment; words: WordWithSegment[] }> = [];
  
  for (const turn of turns) {
    const turnStart = turn.startTime - config.collar;
    const turnEnd = turn.endTime + config.collar;
    
    // Find words whose midpoint falls within the expanded turn boundary
    const wordsInTurn = words.filter(word => {
      const wordMidpoint = (word.start + word.end) / 2;
      return wordMidpoint >= turnStart && wordMidpoint <= turnEnd;
    });
    
    turnWordAssignments.push({
      turn,
      words: wordsInTurn
    });
    
    if (wordsInTurn.length > 0) {
      console.log(`[${method.toUpperCase()}] ${turn.speakerId} (${turn.startTime.toFixed(1)}s-${turn.endTime.toFixed(1)}s): ${wordsInTurn.length} words assigned`);
    }
  }
  
  return turnWordAssignments;
}

/**
 * Create speaker segments from word assignments, grouping contiguous words
 */
function createSpeakerSegmentsFromWords(
  turnWordAssignments: Array<{ turn: SpeakerSegment; words: WordWithSegment[] }>,
  segments: TranscriptionSegment[],
  config: AlignmentConfig,
  method: string
): SpeakerSegment[] {
  const speakerSegments: SpeakerSegment[] = [];
  
  for (const { turn, words } of turnWordAssignments) {
    if (words.length === 0) {
      // No words assigned - use segment-level fallback for this turn
      const fallbackSegment = createFallbackSegmentForTurn(turn, segments, method);
      if (fallbackSegment) {
        speakerSegments.push(fallbackSegment);
      }
      continue;
    }
    
    // Group contiguous words into runs
    const wordGroups = groupContiguousWords(words, config.groupGap);
    
    for (const group of wordGroups) {
      if (group.length === 0) continue;
      
      const firstWord = group[0];
      const lastWord = group[group.length - 1];
      const text = group.map(w => w.word).join(' ');
      
      speakerSegments.push({
        speakerId: turn.speakerId,
        startTime: firstWord.start,
        endTime: lastWord.end,
        text: text.trim(),
        confidence: turn.confidence || 0.9
      });
    }
  }
  
  // Sort by start time to maintain chronological order
  speakerSegments.sort((a, b) => a.startTime - b.startTime);
  
  console.log(`[${method.toUpperCase()}] 📋 Created ${speakerSegments.length} speaker segments from word groups`);
  return speakerSegments;
}

/**
 * Group contiguous words, breaking on large gaps
 */
function groupContiguousWords(words: WordWithSegment[], maxGap: number): WordWithSegment[][] {
  if (words.length === 0) return [];
  
  // Sort words by start time
  const sortedWords = [...words].sort((a, b) => a.start - b.start);
  const groups: WordWithSegment[][] = [];
  let currentGroup: WordWithSegment[] = [sortedWords[0]];
  
  for (let i = 1; i < sortedWords.length; i++) {
    const prevWord = sortedWords[i - 1];
    const currentWord = sortedWords[i];
    const gap = currentWord.start - prevWord.end;
    
    if (gap <= maxGap) {
      // Words are close enough - add to current group
      currentGroup.push(currentWord);
    } else {
      // Gap is too large - start new group
      groups.push(currentGroup);
      currentGroup = [currentWord];
    }
  }
  
  // Add the final group
  groups.push(currentGroup);
  
  return groups;
}

/**
 * Create fallback segment for a turn when no words are assigned
 */
function createFallbackSegmentForTurn(
  turn: SpeakerSegment,
  segments: TranscriptionSegment[],
  method: string
): SpeakerSegment | null {
  // Find overlapping transcription segments
  const overlappingSegments = segments.filter(segment => {
    const segmentMidpoint = (segment.start + segment.end) / 2;
    return segmentMidpoint >= turn.startTime && segmentMidpoint <= turn.endTime;
  });
  
  if (overlappingSegments.length === 0) {
    console.log(`[${method.toUpperCase()}] ⚠️ No overlapping segments for turn ${turn.speakerId} at ${turn.startTime.toFixed(1)}s-${turn.endTime.toFixed(1)}s`);
    return {
      speakerId: turn.speakerId,
      startTime: turn.startTime,
      endTime: turn.endTime,
      text: '[No clear speech detected]',
      confidence: 0.3
    };
  }
  
  const combinedText = overlappingSegments
    .sort((a, b) => a.start - b.start)
    .map(s => s.text.trim())
    .filter(text => text.length > 0)
    .join(' ');
  
  const actualStart = Math.max(turn.startTime, Math.min(...overlappingSegments.map(s => s.start)));
  const actualEnd = Math.min(turn.endTime, Math.max(...overlappingSegments.map(s => s.end)));
  
  console.log(`[${method.toUpperCase()}] 🔄 Fallback for ${turn.speakerId}: ${overlappingSegments.length} segments, ${combinedText.length} chars`);
  
  return {
    speakerId: turn.speakerId,
    startTime: actualStart,
    endTime: actualEnd,
    text: combinedText || '[Unclear speech]',
    confidence: turn.confidence || 0.7
  };
}

/**
 * Apply post-processing smoothing rules
 */
function applyPostProcessing(
  segments: SpeakerSegment[],
  config: AlignmentConfig,
  method: string
): SpeakerSegment[] {
  console.log(`[${method.toUpperCase()}] 🔧 Applying post-processing to ${segments.length} segments...`);
  
  let processed = [...segments];
  let sameSpeakerMerges = 0;
  let sandwichMerges = 0;
  let shortTurnMerges = 0;
  
  // Step 1: Merge adjacent same-speaker turns with small gaps
  processed = mergeSameSpeakerWithGap(processed, config.sameSpeakerGap);
  sameSpeakerMerges = segments.length - processed.length;
  
  // Step 2: Apply sandwich (A-B-A) smoothing
  const beforeSandwich = processed.length;
  processed = mergeSandwichABA(processed, config.sandwichMax);
  sandwichMerges = beforeSandwich - processed.length;
  
  // Step 3: Merge ultra-short turns
  const beforeShort = processed.length;
  processed = mergeShortTurns(processed, config.minTurnDuration);
  shortTurnMerges = beforeShort - processed.length;
  
  console.log(`[${method.toUpperCase()}] 🔧 Post-processing complete: ${sameSpeakerMerges} same-speaker merges, ${sandwichMerges} sandwich merges, ${shortTurnMerges} short-turn merges`);
  
  return processed;
}

/**
 * Merge adjacent same-speaker segments with gap threshold
 */
function mergeSameSpeakerWithGap(segments: SpeakerSegment[], maxGap: number): SpeakerSegment[] {
  if (segments.length <= 1) return segments;
  
  const merged: SpeakerSegment[] = [];
  let current = { ...segments[0] };
  
  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    const gap = next.startTime - current.endTime;
    
    if (current.speakerId === next.speakerId && gap <= maxGap) {
      // Merge segments
      current.endTime = next.endTime;
      current.text = current.text + (gap > 0.1 ? ' ' : '') + next.text;
      current.confidence = Math.min(current.confidence, next.confidence);
    } else {
      // Save current and start new
      merged.push(current);
      current = { ...next };
    }
  }
  
  merged.push(current);
  return merged;
}

/**
 * Merge sandwich patterns (A-B-A) where B is very short
 */
function mergeSandwichABA(segments: SpeakerSegment[], maxDuration: number): SpeakerSegment[] {
  if (segments.length < 3) return segments;
  
  const processed: SpeakerSegment[] = [];
  let i = 0;
  
  while (i < segments.length) {
    if (i < segments.length - 2) {
      const a1 = segments[i];
      const b = segments[i + 1];
      const a2 = segments[i + 2];
      
      const bDuration = b.endTime - b.startTime;
      const confidencesSimilar = Math.abs(a1.confidence - a2.confidence) < 0.2;
      
      if (a1.speakerId === a2.speakerId && 
          a1.speakerId !== b.speakerId && 
          bDuration <= maxDuration && 
          confidencesSimilar) {
        
        // Merge A-B-A into single A segment
        processed.push({
          speakerId: a1.speakerId,
          startTime: a1.startTime,
          endTime: a2.endTime,
          text: `${a1.text} ${b.text} ${a2.text}`.trim(),
          confidence: Math.min(a1.confidence, a2.confidence)
        });
        
        i += 3; // Skip all three segments
      } else {
        processed.push(a1);
        i += 1;
      }
    } else {
      // Not enough segments left for sandwich pattern
      processed.push(segments[i]);
      i += 1;
    }
  }
  
  return processed;
}

/**
 * Merge or reassign ultra-short turns to neighboring speakers
 */
function mergeShortTurns(segments: SpeakerSegment[], minDuration: number): SpeakerSegment[] {
  if (segments.length <= 1) return segments;
  
  const processed: SpeakerSegment[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const current = segments[i];
    const duration = current.endTime - current.startTime;
    
    if (duration >= minDuration) {
      // Keep segment as-is
      processed.push(current);
    } else {
      // Find best neighbor to merge with
      const prevSeg = i > 0 ? segments[i - 1] : null;
      const nextSeg = i < segments.length - 1 ? segments[i + 1] : null;
      
      let mergeTarget: SpeakerSegment | null = null;
      
      if (prevSeg && nextSeg) {
        // Choose neighbor with same speaker ID, or larger temporal overlap
        if (prevSeg.speakerId === current.speakerId) {
          mergeTarget = prevSeg;
        } else if (nextSeg.speakerId === current.speakerId) {
          mergeTarget = nextSeg;
        } else {
          // Choose based on temporal proximity
          const prevGap = current.startTime - prevSeg.endTime;
          const nextGap = nextSeg.startTime - current.endTime;
          mergeTarget = prevGap <= nextGap ? prevSeg : nextSeg;
        }
      } else if (prevSeg) {
        mergeTarget = prevSeg;
      } else if (nextSeg) {
        mergeTarget = nextSeg;
      }
      
      if (mergeTarget) {
        // Merge into target (extend target's time and append text)
        if (mergeTarget === prevSeg && processed.length > 0) {
          const lastProcessed = processed[processed.length - 1];
          if (lastProcessed.speakerId === prevSeg.speakerId) {
            lastProcessed.endTime = current.endTime;
            lastProcessed.text = `${lastProcessed.text} ${current.text}`.trim();
            lastProcessed.confidence = Math.min(lastProcessed.confidence, current.confidence);
          } else {
            processed.push(current); // Can't merge, keep as-is
          }
        } else {
          // Will merge with next segment when we reach it
          processed.push({
            ...current,
            speakerId: mergeTarget.speakerId,
            confidence: current.confidence * 0.9 // Lower confidence for reassigned segments
          });
        }
      } else {
        // No merge target, keep as-is
        processed.push(current);
      }
    }
  }
  
  return processed;
}

/**
 * Calculate alignment statistics
 */
function calculateAlignmentStats(
  allWords: WordWithSegment[],
  turnWordAssignments: Array<{ turn: SpeakerSegment; words: WordWithSegment[] }>,
  finalSegments: SpeakerSegment[],
  method: string
): AlignmentStats {
  const totalWords = allWords.length;
  const assignedWords = turnWordAssignments.reduce((sum, assignment) => sum + assignment.words.length, 0);
  const unassignedWords = totalWords - assignedWords;
  
  // Calculate speaker distribution
  const speakerDistribution: Record<string, number> = {};
  for (const segment of finalSegments) {
    speakerDistribution[segment.speakerId] = (speakerDistribution[segment.speakerId] || 0) + 1;
  }
  
  return {
    totalWords,
    assignedWords,
    unassignedWords,
    turnsCreated: finalSegments.length,
    speakerDistribution,
    mergingApplied: {
      sameSpeakerMerges: 0, // Will be set by post-processing
      sandwichMerges: 0,
      shortTurnMerges: 0
    }
  };
}

/**
 * Fallback to segment-level alignment when words are not available
 */
function alignBySegmentsFallback(
  turns: SpeakerSegment[],
  segments: TranscriptionSegment[],
  method: string
): { alignedSegments: SpeakerSegment[]; stats: AlignmentStats } {
  console.log(`[${method.toUpperCase()}] 🔄 Using segment-level fallback alignment`);
  
  const alignedSegments: SpeakerSegment[] = [];
  
  for (const turn of turns) {
    // Find overlapping transcription segments
    const overlappingSegments = segments.filter(segment => {
      const segmentMidpoint = (segment.start + segment.end) / 2;
      return segmentMidpoint >= turn.startTime && segmentMidpoint <= turn.endTime;
    });
    
    if (overlappingSegments.length === 0) {
      // No overlap - create empty segment
      alignedSegments.push({
        speakerId: turn.speakerId,
        startTime: turn.startTime,
        endTime: turn.endTime,
        text: '[No clear speech detected]',
        confidence: 0.3
      });
    } else {
      // Combine overlapping segments
      const combinedText = overlappingSegments
        .sort((a, b) => a.start - b.start)
        .map(s => s.text.trim())
        .filter(text => text.length > 0)
        .join(' ');
      
      const actualStart = Math.max(turn.startTime, Math.min(...overlappingSegments.map(s => s.start)));
      const actualEnd = Math.min(turn.endTime, Math.max(...overlappingSegments.map(s => s.end)));
      
      alignedSegments.push({
        speakerId: turn.speakerId,
        startTime: actualStart,
        endTime: actualEnd,
        text: combinedText || '[Unclear speech]',
        confidence: turn.confidence || 0.7
      });
    }
  }
  
  const stats: AlignmentStats = {
    totalWords: 0, // No words available in fallback
    assignedWords: 0,
    unassignedWords: 0,
    turnsCreated: alignedSegments.length,
    speakerDistribution: alignedSegments.reduce((dist, seg) => {
      dist[seg.speakerId] = (dist[seg.speakerId] || 0) + 1;
      return dist;
    }, {} as Record<string, number>),
    mergingApplied: {
      sameSpeakerMerges: 0,
      sandwichMerges: 0,
      shortTurnMerges: 0
    }
  };
  
  console.log(`[${method.toUpperCase()}] ✅ Segment-level fallback complete:`, stats);
  return { alignedSegments, stats };
}