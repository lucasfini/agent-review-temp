// Two-Pass Speaker Attribution System
// Orchestrates Pass 1 (GPT Intelligence) and Pass 2 (Claude Reassignment)
// Provides final clean speaker attribution with quality checks

import { identifySpeakers, IntelligentSpeaker, SpeakerIntelligenceResult, ProjectType } from './speaker-intelligence';
import { reassignTranscript, ReassignedUtterance, TranscriptReassignmentResult } from './transcript-reassignment';
import { SpeakerSegment } from './types';

export interface TwoPassResult {
  // Clean speaker list from Pass 1
  speakers: IntelligentSpeaker[];

  // Reassigned transcript from Pass 2
  utterances: ReassignedUtterance[];

  // Quality checks
  qualityPassed: boolean;
  qualityIssues: string[];

  // Diagnostics
  diagnostics: {
    pass1: string[];
    pass2: string[];
  };

  // Statistics
  stats: {
    originalSpeakerCount: number;
    finalSpeakerCount: number;
    speakersConsolidated: number;
    totalUtterances: number;
    ambiguousAssignments: number;
  };
}

export interface TwoPassOptions {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  gptModel?: string;
  claudeModel?: string;
  projectTitle?: string;
  projectType?: ProjectType;
  userId?: string;
  projectId?: string;
}

/**
 * Run two-pass speaker attribution system
 *
 * Pass 1 (GPT): Identify true speakers, consolidate identities, assign roles
 * Pass 2 (Claude): Reassign all utterances to correct speakers
 *
 * @param segments - Speaker segments from AssemblyAI diarization
 * @param options - Configuration options
 * @returns Clean speaker list and reassigned transcript
 */
