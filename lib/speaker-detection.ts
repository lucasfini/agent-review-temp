// Speaker detection utilities for analyzing audio transcription segments

export interface TranscriptionSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
  words?: Array<{ start: number; end: number; word: string }>;
}

export interface SpeakerSegment {
  speakerId: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
}

export interface DetectedSpeaker {
  id: string;
  name: string | null;
  segments: SpeakerSegment[];
  totalDuration: number;
}

export interface SegmentStats {
  avgGap: number;
  avgLogProbVariation: number;
  avgCompressionRatio: number;
  avgNoSpeechProb: number;
  totalDuration: number;
}

export interface SpeakerProfile {
  avgLogProb: number;
  avgCompressionRatio: number;
  avgNoSpeechProb: number;
  segmentCount: number;
  totalDuration: number;
}

/**
 * Analyzes transcription segments to detect speaker changes using enhanced heuristics
 * Uses silence gaps, audio characteristics, and statistical analysis
 */
export function detectSpeakers(segments: TranscriptionSegment[]): SpeakerSegment[] {
  if (!segments || segments.length === 0) {
    return [];
  }

  console.log(`[SPEAKER DETECTION] Processing ${segments.length} segments with enhanced algorithm`);

  // Pre-process: calculate statistical baselines
  const stats = calculateSegmentStats(segments);
  console.log(`[SPEAKER DETECTION] Baseline stats:`, stats);

  const speakerSegments: SpeakerSegment[] = [];
  let currentSpeakerId = 'Speaker 1';
  let speakerCounter = 1;
  let currentSpeakerProfile = createSpeakerProfile(segments[0]);
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const prevSegment = i > 0 ? segments[i - 1] : null;
    const nextSegment = i < segments.length - 1 ? segments[i + 1] : null;
    
    let shouldChangeSpeaker = false;
    let changeReason = '';
    
    if (prevSegment) {
      const silenceGap = segment.start - prevSegment.end;
      const logProbChange = Math.abs(segment.avg_logprob - prevSegment.avg_logprob);
      const compressionChange = Math.abs(segment.compression_ratio - prevSegment.compression_ratio);
      const speechClarityChange = Math.abs(segment.no_speech_prob - prevSegment.no_speech_prob);
      
      // Conservative speaker change detection with stricter thresholds
      
      // 1. Long silence gaps (VERY conservative - only split on extremely long silences)
      const adaptiveSilenceThreshold = Math.max(30.0, stats.avgGap * 6); // Much more conservative: 30s minimum
      if (silenceGap > adaptiveSilenceThreshold) {
        shouldChangeSpeaker = true;
        changeReason = `Long silence: ${silenceGap.toFixed(1)}s > ${adaptiveSilenceThreshold.toFixed(1)}s`;
      }
      
      // 2. Significant voice characteristic changes (EXTREMELY strict)
      else if (logProbChange > (stats.avgLogProbVariation * 5.0) && silenceGap > 5.0) { // Much stricter
        shouldChangeSpeaker = true;
        changeReason = `Voice pattern change: ${logProbChange.toFixed(3)} + ${silenceGap.toFixed(1)}s gap`;
      }
      
      // 3. Compression ratio changes (EXTREMELY strict)
      else if (compressionChange > 2.0 && silenceGap > 8.0) { // Much stricter
        shouldChangeSpeaker = true;
        changeReason = `Speech compression change: ${compressionChange.toFixed(3)}`;
      }
      
      // 4. Clear speech after unclear speech (EXTREMELY conservative)
      else if (segment.no_speech_prob < 0.02 && prevSegment.no_speech_prob > 0.8 && silenceGap > 5.0) { // Much stricter
        shouldChangeSpeaker = true;
        changeReason = `Turn-taking detected`;
      }
      
      // 5. Disable profile mismatch detection for now (too aggressive)
      // else if (!matchesSpeakerProfile(segment, currentSpeakerProfile) && silenceGap > 1.0) {
      //   shouldChangeSpeaker = true;
      //   changeReason = `Speaker profile mismatch`;
      // }
      
      // 6. Disable statistical outlier detection (too aggressive)
      // else if (isStatisticalOutlier(segment, prevSegment, stats) && silenceGap > 2.0) {
      //   shouldChangeSpeaker = true;
      //   changeReason = `Statistical outlier`;
      // }
    }
    
    if (shouldChangeSpeaker) {
      speakerCounter++;
      currentSpeakerId = `Speaker ${speakerCounter}`;
      currentSpeakerProfile = createSpeakerProfile(segment);
      console.log(`[SPEAKER DETECTION] Speaker change at ${formatTime(segment.start)}: ${changeReason}`);
    } else {
      // Update current speaker profile with new data
      updateSpeakerProfile(currentSpeakerProfile, segment);
    }
    
    // Calculate enhanced confidence score
    const confidence = calculateEnhancedConfidence(segment, prevSegment, nextSegment, stats);
    
    speakerSegments.push({
      speakerId: currentSpeakerId,
      startTime: segment.start,
      endTime: segment.end,
      text: segment.text.trim(),
      confidence
    });
  }
  
  console.log(`[SPEAKER DETECTION] Initial detection: ${speakerCounter} speakers, ${speakerSegments.length} segments`);
  
  // Enhanced post-processing with speaker validation
  let processedSegments = enhancedMergeSegments(speakerSegments);
  processedSegments = refineSpeakerBoundaries(processedSegments);
  processedSegments = validateAndConsolidateSpeakers(processedSegments);
  
  console.log(`[SPEAKER DETECTION] Final result: ${processedSegments.length} segments`);
  return processedSegments;
}



