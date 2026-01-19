#!/usr/bin/env ts-node
/**
 * Test script for refactored speaker attribution pipeline
 *
 * Tests:
 * 1. GPT API connection and speaker intelligence
 * 2. Claude API connection and segment reassignment
 * 3. Full pipeline integration
 * 4. Validation enforcement
 *
 * Usage:
 *   npx ts-node scripts/test-refactored-pipeline.ts
 *
 * Requirements:
 *   - OPENAI_API_KEY in environment
 *   - ANTHROPIC_API_KEY in environment
 */

import { identifySpeakersWithGPT } from '@/lib/gpt-speaker-intelligence';
import { reassignSegmentsWithClaude } from '@/lib/claude-segment-reassignment';
import { runRefactoredSpeakerPipeline } from '@/lib/refactored-speaker-pipeline';
import { SpeakerSegment } from '@/lib/types';

// Sample test data - realistic podcast transcript
const SAMPLE_SEGMENTS: SpeakerSegment[] = [
  {
    speakerId: 'Speaker_A',
    startTime: 0,
    endTime: 5,
    text: "Welcome to Raging Moderates, I'm Jessica Tarlov, and I'm here with my co-host Harold Ford Jr.",
    confidence: 0.95
  },
  {
    speakerId: 'Speaker_B',
    startTime: 5,
    endTime: 8,
    text: "Great to be here, Jessica. Today we're discussing the latest political developments.",
    confidence: 0.94
  },
  {
    speakerId: 'Speaker_A',
    startTime: 8,
    endTime: 12,
    text: "That's right. We've been following the news from New York and Washington.",
    confidence: 0.93
  },
  {
    speakerId: 'Speaker_B',
    startTime: 12,
    endTime: 16,
    text: "The NBC coverage has been fascinating. But Harold, what's your take on this?",
    confidence: 0.92
  },
  {
    speakerId: 'Speaker_A',
    startTime: 16,
    endTime: 20,
    text: "Well, I think we need to consider all perspectives here.",
    confidence: 0.91
  },
  {
    speakerId: 'Speaker_C',
    startTime: 60,
    endTime: 75,
    text: "This episode is brought to you by our sponsor. Visit example.com for 20% off with promo code MODERATES.",
    confidence: 0.90
  },
  {
    speakerId: 'Speaker_D',
    startTime: 120,
    endTime: 125,
    text: "In a speech today, the President said we must take immediate action.",
    confidence: 0.88
  },
  {
    speakerId: 'Speaker_E',
    startTime: 125,
    endTime: 128,
    text: "We will not stand by while this happens to our country.",
    confidence: 0.87
  },
  {
    speakerId: 'Speaker_B',
    startTime: 128,
    endTime: 132,
    text: "That was a clip from earlier today. Jessica, your thoughts?",
    confidence: 0.92
  },
  {
    speakerId: 'Speaker_A',
    startTime: 132,
    endTime: 138,
    text: "I think it's a strong message, and it resonates with what we've been saying all along.",
    confidence: 0.93
  }
];

async function testGPTConnection() {
  console.log('\n========================================');
  console.log('TEST 1: GPT API Connection');
  console.log('========================================\n');

  try {
    console.log('Testing GPT speaker intelligence...');

    const result = await identifySpeakersWithGPT(SAMPLE_SEGMENTS);

    console.log('\n✓ GPT API connection successful');
    console.log(`\nIdentified ${result.speakers.length} speakers:`);

    result.speakers.forEach(speaker => {
      console.log(`  - ${speaker.id}: ${speaker.name || '(unnamed)'} [${speaker.role}] (confidence: ${speaker.confidence})`);
    });

    if (result.validationErrors.length > 0) {
      console.warn('\n⚠️ Validation errors:', result.validationErrors);
    }

    // Check for expected speakers
    const hasJessica = result.speakers.some(s => s.name && s.name.toLowerCase().includes('jessica'));
    const hasHarold = result.speakers.some(s => s.name && s.name.toLowerCase().includes('harold'));
    const hasAdvertiser = result.speakers.some(s => s.role === 'advertiser');
    const hasQuotedAudio = result.speakers.some(s => s.role === 'quoted_audio');

    console.log('\nExpected results:');
    console.log(`  Jessica Tarlov identified: ${hasJessica ? '✓' : '✗'}`);
    console.log(`  Harold Ford identified: ${hasHarold ? '✓' : '✗'}`);
    console.log(`  Advertiser role assigned: ${hasAdvertiser ? '✓' : '✗'}`);
    console.log(`  Quoted audio role assigned: ${hasQuotedAudio ? '✓' : '✗'}`);

    // Check for invalid speakers (locations, networks)
    const invalidNames = result.speakers.filter(s =>
      s.name &&
      (
        /new york|new jersey/i.test(s.name) ||
        /nbc|cnn|fox/i.test(s.name)
      )
    );

    if (invalidNames.length > 0) {
      console.error('\n✗ FAIL: GPT returned invalid speaker names (locations/networks):');
      invalidNames.forEach(s => console.error(`  - ${s.name}`));
      return false;
    }

    console.log('\n✓ TEST 1 PASSED');
    return true;

  } catch (error: any) {
    console.error('\n✗ TEST 1 FAILED:', error.message);
    return false;
  }
}