export async function runTwoPassAttribution(
  segments: SpeakerSegment[],
  options: TwoPassOptions = {}
): Promise<TwoPassResult> {
  console.log('\n========================================');
  console.log('TWO-PASS SPEAKER ATTRIBUTION');
  console.log('========================================\n');

  const startTime = Date.now();

  // Convert segments to utterances format
  const utterances = segments.map(seg => ({
    speaker_id: seg.speakerId,
    text: seg.text,
    start: seg.startTime,
    end: seg.endTime
  }));

  const originalSpeakerCount = new Set(utterances.map(u => u.speaker_id)).size;

  console.log(`Input: ${utterances.length} utterances from ${originalSpeakerCount} detected speakers\n`);

  // ============================================
  // PASS 1: SPEAKER INTELLIGENCE (GPT)
  // ============================================
  console.log('--- PASS 1: SPEAKER INTELLIGENCE (GPT) ---\n');

  let pass1Result: SpeakerIntelligenceResult;
  try {
    pass1Result = await identifySpeakers(utterances, {
      apiKey: options.openaiApiKey,
      model: options.gptModel,
      projectTitle: options.projectTitle,
      projectType: options.projectType
    });

    console.log(`\n✓ Pass 1 complete: ${pass1Result.speakers.length} speakers identified`);
    console.log(`  Quality checks: ${pass1Result.qualityChecks.passed ? 'PASSED ✓' : 'FAILED ✗'}`);

    if (!pass1Result.qualityChecks.passed) {
      console.warn('  Issues:', pass1Result.qualityChecks.issues);
    }

  } catch (error: any) {
    console.error('✗ Pass 1 failed:', error.message);
    throw new Error(`Pass 1 (Speaker Intelligence) failed: ${error.message}`);
  }

  // Early exit if quality checks failed
  if (!pass1Result.qualityChecks.passed) {
    console.error('\n✗ Quality checks failed - aborting');
    return {
      speakers: pass1Result.speakers,
      utterances: utterances.map(u => ({
        originalSpeakerId: u.speaker_id,
        assignedSpeakerId: u.speaker_id,
        assignedSpeakerName: 'Unknown',
        text: u.text,
        start: u.start,
        end: u.end,
        confidence: 0.0
      })),
      qualityPassed: false,
      qualityIssues: pass1Result.qualityChecks.issues,
      diagnostics: {
        pass1: pass1Result.diagnostics,
        pass2: []
      },
      stats: {
        originalSpeakerCount,
        finalSpeakerCount: pass1Result.speakers.length,
        speakersConsolidated: 0,
        totalUtterances: utterances.length,
        ambiguousAssignments: 0
      }
    };
  }

  // ============================================
  // PASS 2: TRANSCRIPT REASSIGNMENT (CLAUDE)
  // ============================================
  console.log('\n--- PASS 2: TRANSCRIPT REASSIGNMENT (CLAUDE) ---\n');

  let pass2Result: TranscriptReassignmentResult;
  try {
    pass2Result = await reassignTranscript(utterances, pass1Result.speakers, {
      apiKey: options.anthropicApiKey,
      model: options.claudeModel
    });

    console.log(`\n✓ Pass 2 complete: ${pass2Result.utterances.length} utterances reassigned`);
    console.log(`  Speakers consolidated: ${pass2Result.stats.speakersConsolidated}`);
    console.log(`  Ambiguous assignments: ${pass2Result.stats.ambiguousAssignments}`);

  } catch (error: any) {
    console.error('✗ Pass 2 failed:', error.message);
    throw new Error(`Pass 2 (Transcript Reassignment) failed: ${error.message}`);
  }

  // ============================================
  // FINAL VALIDATION
  // ============================================
  const finalValidation = validateFinalOutput(
    pass1Result.speakers,
    pass2Result.utterances
  );

  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n========================================');
  console.log('TWO-PASS ATTRIBUTION COMPLETE');
  console.log('========================================');
  console.log(`Time: ${elapsedTime}s`);
  console.log(`Original speakers: ${originalSpeakerCount}`);
  console.log(`Final speakers: ${pass1Result.speakers.length}`);
  console.log(`Consolidated: ${pass2Result.stats.speakersConsolidated}`);
  console.log(`Quality: ${finalValidation.passed ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log('========================================\n');

  return {
    speakers: pass1Result.speakers,
    utterances: pass2Result.utterances,
    qualityPassed: finalValidation.passed,
    qualityIssues: finalValidation.issues,
    diagnostics: {
      pass1: pass1Result.diagnostics,
      pass2: pass2Result.diagnostics
    },
    stats: {
      originalSpeakerCount,
      finalSpeakerCount: pass1Result.speakers.length,
      speakersConsolidated: pass2Result.stats.speakersConsolidated,
      totalUtterances: pass2Result.utterances.length,
      ambiguousAssignments: pass2Result.stats.ambiguousAssignments
    }
  };
}

/**
 * Validate final output quality
 */
function validateFinalOutput(
  speakers: IntelligentSpeaker[],
  utterances: ReassignedUtterance[]
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check 1: All utterances must be assigned to known speakers
  const knownSpeakerIds = new Set(speakers.map(s => s.id));
  const assignedSpeakerIds = new Set(utterances.map(u => u.assignedSpeakerId));

  for (const assignedId of assignedSpeakerIds) {
    if (!knownSpeakerIds.has(assignedId)) {
      issues.push(`Utterance assigned to unknown speaker: ${assignedId}`);
    }
  }

  // Check 2: No unassigned utterances
  const unassigned = utterances.filter(u => !u.assignedSpeakerId || !u.assignedSpeakerName);
  if (unassigned.length > 0) {
    issues.push(`${unassigned.length} utterances left unassigned`);
  }

  // Check 3: Warn if too many ambiguous assignments (>30%)
  const ambiguousCount = utterances.filter(u => u.confidence < 0.8).length;
  const ambiguousPercent = (ambiguousCount / utterances.length) * 100;
  if (ambiguousPercent > 30) {
    issues.push(`High ambiguity: ${ambiguousPercent.toFixed(1)}% of assignments are uncertain`);
  }

  return {
    passed: issues.length === 0,
    issues
  };
}

/**
 * Convert two-pass result back to speaker segments format
 * Useful for integration with existing pipeline
 */
export function convertToSpeakerSegments(result: TwoPassResult): {
  segments: SpeakerSegment[];
  speakers: Record<string, any>;
} {
  const segments: SpeakerSegment[] = result.utterances.map(u => ({
    speakerId: u.assignedSpeakerId,
    startTime: u.start,
    endTime: u.end,
    text: u.text,
    confidence: u.confidence
  }));

  const speakers: Record<string, any> = {};
  for (const speaker of result.speakers) {
    speakers[speaker.id] = {
      id: speaker.id,
      finalName: speaker.name,
      role: speaker.role,
      roleConfidence: speaker.confidence,
      extractedName: {
        name: speaker.name,
        confidence: speaker.confidence,
        context: speaker.evidence.join(' | ')
      },
      twoPassAttribution: true,
      aliases: speaker.aliases
    };
  }

  return { segments, speakers };
}