/**
 * Group speaker segments by speaker ID for analysis
 */
export function groupSegmentsBySpeaker(segments: SpeakerSegment[]): Record<string, DetectedSpeaker> {
  const speakers: Record<string, DetectedSpeaker> = {};
  
  segments.forEach(segment => {
    if (!speakers[segment.speakerId]) {
      speakers[segment.speakerId] = {
        id: segment.speakerId,
        name: null,
        segments: [],
        totalDuration: 0
      };
    }
    
    speakers[segment.speakerId].segments.push(segment);
    speakers[segment.speakerId].totalDuration += (segment.endTime - segment.startTime);
  });
  
  return speakers;
}

/**
 * Format time in MM:SS format for display
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate statistical baselines for the conversation
 */
function calculateSegmentStats(segments: TranscriptionSegment[]): SegmentStats {
  if (segments.length === 0) {
    return {
      avgGap: 1.0,
      avgLogProbVariation: 0.3,
      avgCompressionRatio: 2.0,
      avgNoSpeechProb: 0.1,
      totalDuration: 0
    };
  }

  let totalGap = 0;
  let gapCount = 0;
  let logProbSum = 0;
  let logProbVarianceSum = 0;
  let compressionSum = 0;
  let noSpeechSum = 0;

  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end;
    if (gap > 0) {
      totalGap += gap;
      gapCount++;
    }

    logProbSum += segments[i].avg_logprob;
    compressionSum += segments[i].compression_ratio;
    noSpeechSum += segments[i].no_speech_prob;
  }

  const avgLogProb = logProbSum / segments.length;
  
  // Calculate log prob variation
  for (let i = 1; i < segments.length; i++) {
    const variation = Math.abs(segments[i].avg_logprob - segments[i - 1].avg_logprob);
    logProbVarianceSum += variation;
  }

  const totalDuration = segments[segments.length - 1].end - segments[0].start;

  return {
    avgGap: gapCount > 0 ? totalGap / gapCount : 1.0,
    avgLogProbVariation: segments.length > 1 ? logProbVarianceSum / (segments.length - 1) : 0.3,
    avgCompressionRatio: compressionSum / segments.length,
    avgNoSpeechProb: noSpeechSum / segments.length,
    totalDuration
  };
}

/**
 * Create a speaker profile from a segment
 */
function createSpeakerProfile(segment: TranscriptionSegment): SpeakerProfile {
  return {
    avgLogProb: segment.avg_logprob,
    avgCompressionRatio: segment.compression_ratio,
    avgNoSpeechProb: segment.no_speech_prob,
    segmentCount: 1,
    totalDuration: segment.end - segment.start
  };
}

/**
 * Update speaker profile with new segment data
 */
function updateSpeakerProfile(profile: SpeakerProfile, segment: TranscriptionSegment): void {
  const newCount = profile.segmentCount + 1;
  const duration = segment.end - segment.start;
  
  profile.avgLogProb = (profile.avgLogProb * profile.segmentCount + segment.avg_logprob) / newCount;
  profile.avgCompressionRatio = (profile.avgCompressionRatio * profile.segmentCount + segment.compression_ratio) / newCount;
  profile.avgNoSpeechProb = (profile.avgNoSpeechProb * profile.segmentCount + segment.no_speech_prob) / newCount;
  profile.segmentCount = newCount;
  profile.totalDuration += duration;
}

/**
 * Check if segment matches speaker profile
 */
