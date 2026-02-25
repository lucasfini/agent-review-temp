import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import OpenAI from 'openai';

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CONTEXT_WINDOW = 8; // segments before/after each selected segment
const TOUCHUP_MODEL = 'gpt-5-mini';

function getTypicalBehavior(role: string | undefined, avgDuration: number): string {
  if (role === 'host' || role === 'co_host') {
    if (avgDuration < 20) return 'asks brief questions, gives short transitions';
    if (avgDuration < 60) return 'asks questions, provides episode context, reads outros';
    return 'asks questions, gives substantial commentary';
  }
  if (role === 'guest') {
    if (avgDuration > 90) return 'gives long substantive answers';
    if (avgDuration > 30) return 'gives moderate-length responses';
    return 'gives concise direct answers';
  }
  return 'participates in conversation';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { segmentIndices, dryRun = false, approvedReassignments } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    // Fetch current project data
    const { data: project, error: fetchError } = await supabaseAdmin
      .from('projects')
      .select('speaker_data')
      .eq('id', projectId)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const rawSpeakerData = (project as { speaker_data: any }).speaker_data;
    const speakerData = typeof rawSpeakerData === 'string'
      ? JSON.parse(rawSpeakerData)
      : rawSpeakerData;

    if (!speakerData?.segments || !speakerData?.speakers) {
      return NextResponse.json({ error: 'Invalid speaker data structure' }, { status: 400 });
    }

    const { segments, speakers } = speakerData;
    const totalSegments = segments.length;

    // ─── Direct-apply mode: user pre-approved specific changes from the preview ───
    if (approvedReassignments && Array.isArray(approvedReassignments) && approvedReassignments.length > 0) {
      const updatedSegments = [...segments];
      const applied: Array<{ index: number; oldSpeakerId: string; newSpeakerId: string; reason: string }> = [];

      for (const { index, speakerId: spId, newSpeakerId: newSpId, reason } of approvedReassignments) {
        const newSpeakerId = spId ?? newSpId;
        if (typeof index !== 'number' || index < 0 || index >= totalSegments) {
          console.warn(`[touchup] Invalid segment index ${index} in approvedReassignments, skipping`);
          continue;
        }
        if (!speakers[newSpeakerId]) {
          console.warn(`[touchup] Unknown speakerId "${newSpeakerId}" in approvedReassignments, skipping`);
          continue;
        }

        const oldSpeakerId = updatedSegments[index].finalSpeakerId || updatedSegments[index].speakerId;
        updatedSegments[index] = {
          ...updatedSegments[index],
          speakerId: newSpeakerId,
          finalSpeakerId: newSpeakerId,
          confidenceReason: 'ai_touchup',
          confidence: 0.85
        };
        applied.push({ index, oldSpeakerId, newSpeakerId, reason: reason || '' });
      }

      const updatedSpeakerData = {
        ...speakerData,
        segments: updatedSegments,
        detectionMetadata: {
          ...speakerData.detectionMetadata,
          lastModified: new Date().toISOString(),
          lastModificationType: 'ai_touchup'
        }
      };

      const { error: updateError } = await supabaseAdmin
        .from('projects')
        // @ts-expect-error - Supabase types issue with update
        .update({ speaker_data: updatedSpeakerData })
        .eq('id', projectId);

      if (updateError) {
        console.error('[touchup] Error applying approved reassignments:', updateError);
        return NextResponse.json({ error: 'Failed to save touch-up results' }, { status: 500 });
      }

      return NextResponse.json({ success: true, reassignments: applied, updatedSpeakerData });
    }

    // ─── Claude analysis mode ───
    if (!Array.isArray(segmentIndices) || segmentIndices.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: segmentIndices (non-empty array)' },
        { status: 400 }
      );
    }

    const selectedSet = new Set<number>(segmentIndices as number[]);
    const uniqueSpeakerIds = new Set<string>(
      segments.map((s: any) => s.finalSpeakerId || s.speakerId)
    );

    // ── 2-speaker scenario: deterministic swap (no AI needed) ─────────────────
    if (uniqueSpeakerIds.size === 2) {
      const [speakerA, speakerB] = [...uniqueSpeakerIds];
      const reassignments = (segmentIndices as number[])
        .filter(idx => idx >= 0 && idx < totalSegments)
        .map(idx => {
          const seg = segments[idx];
          const currentSpeakerId = seg.finalSpeakerId || seg.speakerId;
          const correctSpeakerId = currentSpeakerId === speakerA ? speakerB : speakerA;
          const correctSpeaker = speakers[correctSpeakerId];
          const currentSpeaker = speakers[currentSpeakerId];
          const fromName = currentSpeaker?.finalName || currentSpeaker?.name || currentSpeakerId;
          const toName = correctSpeaker?.finalName || correctSpeaker?.name || correctSpeakerId;
          return {
            index: idx,
            oldSpeakerId: currentSpeakerId,
            newSpeakerId: correctSpeakerId,
            reason: `2-speaker conversation — swapped from ${fromName} to ${toName}`,
            confidence: 1.0,
            segmentText: (seg.text || '').slice(0, 100),
          };
        });

      if (dryRun) {
        return NextResponse.json({ success: true, reassignments, mode: '2-speaker-swap' });
      }

      const updatedSegments = [...segments];
      for (const { index, newSpeakerId } of reassignments) {
        updatedSegments[index] = {
          ...updatedSegments[index],
          speakerId: newSpeakerId,
          finalSpeakerId: newSpeakerId,
          confidenceReason: 'ai_touchup',
          confidence: 1.0
        };
      }
      const updatedSpeakerData = {
        ...speakerData,
        segments: updatedSegments,
        detectionMetadata: {
          ...speakerData.detectionMetadata,
          lastModified: new Date().toISOString(),
          lastModificationType: 'ai_touchup'
        }
      };
      const { error: updateError } = await supabaseAdmin
        .from('projects')
        // @ts-expect-error - Supabase types issue
        .update({ speaker_data: updatedSpeakerData })
        .eq('id', projectId);
      if (updateError) {
        return NextResponse.json({ error: 'Failed to save touch-up results' }, { status: 500 });
      }
      return NextResponse.json({ success: true, reassignments, updatedSpeakerData });
    }

    // Compute per-speaker stats from segments
    const speakerStats = new Map<string, { count: number; totalDuration: number }>();
    for (const seg of segments) {
      const sid = seg.finalSpeakerId || seg.speakerId;
      const duration = Math.max(0, (seg.endTime || 0) - (seg.startTime || 0));
      const existing = speakerStats.get(sid) || { count: 0, totalDuration: 0 };
      speakerStats.set(sid, { count: existing.count + 1, totalDuration: existing.totalDuration + duration });
    }

    // Build content fingerprint: collect verified (non-selected) segments per speaker,
    // spread across beginning / middle / end of the conversation for topic diversity.
    const speakerEligibleIndices = new Map<string, number[]>();
    for (let i = 0; i < segments.length; i++) {
      if (selectedSet.has(i)) continue;
      const text = (segments[i].text || '').trim();
      if (text.length < 30 || text.length > 350) continue; // skip filler + walls of text
      const sid = segments[i].finalSpeakerId || segments[i].speakerId;
      const list = speakerEligibleIndices.get(sid) || [];
      list.push(i);
      speakerEligibleIndices.set(sid, list);
    }
    const speakerSamples = new Map<string, string[]>();
    for (const [sid, indices] of speakerEligibleIndices) {
      // Pick 3 samples: beginning, middle, end
      const picks: number[] = [];
      if (indices.length <= 3) {
        picks.push(...indices);
      } else {
        picks.push(indices[0]);
        picks.push(indices[Math.floor(indices.length / 2)]);
        picks.push(indices[indices.length - 1]);
      }
      speakerSamples.set(sid, picks.map(i => (segments[i].text || '').trim().slice(0, 130)));
    }

    // Build speaker behavioral profiles with content fingerprint
    const speakerProfileLines = Object.entries(speakers as Record<string, any>)
      .map(([id, speaker]) => {
        const name = speaker.finalName || speaker.name || id;
        const role = speaker.role || 'unknown';
        const stats = speakerStats.get(id) || { count: 0, totalDuration: 0 };
        const avgDuration = stats.count > 0 ? Math.round(stats.totalDuration / stats.count) : 0;
        const behavior = getTypicalBehavior(speaker.role, avgDuration);
        const samples = speakerSamples.get(id) || [];
        const sampleLine = samples.length > 0
          ? `\n  Sample statements: ${samples.map(s => `"${s}"`).join(' | ')}`
          : '';
        return `- ${id}: ${name} (${role}) | ${stats.count} segments | avg turn: ${avgDuration}s\n  Typically: ${behavior}${sampleLine}`;
      })
      .join('\n');

    // Build per-segment context blocks with [CORRECT]/[WRONG] labeling
    const segmentBlocks = (segmentIndices as number[]).map(idx => {
      if (idx < 0 || idx >= totalSegments) return null;

      const segment = segments[idx];
      const currentSpeakerId = segment.finalSpeakerId || segment.speakerId;
      const currentSpeaker = speakers[currentSpeakerId];
      const currentSpeakerName = currentSpeaker?.finalName || currentSpeaker?.name || currentSpeakerId;

      const beforeStart = Math.max(0, idx - CONTEXT_WINDOW);
      const afterEnd = Math.min(totalSegments - 1, idx + CONTEXT_WINDOW);
      const lines: string[] = [];

      for (let i = beforeStart; i < idx; i++) {
        const s = segments[i];
        const sid = s.finalSpeakerId || s.speakerId;
        const spk = speakers[sid];
        const name = spk?.finalName || spk?.name || sid;
        const label = selectedSet.has(i) ? '[WRONG]  ' : '[CORRECT]';
        lines.push(`  ${label} [${i}] ${name}: "${s.text}"`);
      }

      lines.push(`  [WRONG]   [${idx}] Currently: ${currentSpeakerName} → INCORRECT`);
      lines.push(`            "${segment.text}"`);

      for (let i = idx + 1; i <= afterEnd; i++) {
        const s = segments[i];
        const sid = s.finalSpeakerId || s.speakerId;
        const spk = speakers[sid];
        const name = spk?.finalName || spk?.name || sid;
        const label = selectedSet.has(i) ? '[WRONG]  ' : '[CORRECT]';
        lines.push(`  ${label} [${i}] ${name}: "${s.text}"`);
      }

      return `--- Segment ${idx} ---\n${lines.join('\n')}`;
    }).filter(Boolean).join('\n\n');

    const prompt = `You are correcting CONFIRMED speaker attribution errors in a podcast transcript.

The segments marked [WRONG] have been flagged as DEFINITIVELY misattributed.
Your job is to determine who is ACTUALLY speaking in each [WRONG] segment.

SPEAKERS IN THIS CONVERSATION:
${speakerProfileLines}

CONTEXT LEGEND:
  [CORRECT] = verified speaker assignment — treat as ground truth
  [WRONG]   = confirmed incorrect assignment — determine the real speaker

SEGMENTS:
${segmentBlocks}

DIRECT ADDRESS RULE (critical):
If a segment addresses someone by name or title ("Prime Minister, where are you?", "Professor, what do you think?"),
the speaker is the one DOING the addressing — NOT the person being named.
  ✓ "I'm in Montreal right now, Professor." → speaker is the GUEST (addressing the Professor)
  ✓ "Prime Minister, where does this find you?" → speaker is the HOST (not the Prime Minister)

INSTRUCTIONS:
1. For every [WRONG] segment you MUST return a definitive correctSpeakerId — never "uncertain"
2. Use [CORRECT] segments as anchoring ground truth for conversational flow
3. Use each speaker's "Sample statements" to match topic ownership, vocabulary, and speaking style
4. Consider: who uses this kind of language? who owns this topic? who asks vs. answers?
5. Only use speakerIds from the SPEAKERS list above
6. Every [WRONG] segment index must appear in your response exactly once

Respond with ONLY valid JSON:
{"reassignments": [
  {"index": <number>, "speakerId": "<correct_speaker_id>", "reason": "<concise reasoning>", "confidence": <0.0–1.0>},
  ...
]}`;

    // Call GPT-4o with JSON mode for reliable structured output
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: TOUCHUP_MODEL,
      response_format: { type: 'json_object' },
      max_completion_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });

    const rawText = completion.choices[0]?.message?.content ?? '';

    // Parse GPT-4o's JSON response
    let claudeSuggestions: Array<{ index: number; speakerId: string; reason: string; confidence?: number }> = [];
    try {
      const parsed = JSON.parse(rawText);
      claudeSuggestions = parsed.reassignments ?? [];
    } catch (parseErr) {
      console.warn('[touchup] Failed to parse GPT-4o response:', rawText, parseErr);
    }

    // Build validated reassignment list (includes all Claude suggestions, changed or not)
    const reassignments: Array<{
      index: number;
      oldSpeakerId: string;
      newSpeakerId: string;
      reason: string;
      confidence: number | null;
      segmentText: string;
    }> = [];

    for (const suggestion of claudeSuggestions) {
      const { index, speakerId: newSpeakerId, reason, confidence } = suggestion;

      if (typeof index !== 'number' || index < 0 || index >= totalSegments) {
        console.warn(`[touchup] Invalid segment index ${index}, skipping`);
        continue;
      }
      if (!speakers[newSpeakerId]) {
        console.warn(`[touchup] Unknown speakerId "${newSpeakerId}" for index ${index}, skipping`);
        continue;
      }

      const oldSpeakerId = segments[index].finalSpeakerId || segments[index].speakerId;
      reassignments.push({
        index,
        oldSpeakerId,
        newSpeakerId,
        reason: reason || '',
        confidence: confidence ?? null,
        segmentText: (segments[index].text || '').slice(0, 100),
      });
    }

    // Dry-run mode: return suggestions without writing to the DB
    if (dryRun) {
      return NextResponse.json({ success: true, reassignments });
    }

    // Apply reassignments to segments
    const updatedSegments = [...segments];
    for (const { index, newSpeakerId } of reassignments) {
      updatedSegments[index] = {
        ...updatedSegments[index],
        speakerId: newSpeakerId,
        finalSpeakerId: newSpeakerId,
        confidenceReason: 'ai_touchup',
        confidence: 0.85
      };
    }

    // Build updated speaker data
    const updatedSpeakerData = {
      ...speakerData,
      segments: updatedSegments,
      detectionMetadata: {
        ...speakerData.detectionMetadata,
        lastModified: new Date().toISOString(),
        lastModificationType: 'ai_touchup'
      }
    };

    // Save to database
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-expect-error - Supabase types issue with update
      .update({ speaker_data: updatedSpeakerData })
      .eq('id', projectId);

    if (updateError) {
      console.error('[touchup] Error updating speaker data:', updateError);
      return NextResponse.json({ error: 'Failed to save touch-up results' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reassignments,
      updatedSpeakerData
    });

  } catch (error) {
    console.error('[touchup] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
