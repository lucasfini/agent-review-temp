#!/usr/bin/env ts-node
/**
 * Cross-Panel Regression Test
 *
 * Extracts raw diarization segments from export JSONs (using initialSpeakerId),
 * runs them through the speaker pipeline, and compares results against
 * pre-fix baselines.
 *
 * Usage:
 *   npx tsx scripts/regression-test.ts                    # run all panels
 *   npx tsx scripts/regression-test.ts --panel bloomberg   # single panel
 *   npx tsx scripts/regression-test.ts --panel pivot       # single panel
 *   npx tsx scripts/regression-test.ts --dry-run           # show baselines only
 *
 * Requirements:
 *   - OPENAI_API_KEY in .env.local
 */

import path from 'path';
import { promises as fs, readFileSync } from 'fs';

// ── Load .env.local BEFORE any lib imports ───────────────────────────
// This must happen before dynamic imports trigger Supabase client init
(function loadEnv() {
  try {
    const content = readFileSync(path.resolve(__dirname, '..', '.env.local'), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch { /* ignore if missing */ }
})();

// ── Types ────────────────────────────────────────────────────────────

interface SpeakerSegment {
  speakerId: string;
  finalSpeakerId?: string;
  initialSpeakerId?: string;
  rawClusterId?: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
  status?: string;
  confidenceReason?: string;
}

interface PanelConfig {
  name: string;
  shortName: string;
  exportFile: string;
  speakerCount?: number;
  projectType?: string;
  filename?: string;
  baseline: BaselineSpeaker[];
}

interface BaselineSpeaker {
  key: string;
  name: string;
  role: string;
  segments: number;
}

interface TestResult {
  panel: string;
  status: 'pass' | 'warn' | 'fail';
  baselineSpeakers: BaselineSpeaker[];
  resultSpeakers: ResultSpeaker[];
  mechanismActivity: MechanismActivity;
  diffs: string[];
}

interface ResultSpeaker {
  id: string;
  name: string;
  role?: string;
  segments: number;
  source?: string;
}

interface MechanismActivity {
  handoffReassignments: number;
  clusterCoherenceClaims: number;
  clusterRedistributions: number;
  cullActions: string[];
}

// ── Panel Definitions ────────────────────────────────────────────────

const JSONS_DIR = path.resolve(__dirname, '..', 'docs', 'jsons');

const PANELS: PanelConfig[] = [
  {
    name: 'Bloomberg AI Panel',
    shortName: 'bloomberg',
    exportFile: 'Panel_Discussion_on_Putting_Artificial_Intelligence_to_Work_-_Bloomberg_Live_(youtube)-export-2026-02-13.json',
    speakerCount: 4,
    projectType: 'PANEL',
    filename: 'Panel_Discussion_on_Putting_Artificial_Intelligence_to_Work_-_Bloomberg_Live_(youtube).mp4',
    baseline: [
      { key: 'speaker_4', name: 'Host', role: 'host', segments: 25 },
      { key: 'speaker_3', name: 'Alex', role: 'guest', segments: 10 },
      { key: 'speaker_2', name: 'Tony', role: 'guest', segments: 8 },
      { key: 'speaker_1', name: 'Amy', role: 'guest', segments: 7 },
    ],
  },
  {
    name: 'WCCO Homework Panel',
    shortName: 'wcco',
    exportFile: 'Panel_Discussion_Are_Young_Students_Getting_Too_Much_Homework_-_WCCO_-_CBS_Minnesota_(youtube)-export-2026-02-13.json',
    speakerCount: undefined,
    projectType: 'PANEL',
    filename: 'Panel_Discussion_Are_Young_Students_Getting_Too_Much_Homework_-_WCCO_-_CBS_Minnesota_(youtube).mp4',
    baseline: [
      { key: 'speaker_2', name: 'speaker_2', role: 'co_host', segments: 9 },
      { key: 'speaker_1', name: 'speaker_1', role: 'host', segments: 8 },
      { key: 'speaker_3', name: 'speaker_3', role: 'guest', segments: 6 },
      { key: 'speaker_4', name: 'speaker_4', role: 'guest', segments: 4 },
    ],
  },
  {
    name: 'Pivot Podcast',
    shortName: 'pivot',
    exportFile: path.join('..', 'old-json', 'Did_Super_Bowl_Ads_Just_Predict_an_AI_Crash_Pivot_-_Pivot_with_Kara_Swisher_and_Scott_Galloway_(yout-export-2026-02-11 (2).json'),
    speakerCount: undefined,
    projectType: 'PODCAST',
    filename: 'Did_Super_Bowl_Ads_Just_Predict_an_AI_Crash_Pivot_-_Pivot_with_Kara_Swisher_and_Scott_Galloway_(yout).mp4',
    baseline: [
      { key: 'speaker_2', name: 'Scott Galloway', role: 'co_host', segments: 151 },
      { key: 'speaker_1', name: 'Kara Swisher', role: 'host', segments: 148 },
      { key: 'speaker_3', name: 'speaker_3', role: 'advertiser', segments: 1 },
      { key: 'speaker_5', name: 'Sorry', role: 'guest', segments: 1 },
      { key: 'speaker_6', name: 'Wix', role: 'advertiser', segments: 1 },
    ],
  },
  {
    name: 'Health 2.0 Conference',
    shortName: 'health',
    exportFile: 'Panel_Discussion_Health_2.0_Conference_Dubai_Spring_Edition_2023_-_Health_2.0_Conference_(youtube)-export-2026-02-13.json',
    speakerCount: 4,
    projectType: 'PANEL',
    filename: 'Panel_Discussion_Health_2.0_Conference_Dubai_Spring_Edition_2023_-_Health_2.0_Conference_(youtube).mp4',
    baseline: [
      { key: 'speaker_2', name: 'Mohsen', role: 'guest', segments: 33 },
      { key: 'speaker_1', name: 'Ankit Shah', role: 'guest', segments: 8 },
      { key: 'speaker_3', name: 'Dominique', role: 'guest', segments: 8 },
      { key: 'speaker_4', name: 'Host', role: 'host', segments: 8 },
    ],
  },
  {
    name: 'MSU Presidential Debate',
    shortName: 'msu',
    exportFile: 'MSU_Presidential_Debate_2026_-_93.3_CFMU_(360p,_h264,_youtube)-export-2026-02-13.json',
    speakerCount: 10,
    projectType: 'DEBATE',
    filename: 'MSU_Presidential_Debate_2026_-_93.3_CFMU_(360p,_h264,_youtube).mp4',
    baseline: [
      { key: 'speaker_10', name: 'Host', role: 'host', segments: 109 },
      { key: 'speaker_2', name: 'Emily Donjong', role: 'guest', segments: 27 },
      { key: 'speaker_1', name: 'Terry', role: 'guest', segments: 24 },
      { key: 'speaker_3', name: 'JJ', role: 'guest', segments: 24 },
      { key: 'speaker_8', name: 'Colin Scott', role: 'guest', segments: 24 },
      { key: 'speaker_9', name: 'Christopher Xenos', role: 'guest', segments: 21 },
      { key: 'speaker_5', name: 'Olami Olaleri', role: 'guest', segments: 18 },
      { key: 'speaker_6', name: 'Aaron Rebelo', role: 'guest', segments: 18 },
      { key: 'speaker_4', name: 'Abdullah Masoodi', role: 'guest', segments: 16 },
      { key: 'speaker_7', name: 'Mariam Saleem', role: 'guest', segments: 7 },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────

function extractRawSegments(exportData: any): SpeakerSegment[] {
  const project = exportData.projects?.[0];
  if (!project) throw new Error('No project in export');

  const speakers = project.coreContent?.conversation?.speakers;
  if (!speakers) throw new Error('No speakers in export');

  const allSegments: SpeakerSegment[] = [];

  for (const [_key, speaker] of Object.entries(speakers) as [string, any][]) {
    for (const seg of (speaker.segments || [])) {
      const rawClusterId = seg.initialSpeakerId || seg.rawClusterId || seg.speakerId;
      allSegments.push({
        speakerId: rawClusterId,
        initialSpeakerId: rawClusterId,
        text: seg.text || '',
        startTime: seg.startTime ?? 0,
        endTime: seg.endTime ?? 0,
        confidence: seg.confidence,
      });
    }
  }

  allSegments.sort((a, b) => a.startTime - b.startTime);
  return allSegments;
}

function createLogCapture(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;

  console.log = (...args: any[]) => {
    const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    lines.push(line);
    originalLog.apply(console, args);
  };
  console.warn = (...args: any[]) => {
    const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    lines.push(line);
    originalWarn.apply(console, args);
  };

  return {
    lines,
    restore: () => {
      console.log = originalLog;
      console.warn = originalWarn;
    },
  };
}

function parseMechanismActivity(lines: string[]): MechanismActivity {
  let handoffReassignments = 0;
  let clusterCoherenceClaims = 0;
  let clusterRedistributions = 0;
  const cullActions: string[] = [];

  for (const line of lines) {
    const handoffMatch = line.match(/\[HANDOFF REASSIGN\] Reassigned (\d+) segment/);
    if (handoffMatch) handoffReassignments = parseInt(handoffMatch[1]);

    const coherenceMatch = line.match(/\[CLUSTER COHERENCE\] Claimed (\d+) segment/);
    if (coherenceMatch) clusterCoherenceClaims = parseInt(coherenceMatch[1]);

    if (line.includes('[CLUSTER REDISTRIB]') && !line.includes('No collapsed') && !line.includes('No unused')) {
      clusterRedistributions++;
    }

    if (line.includes('[CULL]')) {
      cullActions.push(line.trim());
    }
  }

  return { handoffReassignments, clusterCoherenceClaims, clusterRedistributions, cullActions };
}

function buildResultSpeakers(pipelineResult: any): ResultSpeaker[] {
  const speakers: ResultSpeaker[] = [];
  const segmentCounts: Record<string, number> = {};

  for (const seg of pipelineResult.segments) {
    const sid = seg.finalSpeakerId || seg.speakerId;
    segmentCounts[sid] = (segmentCounts[sid] || 0) + 1;
  }

  for (const gptSpeaker of pipelineResult.speakers) {
    speakers.push({
      id: gptSpeaker.id,
      name: gptSpeaker.name || gptSpeaker.id,
      role: gptSpeaker.role,
      segments: segmentCounts[gptSpeaker.id] || 0,
      source: gptSpeaker.source,
    });
  }

  return speakers.sort((a, b) => b.segments - a.segments);
}

/**
 * Normalize a speaker name for comparison.
 * Treats unnamed speakers (id-like names) as equivalent to role-based names.
 */
function normalizeSpeakerName(name: string, role?: string): string {
  const lower = name.toLowerCase();
  // If name is just an ID like "speaker_1", treat as unnamed → use role
  if (/^speaker_\d+$/.test(lower) && role) {
    return role.toLowerCase().replace('_', ' ');
  }
  return lower;
}

function compareResults(baseline: BaselineSpeaker[], result: ResultSpeaker[]): string[] {
  const diffs: string[] = [];

  const baselineReal = baseline.filter(s =>
    s.role !== 'advertiser' && s.name !== 'Sorry' && s.name !== 'Delete Me'
  );
  const resultReal = result.filter(s =>
    s.role !== 'advertiser' && s.name !== 'Sorry' && s.name !== 'Delete Me'
  );

  if (resultReal.length !== baselineReal.length) {
    diffs.push(`Speaker count: ${baselineReal.length} -> ${resultReal.length}`);
  }

  const baselineNorm = new Set(baseline.map(s => normalizeSpeakerName(s.name, s.role)));
  const resultNorm = new Set(result.map(s => normalizeSpeakerName(s.name, s.role)));

  for (const name of Array.from(baselineNorm)) {
    if (!resultNorm.has(name)) {
      diffs.push(`Missing speaker: "${name}"`);
    }
  }
  for (const name of Array.from(resultNorm)) {
    if (!baselineNorm.has(name)) {
      diffs.push(`New speaker: "${name}"`);
    }
  }

  for (const bSpeaker of baseline) {
    const bNorm = normalizeSpeakerName(bSpeaker.name, bSpeaker.role);
    const matchedResult = result.find(r =>
      normalizeSpeakerName(r.name, r.role) === bNorm ||
      r.name.toLowerCase() === bSpeaker.name.toLowerCase() ||
      r.id === bSpeaker.key
    );
    if (matchedResult) {
      const delta = matchedResult.segments - bSpeaker.segments;
      const pctChange = bSpeaker.segments > 0 ? Math.abs(delta) / bSpeaker.segments : (delta !== 0 ? 1 : 0);
      if (pctChange > 0.15) {
        const sign = delta > 0 ? '+' : '';
        diffs.push(
          `${bSpeaker.name}: ${bSpeaker.segments} -> ${matchedResult.segments} segments (${sign}${(delta / bSpeaker.segments * 100).toFixed(0)}%)`
        );
      }
    }
  }

  for (const r of result) {
    if (r.segments === 0) {
      diffs.push(`WARNING: ${r.name} has 0 segments (bad cull?)`);
    }
  }

  return diffs;
}

/**
 * Validate that speakers with self-ID evidence have at least one segment
 * with confidence > 0.7 and status 'confirmed'.
 *
 * Only checks speakers who have a segment with confidenceReason === 'strong_self_id'.
 * Speakers identified only via GPT (handoffs, name extraction) are expected to have
 * lower confidence and are not flagged here.
 */
function validateSelfIdConfidence(
  pipelineResult: any,
  panel: PanelConfig
): string[] {
  const issues: string[] = [];
  const segments = pipelineResult.segments || [];

  // Build map: speakerId → segments
  const speakerSegments: Record<string, any[]> = {};
  for (const seg of segments) {
    const sid = seg.finalSpeakerId || seg.speakerId;
    if (!speakerSegments[sid]) speakerSegments[sid] = [];
    speakerSegments[sid].push(seg);
  }

  // Only check speakers who have self-ID evidence
  for (const speaker of pipelineResult.speakers) {
    if (!speaker.name || /^speaker_\d+$/i.test(speaker.name)) continue;
    const segs = speakerSegments[speaker.id] || [];
    if (segs.length === 0) continue;

    const hasSelfIdEvidence = segs.some((s: any) =>
      s.confidenceReason === 'strong_self_id'
    );
    if (!hasSelfIdEvidence) continue;

    const maxConf = Math.max(...segs.map((s: any) => s.confidence || 0));
    const hasConfirmed = segs.some((s: any) => s.status === 'confirmed');

    if (maxConf <= 0.7) {
      issues.push(`CONFIDENCE: ${speaker.name} has self-ID but max confidence=${maxConf.toFixed(2)} (expected >0.7)`);
    }
    if (!hasConfirmed) {
      issues.push(`STATUS: ${speaker.name} has self-ID but no confirmed segments`);
    }
  }

  return issues;
}

// ── Main ─────────────────────────────────────────────────────────────

async function runPanelTest(panel: PanelConfig): Promise<TestResult> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TESTING: ${panel.name}`);
  console.log(`${'='.repeat(70)}\n`);

  // Dynamic import — env vars are already loaded
  const { runRefactoredSpeakerPipeline } = await import('../lib/refactored-speaker-pipeline');

  const exportPath = path.join(JSONS_DIR, panel.exportFile);
  const raw = await fs.readFile(exportPath, 'utf8');
  const exportData = JSON.parse(raw);

  const rawSegments = extractRawSegments(exportData);
  const rawClusterIds = new Set(rawSegments.map(s => s.speakerId));
  console.log(`[EXTRACT] ${rawSegments.length} segments, ${rawClusterIds.size} raw clusters: ${Array.from(rawClusterIds).join(', ')}`);

  console.log('\n[BASELINE]');
  for (const s of panel.baseline) {
    console.log(`  ${s.name} (${s.role}): ${s.segments} segments`);
  }

  const capture = createLogCapture();

  try {
    const result = await runRefactoredSpeakerPipeline(rawSegments as any, {
      openaiApiKey: process.env.OPENAI_API_KEY,
      speakerCount: panel.speakerCount,
      projectType: panel.projectType,
      filename: panel.filename,
      mappingMode: 'csp',
    });

    capture.restore();

    const resultSpeakers = buildResultSpeakers(result);
    const mechanisms = parseMechanismActivity(capture.lines);
    const diffs = compareResults(panel.baseline, resultSpeakers);

    // Self-ID confidence validation
    const confidenceIssues = validateSelfIdConfidence(result, panel);
    diffs.push(...confidenceIssues);

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (diffs.some(d => d.startsWith('WARNING'))) status = 'fail';
    else if (diffs.some(d => d.startsWith('CONFIDENCE') || d.startsWith('STATUS'))) status = 'warn';
    else if (diffs.length > 0) status = 'warn';

    console.log(`\n[RESULT] ${panel.name}`);
    console.log(`  Status: ${status.toUpperCase()}`);
    console.log(`  Speakers: ${resultSpeakers.length}`);
    for (const s of resultSpeakers) {
      console.log(`    ${s.name} (${s.role || 'unknown'}): ${s.segments} segments [source: ${s.source || 'gpt'}]`);
    }

    console.log(`\n  Mechanisms:`);
    console.log(`    Handoff reassignments: ${mechanisms.handoffReassignments}`);
    console.log(`    Cluster coherence claims: ${mechanisms.clusterCoherenceClaims}`);
    console.log(`    Cluster redistributions: ${mechanisms.clusterRedistributions}`);
    if (mechanisms.cullActions.length > 0) {
      console.log(`    Cull actions:`);
      for (const a of mechanisms.cullActions) console.log(`      ${a}`);
    }

    if (diffs.length > 0) {
      console.log(`\n  Changes from baseline:`);
      for (const d of diffs) console.log(`    ${d}`);
    } else {
      console.log(`\n  No significant changes from baseline`);
    }

    return { panel: panel.name, status, baselineSpeakers: panel.baseline, resultSpeakers, mechanismActivity: mechanisms, diffs };
  } catch (err: any) {
    capture.restore();
    console.error(`[ERROR] ${panel.name}: ${err.message}`);
    return {
      panel: panel.name,
      status: 'fail',
      baselineSpeakers: panel.baseline,
      resultSpeakers: [],
      mechanismActivity: { handoffReassignments: 0, clusterCoherenceClaims: 0, clusterRedistributions: 0, cullActions: [] },
      diffs: [`ERROR: ${err.message}`],
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const panelIdx = args.indexOf('--panel');
  const panelArg = panelIdx >= 0 ? args[panelIdx + 1] : undefined;

  if (!process.env.OPENAI_API_KEY && !dryRun) {
    console.error('OPENAI_API_KEY not found. Set it in .env.local or environment.');
    process.exit(1);
  }

  const panelsToTest = panelArg
    ? PANELS.filter(p => p.shortName === panelArg)
    : PANELS;

  if (panelsToTest.length === 0) {
    console.error(`Unknown panel: ${panelArg}. Available: ${PANELS.map(p => p.shortName).join(', ')}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('=== DRY RUN: Showing baselines and raw segment extraction ===\n');
    for (const panel of panelsToTest) {
      console.log(`\n${panel.name} (${panel.shortName})`);
      console.log(`  Export: ${panel.exportFile}`);
      console.log(`  Speaker count hint: ${panel.speakerCount ?? 'none'}`);
      console.log(`  Project type: ${panel.projectType ?? 'none'}`);
      console.log(`  Baseline:`);
      for (const s of panel.baseline) {
        console.log(`    ${s.name} (${s.role}): ${s.segments} segments`);
      }

      try {
        const exportPath = path.join(JSONS_DIR, panel.exportFile);
        const raw = await fs.readFile(exportPath, 'utf8');
        const exportData = JSON.parse(raw);
        const rawSegments = extractRawSegments(exportData);
        const rawClusterIds = new Set(rawSegments.map(s => s.speakerId));
        console.log(`  Raw segments: ${rawSegments.length}, clusters: ${Array.from(rawClusterIds).join(', ')}`);
      } catch (err: any) {
        console.log(`  ERROR extracting segments: ${err.message}`);
      }
    }
    return;
  }

  const results: TestResult[] = [];
  for (const panel of panelsToTest) {
    const result = await runPanelTest(panel);
    results.push(result);
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(70)}`);
  console.log('REGRESSION TEST SUMMARY');
  console.log(`${'='.repeat(70)}\n`);

  for (const r of results) {
    const icon = r.status === 'pass' ? 'PASS' : r.status === 'warn' ? 'WARN' : 'FAIL';
    console.log(`[${icon}] ${r.panel}`);
    console.log(`  Speakers: ${r.resultSpeakers.length} (baseline: ${r.baselineSpeakers.length})`);
    console.log(`  Mechanisms: handoff=${r.mechanismActivity.handoffReassignments} coherence=${r.mechanismActivity.clusterCoherenceClaims} redistrib=${r.mechanismActivity.clusterRedistributions}`);
    if (r.diffs.length > 0) {
      for (const d of r.diffs) console.log(`  - ${d}`);
    }
    console.log();
  }

  const passCount = results.filter(r => r.status === 'pass').length;
  const warnCount = results.filter(r => r.status === 'warn').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  console.log(`Total: ${passCount} pass, ${warnCount} warn, ${failCount} fail`);

  const reportPath = `/tmp/regression-report-${Date.now()}.json`;
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nFull report: ${reportPath}`);

  if (failCount > 0) process.exit(1);
}

main().catch(err => {
  console.error('[FATAL]', err.message || err);
  process.exit(1);
});