function matchesSpeakerProfile(segment: TranscriptionSegment, profile: SpeakerProfile): boolean {
  const logProbDiff = Math.abs(segment.avg_logprob - profile.avgLogProb);
  const compressionDiff = Math.abs(segment.compression_ratio - profile.avgCompressionRatio);
  const noSpeechDiff = Math.abs(segment.no_speech_prob - profile.avgNoSpeechProb);
  
  // Thresholds for matching (these can be tuned)
  return logProbDiff < 0.4 && compressionDiff < 0.7 && noSpeechDiff < 0.3;
}

/**
 * Detect statistical outliers
 */
function isStatisticalOutlier(
  segment: TranscriptionSegment, 
  prevSegment: TranscriptionSegment, 
  stats: SegmentStats
): boolean {
  const logProbChange = Math.abs(segment.avg_logprob - prevSegment.avg_logprob);
  const compressionChange = Math.abs(segment.compression_ratio - prevSegment.compression_ratio);
  
  // Outlier if changes are significantly above average
  return logProbChange > (stats.avgLogProbVariation * 2.5) || 
         compressionChange > 1.0;
}

/**
 * Calculate enhanced confidence score
 */
function calculateEnhancedConfidence(
  segment: TranscriptionSegment,
  prevSegment: TranscriptionSegment | null,
  nextSegment: TranscriptionSegment | null,
  stats: SegmentStats
): number {
  let confidence = 0.7; // Base confidence
  
  // Higher confidence for clear speech
  if (segment.no_speech_prob < 0.1) {
    confidence += 0.15;
  }
  
  // Higher confidence for good audio quality
  if (segment.avg_logprob > -0.3) {
    confidence += 0.1;
  }
  
  // Higher confidence for reasonable compression
  if (segment.compression_ratio > 1.5 && segment.compression_ratio < 3.5) {
    confidence += 0.05;
  }
  
  // Consistency with neighboring segments
  if (prevSegment) {
    const consistency = 1 - Math.abs(segment.avg_logprob - prevSegment.avg_logprob);
    confidence += Math.max(0, consistency * 0.1);
  }
  
  // Lower confidence for very short segments
  const duration = segment.end - segment.start;
  if (duration < 0.5) {
    confidence -= 0.2;
  } else if (duration > 2.0) {
    confidence += 0.05;
  }
  
  return Math.max(0.2, Math.min(1.0, confidence));
}

/**
 * Enhanced segment merging with better logic
 */
function enhancedMergeSegments(segments: SpeakerSegment[]): SpeakerSegment[] {
  if (segments.length === 0) return segments;
  
  const merged: SpeakerSegment[] = [];
  let current = { ...segments[0] };
  
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    const gap = segment.startTime - current.endTime;
    
    // More aggressive merge conditions for better consolidation:
    // 1. Same speaker and reasonable gap (increased from 0.8 to 2.0)
    // 2. Short segments (< 5 seconds) with same speaker
    // 3. Single word or very short segments
    const shouldMerge = (
      current.speakerId === segment.speakerId && (
        gap < 2.0 || 
        (current.endTime - current.startTime) < 5.0 ||
        current.text.split(' ').length <= 3
      )
    );
    
    if (shouldMerge) {
      current.endTime = segment.endTime;
      current.text = current.text + (gap > 0.1 ? ' ' : '') + segment.text;
      current.confidence = Math.min(current.confidence, segment.confidence);
    } else {
      merged.push(current);
      current = { ...segment };
    }
  }
  
  merged.push(current);
  return merged;
}

/**
 * Refine speaker boundaries using context
 */
function refineSpeakerBoundaries(segments: SpeakerSegment[]): SpeakerSegment[] {
  if (segments.length < 3) return segments;
  
  // Look for isolated short segments that might be misclassified
  for (let i = 1; i < segments.length - 1; i++) {
    const prev = segments[i - 1];
    const current = segments[i];
    const next = segments[i + 1];
    
    const currentDuration = current.endTime - current.startTime;
    const prevDuration = prev.endTime - prev.startTime;
    const nextDuration = next.endTime - next.startTime;
    
    // If current segment is very short and surrounded by same speaker
    if (currentDuration < 1.0 && 
        prev.speakerId === next.speakerId && 
        prev.speakerId !== current.speakerId &&
        prevDuration > 2.0 && nextDuration > 2.0) {
      
      // Reassign to surrounding speaker
      current.speakerId = prev.speakerId;
      current.confidence *= 0.7; // Lower confidence for reassigned segments
    }
  }
  
  // Final merge pass after boundary refinement
  return enhancedMergeSegments(segments);
}

/**
 * Validate speaker count and consolidate over-segmented speakers
 */
