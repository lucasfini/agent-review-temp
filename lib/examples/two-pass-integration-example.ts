// Example: How to integrate two-pass speaker attribution into transcription pipeline
// This is a reference implementation - adapt to your specific needs

import { transcribeWithAssemblyAI } from '@/lib/assemblyai-integration';
import { runTwoPassAttribution, convertToSpeakerSegments } from '@/lib/two-pass-speaker-attribution';
import { createClient } from '@supabase/supabase-js';

/**
 * Example 1: Basic transcription with two-pass attribution
 */
export async function transcribeWithTwoPassAttribution(
  audioFilePath: string,
  options: {
    projectTitle?: string;
    userId?: string;
    projectId?: string;
  } = {}
) {
  console.log('Starting transcription with two-pass speaker attribution...');

  // Step 1: AssemblyAI transcription + diarization
  console.log('Step 1: AssemblyAI transcription...');
  const assemblyResult = await transcribeWithAssemblyAI(audioFilePath, {
    speakerLabels: true
  });

  if (!assemblyResult.success || !assemblyResult.speaker_segments) {
    throw new Error('AssemblyAI transcription failed');
  }

  console.log(`AssemblyAI: ${assemblyResult.metadata?.total_speakers} speakers detected`);

  // Step 2: Run two-pass speaker attribution
  console.log('Step 2: Two-pass speaker attribution...');
  const twoPassResult = await runTwoPassAttribution(
    assemblyResult.speaker_segments,
    {
      projectTitle: options.projectTitle,
      userId: options.userId,
      projectId: options.projectId
    }
  );

  // Step 3: Check quality
  if (!twoPassResult.qualityPassed) {
    console.warn('Quality checks failed!');
    console.warn('Issues:', twoPassResult.qualityIssues);

    // Decide: throw error or continue with warnings?
    // For now, log warnings and continue
  }

  // Step 4: Convert to compatible format
  const { segments, speakers } = convertToSpeakerSegments(twoPassResult);

  console.log(`Final: ${twoPassResult.stats.finalSpeakerCount} speakers (consolidated from ${twoPassResult.stats.originalSpeakerCount})`);

  return {
    transcriptionText: assemblyResult.text,
    transcriptionSegments: assemblyResult.transcription_segments,
    speakerSegments: segments,
    speakers: speakers,
    twoPassAttribution: twoPassResult,
    metadata: assemblyResult.metadata
  };
}

/**
 * Example 2: Save to Supabase with two-pass attribution
 */
export async function saveTranscriptionWithTwoPass(
  projectId: string,
  audioFilePath: string,
  projectTitle: string,
  userId: string
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Mark project as processing
  await supabase
    .from('projects')
    .update({ status: 'processing' })
    .eq('id', projectId);

  try {
    // Run transcription + two-pass attribution
    const result = await transcribeWithTwoPassAttribution(audioFilePath, {
      projectTitle,
      userId,
      projectId
    });

    // Save to database
    const updateData = {
      status: 'completed',
      transcription_text: result.transcriptionText,
      transcription_segments: result.transcriptionSegments,
      speaker_data: {
        segments: result.speakerSegments,
        speakers: result.speakers,
        detectionMetadata: {
          totalSpeakers: result.twoPassAttribution.stats.finalSpeakerCount,
          totalSegments: result.speakerSegments.length,
          processedAt: new Date().toISOString(),
          method: 'two-pass-attribution',
          qualityPassed: result.twoPassAttribution.qualityPassed,
          qualityIssues: result.twoPassAttribution.qualityIssues,
          diagnostics: result.twoPassAttribution.diagnostics,
          stats: result.twoPassAttribution.stats
        }
      },
      updated_at: new Date().toISOString()
    };

    await supabase
      .from('projects')
      .update(updateData)
      .eq('id', projectId);

    console.log('✓ Saved to database');

    return result;

  } catch (error) {
    console.error('Transcription failed:', error);

    await supabase
      .from('projects')
      .update({ status: 'failed' })
      .eq('id', projectId);

    throw error;
  }
}

/**
 * Example 3: Enable/disable two-pass attribution based on tier
 */
export async function transcribeWithTier(
  audioFilePath: string,
  tier: 'basic' | 'pro' | 'premium',
  options: {
    projectTitle?: string;
    userId?: string;
    projectId?: string;
  } = {}
) {
  // Basic tier: Use existing name extraction (no two-pass)
  if (tier === 'basic') {
    console.log('Basic tier: Using standard name extraction');
    // Use existing extractSpeakerNames function
    // ... existing code ...
  }

  // Pro/Premium tier: Use two-pass attribution
  if (tier === 'pro' || tier === 'premium') {
    console.log(`${tier} tier: Using two-pass speaker attribution`);
    return await transcribeWithTwoPassAttribution(audioFilePath, options);
  }
}