async function testClaudeConnection() {
  console.log('\n========================================');
  console.log('TEST 2: Claude API Connection');
  console.log('========================================\n');

  try {
    console.log('Testing Claude segment reassignment...');

    // First get speakers from GPT
    const gptResult = await identifySpeakersWithGPT(SAMPLE_SEGMENTS);

    console.log(`\nGPT identified ${gptResult.speakers.length} speakers`);
    console.log('Now testing Claude reassignment...');

    const claudeResult = await reassignSegmentsWithClaude(SAMPLE_SEGMENTS, gptResult.speakers);

    console.log('\n✓ Claude API connection successful');
    console.log(`\nReassigned ${claudeResult.segments.length} segments`);
    console.log(`Ambiguous assignments: ${claudeResult.ambiguousAssignments}`);

    console.log('\nMappings:');
    Object.entries(claudeResult.mappings).forEach(([original, assigned]) => {
      const speaker = gptResult.speakers.find(s => s.id === assigned);
      console.log(`  ${original} → ${assigned} (${speaker?.name || speaker?.role})`);
    });

    // Validate all mappings use GPT speaker IDs
    const validGPTIds = new Set(gptResult.speakers.map(s => s.id));
    const invalidMappings = Object.entries(claudeResult.mappings).filter(
      ([_, gptId]) => !validGPTIds.has(gptId)
    );

    if (invalidMappings.length > 0) {
      console.error('\n✗ FAIL: Claude used invalid speaker IDs:');
      invalidMappings.forEach(([original, invalid]) => {
        console.error(`  ${original} → ${invalid} (not in GPT speaker list)`);
      });
      return false;
    }

    console.log('\n✓ TEST 2 PASSED');
    return true;

  } catch (error: any) {
    console.error('\n✗ TEST 2 FAILED:', error.message);
    return false;
  }
}

async function testFullPipeline() {
  console.log('\n========================================');
  console.log('TEST 3: Full Pipeline Integration');
  console.log('========================================\n');

  try {
    console.log('Testing full refactored pipeline...');

    const result = await runRefactoredSpeakerPipeline(SAMPLE_SEGMENTS);

    console.log('\n✓ Pipeline completed successfully');

    console.log('\nFinal speakers:');
    result.speakers.forEach(speaker => {
      console.log(`  - ${speaker.id}: ${speaker.name || '(unnamed)'} [${speaker.role}]`);
    });

    console.log('\nDiagnostics:');
    console.log(`  Original speakers: ${result.diagnostics.originalSpeakerCount}`);
    console.log(`  Final speakers: ${result.diagnostics.finalSpeakerCount}`);
    console.log(`  Segments: ${result.segments.length}`);

    // Verify speaker data format
    const hasValidFormat = result.speakerData && result.speakerData.speakers && result.speakerData.segments;

    if (!hasValidFormat) {
      console.error('\n✗ FAIL: Invalid speaker data format');
      return false;
    }

    console.log('\n✓ TEST 3 PASSED');
    return true;

  } catch (error: any) {
    console.error('\n✗ TEST 3 FAILED:', error.message);
    return false;
  }
}

async function testValidationEnforcement() {
  console.log('\n========================================');
  console.log('TEST 4: Validation Enforcement');
  console.log('========================================\n');

  try {
    console.log('Testing that GPT rejects invalid speakers...');

    // Create segments that might trick the system
    const trickySegments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A',
        startTime: 0,
        endTime: 5,
        text: "I'm reporting from New York City.",
        confidence: 0.9
      },
      {
        speakerId: 'Speaker_B',
        startTime: 5,
        endTime: 10,
        text: "This is NBC News with the latest updates.",
        confidence: 0.9
      }
    ];

    const result = await identifySpeakersWithGPT(trickySegments);

    // Check that GPT did NOT create speakers for "New York City" or "NBC News"
    const hasLocationSpeaker = result.speakers.some(s =>
      s.name && /new york|nyc/i.test(s.name)
    );

    const hasNetworkSpeaker = result.speakers.some(s =>
      s.name && /nbc/i.test(s.name)
    );

    if (hasLocationSpeaker || hasNetworkSpeaker) {
      console.error('\n✗ FAIL: GPT created invalid speakers for locations/networks');
      console.error('  Speakers:', result.speakers.map(s => s.name));
      return false;
    }

    console.log('\n✓ GPT correctly rejected location/network names');
    console.log('  Speakers identified:', result.speakers.map(s => s.name || s.role));

    console.log('\n✓ TEST 4 PASSED');
    return true;

  } catch (error: any) {
    console.error('\n✗ TEST 4 FAILED:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║ REFACTORED PIPELINE TEST SUITE           ║');
  console.log('╚═══════════════════════════════════════════╝');

  // Check environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error('\n✗ ERROR: OPENAI_API_KEY not found in environment');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n✗ ERROR: ANTHROPIC_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('\n✓ Environment variables configured');

  const results = {
    gpt: false,
    claude: false,
    pipeline: false,
    validation: false
  };

  // Run tests sequentially
  results.gpt = await testGPTConnection();
  if (!results.gpt) {
    console.log('\nStopping tests - GPT connection failed');
  } else {
    results.claude = await testClaudeConnection();

    if (results.claude) {
      results.pipeline = await testFullPipeline();
      results.validation = await testValidationEnforcement();
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================\n');

  console.log(`1. GPT API Connection:         ${results.gpt ? '✓ PASSED' : '✗ FAILED'}`);
  console.log(`2. Claude API Connection:      ${results.claude ? '✓ PASSED' : '✗ FAILED'}`);
  console.log(`3. Full Pipeline Integration:  ${results.pipeline ? '✓ PASSED' : '✗ FAILED'}`);
  console.log(`4. Validation Enforcement:     ${results.validation ? '✓ PASSED' : '✗ FAILED'}`);

  const allPassed = Object.values(results).every(r => r);

  console.log('\n========================================');
  if (allPassed) {
    console.log('✓ ALL TESTS PASSED');
    console.log('========================================\n');
    process.exit(0);
  } else {
    console.log('✗ SOME TESTS FAILED');
    console.log('========================================\n');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n✗ FATAL ERROR:', error);
  process.exit(1);
});
