// REFACTORED SPEAKER ATTRIBUTION PIPELINE
//
// Architecture:
// AssemblyAI (diarization) → GPT-4o (speaker intelligence) → GPT-4o-mini (reassignment)
//
// GPT-4o is the SINGLE SOURCE OF TRUTH for speakers
// GPT-4o-mini assigns AssemblyAI IDs to GPT speakers (low AI cost)

import { SpeakerSegment } from './types';
import {
  identifySpeakersWithGPT,
  GPTSpeaker,
  GPTSpeakerIntelligenceResult,
  getGPTSpeakerById
} from './gpt-speaker-intelligence';
import {
  reassignSegmentsWithGPT,
  GPTReassignmentResult
} from './gpt-segment-reassignment';

export interface RefactoredPipelineResult {
  // Authoritative speakers from GPT (Pass 1)
  speakers: GPTSpeaker[];

  // Reassigned segments from deterministic mapping (Pass 2)
  segments: SpeakerSegment[];

  // Speaker data in legacy format for compatibility
  speakerData: {
    speakers: Record<string, any>;
    segments: SpeakerSegment[];
    detectionMetadata: {
      totalSpeakers: number;
      totalSegments: number;
      method: string;
      gptValidationErrors: string[];
    };
  };

  // Diagnostics
  diagnostics: {
    gptRawResponse: string;
    mappings: Record<string, string>;
    mappingConfidence: Record<string, number>;
    originalSpeakerCount: number;
    finalSpeakerCount: number;
  };
}

/**
 * Run refactored speaker attribution pipeline
 *
 * ARCHITECTURE:
 * 1. AssemblyAI provides raw speaker segments (already done)
 * 2. GPT-4o identifies authoritative speakers (Pass 1) - ~$0.01-0.02
 * 3. GPT-4o-mini assigns segments to GPT speakers (Pass 2) - ~$0.005-0.01
 * 4. Validation enforces GPT authority
 *
 * COST: ~$0.015-0.03 per transcript (GPT-4o + GPT-4o-mini)
 *
 * @param segments - Raw speaker segments from AssemblyAI
 * @param options - Configuration options
 * @returns Speaker attribution result with validation
 */
export async function runRefactoredSpeakerPipeline(
  segments: SpeakerSegment[],
  options: {
    openaiApiKey?: string;
    gptModel?: string;
    userId?: string;
    projectId?: string;
  } = {}
): Promise<RefactoredPipelineResult> {
  console.log('\n========================================');
  console.log('REFACTORED SPEAKER PIPELINE');
  console.log('========================================\n');

  const startTime = Date.now();
  const originalSpeakerIds = new Set(segments.map(s => s.speakerId));
  const originalSpeakerCount = originalSpeakerIds.size;

  console.log(`Input: ${segments.length} segments from ${originalSpeakerCount} AssemblyAI speakers\n`);

  // ============================================
  // PASS 1: GPT SPEAKER INTELLIGENCE
  // ============================================
  console.log('--- PASS 1: GPT SPEAKER INTELLIGENCE ---\n');

  let gptResult: GPTSpeakerIntelligenceResult;
  try {
    gptResult = await identifySpeakersWithGPT(segments, {
      apiKey: options.openaiApiKey,
      model: options.gptModel
    });

    console.log(`\n✓ Pass 1 complete: ${gptResult.speakers.length} authoritative speakers identified`);

    if (gptResult.validationErrors.length > 0) {
      console.error('✗ GPT validation errors:', gptResult.validationErrors);
      throw new Error(`GPT speaker intelligence validation failed: ${gptResult.validationErrors.join('; ')}`);
    }

  } catch (error: any) {
    console.error('✗ Pass 1 failed:', error.message);
    throw new Error(`Pass 1 (GPT Speaker Intelligence) failed: ${error.message}`);
  }

  // ============================================
  // PASS 2: GPT-4o-mini SEGMENT REASSIGNMENT
  // ============================================
  console.log('\n--- PASS 2: GPT-4o-mini SEGMENT REASSIGNMENT ---\n');

  let mappingResult: GPTReassignmentResult;
  try {
    mappingResult = await reassignSegmentsWithGPT(segments, gptResult.speakers, {
      apiKey: options.openaiApiKey,
      model: 'gpt-4o-mini'
    });

    console.log(`\n✓ Pass 2 complete: ${mappingResult.segments.length} segments reassigned`);
    console.log(`  Mappings: ${Object.keys(mappingResult.mappings).length}`);
    console.log(`  Ambiguous: ${mappingResult.ambiguousAssignments}`);
    console.log(`  Cost: ~$0.005-0.01 (GPT-4o-mini)`);

  } catch (error: any) {
    console.error('✗ Pass 2 failed:', error.message);
    throw new Error(`Pass 2 (GPT-4o-mini Reassignment) failed: ${error.message}`);
  }

  // ============================================
  // BUILD FINAL OUTPUT
  // ============================================

  // Convert to legacy speaker data format
  const speakerData = convertToLegacyFormat(gptResult.speakers, mappingResult.segments);

  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n========================================');
  console.log('PIPELINE COMPLETE');
  console.log('========================================');
  console.log(`Time: ${elapsedTime}s`);
  console.log(`Original speakers: ${originalSpeakerCount}`);
  console.log(`Final speakers: ${gptResult.speakers.length}`);
  console.log(`Validation: PASSED ✓`);
  console.log('========================================\n');

  return {
    speakers: gptResult.speakers,
    segments: mappingResult.segments,
    speakerData,
    diagnostics: {
      gptRawResponse: gptResult.rawResponse,
      mappings: mappingResult.mappings,
      mappingConfidence: {}, // GPT-4o-mini doesn't provide per-mapping confidence
      originalSpeakerCount,
      finalSpeakerCount: gptResult.speakers.length
    }
  };
}