/**
 * Example 4: Fallback strategy if two-pass fails
 */
export async function transcribeWithFallback(
  audioFilePath: string,
  options: {
    projectTitle?: string;
    userId?: string;
    projectId?: string;
  } = {}
) {
  try {
    // Try two-pass attribution first
    const result = await transcribeWithTwoPassAttribution(audioFilePath, options);

    // If quality checks failed, fall back to basic extraction
    if (!result.twoPassAttribution.qualityPassed) {
      console.warn('Two-pass quality checks failed, falling back to basic extraction');
      // Fall back to existing extractSpeakerNames
      // ... existing code ...
    }

    return result;

  } catch (error) {
    console.error('Two-pass attribution failed, using fallback:', error);

    // Fallback to basic AssemblyAI + simple name extraction
    const assemblyResult = await transcribeWithAssemblyAI(audioFilePath, {
      speakerLabels: true
    });

    // ... use existing name extraction ...

    return {
      transcriptionText: assemblyResult.text,
      transcriptionSegments: assemblyResult.transcription_segments,
      speakerSegments: assemblyResult.speaker_segments,
      fallbackUsed: true
    };
  }
}

/**
 * Example 5: Quick test function
 */
export async function testTwoPassAttribution() {
  // Sample test segments
  const testSegments = [
    {
      speakerId: 'Speaker_A',
      text: "Welcome to Raging Moderates, I'm Jessica Tarlov",
      startTime: 0,
      endTime: 3,
      confidence: 0.95
    },
    {
      speakerId: 'Speaker_B',
      text: "And I'm Harold Ford Jr.",
      startTime: 3,
      endTime: 5,
      confidence: 0.94
    },
    {
      speakerId: 'Speaker_A',
      text: "Today we're discussing the latest political news from New York",
      startTime: 5,
      endTime: 9,
      confidence: 0.93
    },
    {
      speakerId: 'Speaker_C',
      text: "This episode is brought to you by our sponsor. Visit example.com for 20% off",
      startTime: 60,
      endTime: 68,
      confidence: 0.91
    },
    {
      speakerId: 'Speaker_D',
      text: "In a speech today, President Biden said...",
      startTime: 120,
      endTime: 125,
      confidence: 0.88
    },
    {
      speakerId: 'Speaker_E',
      text: "We must take action now...",
      startTime: 125,
      endTime: 128,
      confidence: 0.87
    },
    {
      speakerId: 'Speaker_B',
      text: "That clip was from earlier this week. What do you think, Jessica?",
      startTime: 128,
      endTime: 132,
      confidence: 0.92
    }
  ];

  console.log('\n=== Testing Two-Pass Attribution ===\n');

  const result = await runTwoPassAttribution(testSegments, {
    projectTitle: 'Raging Moderates Podcast'
  });

  console.log('\n=== Results ===\n');
  console.log('Speakers:');
  result.speakers.forEach(speaker => {
    console.log(`  ${speaker.id}: ${speaker.name} (${speaker.role})`);
    if (speaker.aliases && speaker.aliases.length > 0) {
      console.log(`    Aliases: ${speaker.aliases.join(', ')}`);
    }
  });

  console.log('\nStats:');
  console.log(`  Original speakers: ${result.stats.originalSpeakerCount}`);
  console.log(`  Final speakers: ${result.stats.finalSpeakerCount}`);
  console.log(`  Consolidated: ${result.stats.speakersConsolidated}`);
  console.log(`  Ambiguous assignments: ${result.stats.ambiguousAssignments}`);

  console.log('\nQuality:');
  console.log(`  Passed: ${result.qualityPassed ? 'YES ✓' : 'NO ✗'}`);
  if (result.qualityIssues.length > 0) {
    console.log(`  Issues: ${result.qualityIssues.join(', ')}`);
  }

  console.log('\nDiagnostics:');
  if (result.diagnostics.pass1.length > 0) {
    console.log('  Pass 1:', result.diagnostics.pass1.join('; '));
  }
  if (result.diagnostics.pass2.length > 0) {
    console.log('  Pass 2:', result.diagnostics.pass2.join('; '));
  }

  return result;
}

// Run test if called directly
if (require.main === module) {
  testTwoPassAttribution()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}