function validateAndConsolidateSpeakers(segments: SpeakerSegment[]): SpeakerSegment[] {
  if (segments.length === 0) return segments;
  
  // Calculate total duration and speaker statistics
  const totalDuration = Math.max(...segments.map(s => s.endTime));
  const speakerStats = new Map<string, { duration: number; segmentCount: number; segments: SpeakerSegment[] }>();
  
  // Collect speaker statistics
  for (const segment of segments) {
    const duration = segment.endTime - segment.startTime;
    if (!speakerStats.has(segment.speakerId)) {
      speakerStats.set(segment.speakerId, { duration: 0, segmentCount: 0, segments: [] });
    }
    const stats = speakerStats.get(segment.speakerId)!;
    stats.duration += duration;
    stats.segmentCount += 1;
    stats.segments.push(segment);
  }
  
  const speakerCount = speakerStats.size;
  console.log(`[SPEAKER VALIDATION] Analyzing ${speakerCount} speakers over ${totalDuration.toFixed(1)}s`);
  
  // If we have more than 3 speakers (most podcasts are 1-2 speakers), consolidate aggressively
  if (speakerCount > 3) {
    console.log(`[SPEAKER VALIDATION] Too many speakers (${speakerCount}), consolidating aggressively...`);
    
    // Sort speakers by duration (smallest first)
    const sortedSpeakers = Array.from(speakerStats.entries())
      .sort(([, a], [, b]) => a.duration - b.duration);
    
    // Much more aggressive consolidation - merge speakers < 5% of total duration OR < 30 seconds
    const minDuration = Math.max(30, totalDuration * 0.05); // 5% or 30 seconds
    const speakersToMerge: string[] = [];
    
    for (const [speakerId, stats] of sortedSpeakers) {
      if (stats.duration < minDuration && speakersToMerge.length < speakerCount - 2) { // Keep only top 2 speakers
        speakersToMerge.push(speakerId);
        console.log(`[SPEAKER VALIDATION] Marking ${speakerId} for consolidation (${stats.duration.toFixed(1)}s < ${minDuration.toFixed(1)}s)`);
      }
    }
    
    // Merge small speakers with their nearest neighbors
    const consolidatedSegments: SpeakerSegment[] = [];
    
    for (const segment of segments) {
      if (speakersToMerge.includes(segment.speakerId)) {
        // Find the best speaker to merge with (based on timing)
        const nearestSpeaker = findNearestLargeSpeaker(segment, segments, speakersToMerge);
        consolidatedSegments.push({
          ...segment,
          speakerId: nearestSpeaker,
          confidence: segment.confidence * 0.8 // Lower confidence for merged segments
        });
      } else {
        consolidatedSegments.push(segment);
      }
    }
    
    console.log(`[SPEAKER VALIDATION] Consolidated ${speakersToMerge.length} small speakers`);
    return enhancedMergeSegments(consolidatedSegments); // Re-merge after consolidation
  }
  
  // If speaker count is reasonable, just clean up very short segments
  if (speakerCount <= 6) {
    const cleanedSegments: SpeakerSegment[] = [];
    
    for (const segment of segments) {
      const duration = segment.endTime - segment.startTime;
      
      // Merge very short segments (< 3 seconds) with neighbors
      if (duration < 3.0) {
        const nearestSpeaker = findNearestLargeSpeaker(segment, segments, []);
        if (nearestSpeaker !== segment.speakerId) {
          cleanedSegments.push({
            ...segment,
            speakerId: nearestSpeaker,
            confidence: segment.confidence * 0.9
          });
          continue;
        }
      }
      
      cleanedSegments.push(segment);
    }
    
    console.log(`[SPEAKER VALIDATION] Cleaned up short segments`);
    return enhancedMergeSegments(cleanedSegments);
  }
  
  return segments;
}

/**
 * Find the nearest speaker that isn't in the exclusion list
 */
function findNearestLargeSpeaker(
  targetSegment: SpeakerSegment, 
  allSegments: SpeakerSegment[], 
  excludeSpeakers: string[]
): string {
  let nearestSpeaker = targetSegment.speakerId;
  let smallestDistance = Infinity;
  
  for (const segment of allSegments) {
    if (excludeSpeakers.includes(segment.speakerId) || segment.speakerId === targetSegment.speakerId) {
      continue;
    }
    
    // Calculate temporal distance
    const distance = Math.min(
      Math.abs(segment.startTime - targetSegment.endTime),
      Math.abs(segment.endTime - targetSegment.startTime)
    );
    
    if (distance < smallestDistance) {
      smallestDistance = distance;
      nearestSpeaker = segment.speakerId;
    }
  }
  
  return nearestSpeaker;
}