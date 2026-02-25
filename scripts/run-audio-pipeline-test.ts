#!/usr/bin/env ts-node
/**
 * Run AssemblyAI -> refactored speaker pipeline on a local audio file
 * and write a JSON report for inspection.
 *
 * Usage:
 *   npx ts-node scripts/run-audio-pipeline-test.ts \
 *     --audio "docs/audio/yourfile.mp4" \
 *     --project-type DEBATE \
 *     --speaker-count 9 \
 *     --output /tmp/pipeline-report.json \
 *     --baseline /path/to/previous.json
 */

import path from 'path';
import { promises as fs } from 'fs';
import { checkAssemblyAIAvailability, transcribeWithAssemblyAI } from '../lib/assemblyai-integration';
import { runRefactoredSpeakerPipeline } from '../lib/refactored-speaker-pipeline';
import { SpeakerSegment } from '../lib/types';

type QualitySummary = {
  selfIdChecks: {
    total: number;
    matched: number;
    accuracy: number;
    mismatches: Array<{ detected: string; speakerName: string | null; text: string }>;
  };
  unnamedSpeakers: number;
  duplicateNamedSpeakers: Array<{ name: string; ids: string[] }>;
};

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function extractSelfId(text: string): string | null {
  const patterns = [
    /\bmy name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /\bI am\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /\bI'm\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

function buildQualitySummary(
  segments: SpeakerSegment[],
  speakerNameById: Record<string, string | null>
): QualitySummary {
  const mismatches: Array<{ detected: string; speakerName: string | null; text: string }> = [];
  let matched = 0;
  let total = 0;

  for (const seg of segments) {
    const selfId = extractSelfId(seg.text || '');
    if (!selfId) continue;
    total += 1;
    const detected = normalizeName(selfId);
    const speakerId = seg.finalSpeakerId || seg.speakerId;
    const speakerName = speakerId ? speakerNameById[speakerId] || null : null;
    const normalizedSpeaker = speakerName ? normalizeName(speakerName) : '';
    if (normalizedSpeaker && normalizedSpeaker.includes(detected)) {
      matched += 1;
    } else {
      mismatches.push({ detected: selfId, speakerName, text: seg.text });
    }
  }

  const nameToIds: Record<string, string[]> = {};
  Object.entries(speakerNameById).forEach(([id, name]) => {
    if (!name) return;
    const key = normalizeName(name);
    if (!nameToIds[key]) nameToIds[key] = [];
    nameToIds[key].push(id);
  });

  const duplicateNamedSpeakers = Object.entries(nameToIds)
    .filter(([_, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ name, ids }));

  const unnamedSpeakers = Object.values(speakerNameById).filter(name => !name).length;

  return {
    selfIdChecks: {
      total,
      matched,
      accuracy: total > 0 ? matched / total : 1,
      mismatches,
    },
    unnamedSpeakers,
    duplicateNamedSpeakers,
  };
}

async function main() {
  const defaultAudio = 'docs/audio/MSU Presidential Debate 2026 - 93.3 CFMU (360p, h264, youtube).mp4';

  const audioPath = getArg('--audio') || defaultAudio;
  const projectType = getArg('--project-type') || 'DEBATE';
  const speakerCountRaw = getArg('--speaker-count');
  const outputPath = getArg('--output') || `/tmp/audiorepurpose-pipeline-${Date.now()}.json`;
  const baselinePath = getArg('--baseline');

  if (hasArg('--help')) {
    console.log('Usage: npx ts-node scripts/run-audio-pipeline-test.ts --audio <path> --project-type DEBATE --speaker-count 9 --output /tmp/out.json');
    process.exit(0);
  }

  const speakerCount = speakerCountRaw ? Number(speakerCountRaw) : undefined;
  if (speakerCountRaw && Number.isNaN(speakerCount)) {
    throw new Error(`Invalid --speaker-count value: ${speakerCountRaw}`);
  }

  const exists = await fs.stat(audioPath).then(() => true).catch(() => false);
  if (!exists) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const assemblyOk = await checkAssemblyAIAvailability();
  if (!assemblyOk) {
    throw new Error('AssemblyAI is not configured. Set ASSEMBLYAI_API_KEY or ASSEMBLYAI_ACCESS_KEY.');
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  console.log(`[TEST] Audio: ${audioPath}`);
  console.log(`[TEST] Project type: ${projectType}`);
  if (speakerCount) console.log(`[TEST] Speaker count hint: ${speakerCount}`);

  const assemblyResult = await transcribeWithAssemblyAI(audioPath, {
    speakerLabels: true,
    speakersExpected: speakerCount,
  });

  if (!assemblyResult.success || !assemblyResult.speaker_segments) {
    throw new Error(`AssemblyAI transcription failed: ${assemblyResult.error || 'Unknown error'}`);
  }

  const pipeline = await runRefactoredSpeakerPipeline(assemblyResult.speaker_segments, {
    projectType,
    speakerCount,
    filename: path.basename(audioPath),
    mappingMode: 'csp',
  });

  const speakerNameById: Record<string, string | null> = {};
  pipeline.speakers.forEach(s => {
    speakerNameById[s.id] = s.name || null;
  });

  const qualitySummary = buildQualitySummary(pipeline.segments, speakerNameById);

  const output = {
    audioPath,
    projectType,
    speakerCount,
    assemblyMetadata: assemblyResult.metadata,
    speakerData: pipeline.speakerData,
    diagnostics: pipeline.diagnostics,
    qualitySummary,
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`[TEST] Wrote report: ${outputPath}`);

  if (baselinePath) {
    const baselineRaw = await fs.readFile(baselinePath, 'utf8');
    const baseline = JSON.parse(baselineRaw);
    const baselineNames = new Set(
      (baseline?.speakerData?.speakers ? Object.values(baseline.speakerData.speakers) : [])
        .map((s: any) => s?.name)
        .filter(Boolean)
        .map((name: string) => normalizeName(name))
    );
    const currentNames = new Set(
      pipeline.speakers
        .map(s => s.name)
        .filter(Boolean)
        .map(name => normalizeName(name as string))
    );

    const added = Array.from(currentNames).filter(n => !baselineNames.has(n));
    const removed = Array.from(baselineNames).filter(n => !currentNames.has(n));

    console.log('[TEST] Baseline comparison:');
    console.log(`  Added names: ${added.length ? added.join(', ') : 'none'}`);
    console.log(`  Removed names: ${removed.length ? removed.join(', ') : 'none'}`);
  }
}

main().catch(err => {
  console.error('[TEST] Failed:', err.message || err);
  process.exit(1);
});