/**
 * Convert GPT speakers and reassigned segments to legacy format
 * for compatibility with existing UI/database
 */
function convertToLegacyFormat(
  gptSpeakers: GPTSpeaker[],
  reassignedSegments: Array<{ speakerId: string; text: string; startTime: number; endTime: number; confidence: number }>
): {
  speakers: Record<string, any>;
  segments: SpeakerSegment[];
  detectionMetadata: any;
} {
  const speakers: Record<string, any> = {};

  // Build speaker records
  for (const gptSpeaker of gptSpeakers) {
    const speakerSegments = reassignedSegments.filter(s => s.speakerId === gptSpeaker.id);

    speakers[gptSpeaker.id] = {
      id: gptSpeaker.id,
      finalName: gptSpeaker.name || gptSpeaker.role.replace('_', ' '),
      role: gptSpeaker.role,
      roleConfidence: gptSpeaker.confidence,
      extractedName: gptSpeaker.name ? {
        name: gptSpeaker.name,
        confidence: gptSpeaker.confidence,
        context: 'GPT speaker intelligence'
      } : null,
      segments: speakerSegments.map(s => ({
        speakerId: s.speakerId,
        startTime: s.startTime,
        endTime: s.endTime,
        text: s.text,
        confidence: s.confidence
      })),
      totalDuration: speakerSegments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0),
      segmentCount: speakerSegments.length,
      gptAttribution: true
    };
  }

  const segments: SpeakerSegment[] = reassignedSegments.map(s => ({
    speakerId: s.speakerId,
    startTime: s.startTime,
    endTime: s.endTime,
    text: s.text,
    confidence: s.confidence
  }));

  return {
    speakers,
    segments,
    detectionMetadata: {
      totalSpeakers: gptSpeakers.length,
      totalSegments: segments.length,
      method: 'gpt-pipeline',
      gptValidationErrors: [],
      ambiguousAssignments: reassignedSegments.filter(s => s.confidence < 0.8).length
    }
  };
}

/**
 * Test function - run pipeline on sample data
 */
export async function testRefactoredPipeline() {
  const testSegments: SpeakerSegment[] = [
    {
      speakerId: 'Speaker_A',
      startTime: 0,
      endTime: 5,
      text: "Welcome to Raging Moderates, I'm Jessica Tarlov",
      confidence: 0.95
    },
    {
      speakerId: 'Speaker_B',
      startTime: 5,
      endTime: 8,
      text: "And I'm Harold Ford Jr.",
      confidence: 0.94
    },
    {
      speakerId: 'Speaker_A',
      startTime: 8,
      endTime: 12,
      text: "Today we're discussing the latest from New York",
      confidence: 0.93
    },
    {
      speakerId: 'Speaker_C',
      startTime: 60,
      endTime: 75,
      text: "This episode is brought to you by our sponsor. Visit example.com",
      confidence: 0.90
    }
  ];

  console.log('Testing refactored pipeline with sample data...\n');

  try {
    const result = await runRefactoredSpeakerPipeline(testSegments);

    console.log('\n=== TEST RESULTS ===\n');
    console.log('Speakers identified by GPT:');
    result.speakers.forEach(s => {
      console.log(`  ${s.id}: ${s.name || '(unnamed)'} [${s.role}] (conf: ${s.confidence})`);
    });

    console.log('\nSegments reassigned by GPT-4o-mini:');
    result.segments.slice(0, 3).forEach(s => {
      console.log(`  ${s.speakerId}: "${s.text.substring(0, 50)}..."`);
    });

    console.log('\nDiagnostics:');
    console.log(`  Original speakers: ${result.diagnostics.originalSpeakerCount}`);
    console.log(`  Final speakers: ${result.diagnostics.finalSpeakerCount}`);
    console.log(`  Mappings:`, result.diagnostics.mappings);

    return result;

  } catch (error: any) {
    console.error('\n✗ TEST FAILED:', error.message);
    throw error;
  }
}
