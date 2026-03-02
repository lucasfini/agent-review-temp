import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CONTEXT_WINDOW = 8; // segments before/after each selected segment
const TOUCHUP_MODEL = 'gpt-4o';

function recomputeSpeakerCounts(
  speakers: Record<string, any>,
  segments: any[]
): Record<string, any> {
  const updated: Record<string, any> = {};
  for (const [id, speaker] of Object.entries(speakers)) {
    const ownSegments = segments.filter(
      (s: any) => (s.finalSpeakerId || s.speakerId) === id
    );
    updated[id] = {
      ...speaker,
      segmentCount: ownSegments.length,
      totalDuration: ownSegments.reduce(
        (sum: number, s: any) => sum + Math.max(0, (s.endTime || 0) - (s.startTime || 0)),
        0
      ),
    };
  }
  return updated;
}

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
      .select('speaker_data, user_id')
      .eq('id', projectId)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const rawSpeakerData = (project as { speaker_data: any; user_id: string }).speaker_data;
    const userId = (project as { speaker_data: any; user_id: string }).user_id;

    // Demo account guard
    if (userId) {
      const { data: { user: projectUser } } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (projectUser?.email === process.env.DEMO_EMAIL) {
        return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
      }
    }
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
        speakers: recomputeSpeakerCounts(speakers, updatedSegments),
        detectionMetadata: {
          ...speakerData.detectionMetadata,
          lastModified: new Date().toISOString(),
          lastModificationType: 'ai_touchup'
        }
      };

      const { data: savedApproved, error: updateError } = await supabaseAdmin
        .from('projects')
        // @ts-expect-error - Supabase types issue with update
        .update({ speaker_data: updatedSpeakerData })
        .eq('id', projectId)
        .select('speaker_data')
        .single();

      if (updateError || !savedApproved) {
        console.error('[touchup] Error applying approved reassignments (0 rows matched or DB error):', updateError);
        return NextResponse.json({ error: 'Failed to save touch-up results' }, { status: 500 });
      }

      return NextResponse.json({ success: true, reassignments: applied, updatedSpeakerData: savedApproved.speaker_data });
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
        speakers: recomputeSpeakerCounts(speakers, updatedSegments),
        detectionMetadata: {
          ...speakerData.detectionMetadata,
          lastModified: new Date().toISOString(),
          lastModificationType: 'ai_touchup'
        }
      };
      const { data: savedSwap, error: updateError } = await supabaseAdmin
        .from('projects')
        // @ts-expect-error - Supabase types issue
        .update({ speaker_data: updatedSpeakerData })
        .eq('id', projectId)
        .select('speaker_data')
        .single();
      if (updateError || !savedSwap) {
        console.error('[touchup] Error saving 2-speaker swap (0 rows matched or DB error):', updateError);
        return NextResponse.json({ error: 'Failed to save touch-up results' }, { status: 500 });
      }
      return NextResponse.json({ success: true, reassignments, updatedSpeakerData: savedSwap.speaker_data });
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

    const prompt = `You are a speaker attribution expert correcting misattributed segments in a podcast transcript.

The segments marked [WRONG] have been flagged as DEFINITIVELY misattributed by the user.
Your task: identify the ACTUAL speaker for each [WRONG] segment by aligning it with the established patterns of [CORRECT] speakers.

SPEAKERS IN THIS CONVERSATION:
${speakerProfileLines}

CONTEXT LEGEND:
  [CORRECT] = user-confirmed ground truth — these assignments are ABSOLUTE and MUST NOT be changed
  [WRONG]   = confirmed incorrect assignment — determine the real speaker using [CORRECT] context

SEGMENTS:
${segmentBlocks}

DIRECT ADDRESS RULE (critical):
When a segment addresses someone by name or title, the SPEAKER is the one doing the addressing — NOT the person being named.
Examples:
  ✓ "Yeah, Prime Minister — where does this find you?" → speaker is the HOST (addressing the PM)
  ✓ "Professor, what's your take on this?" → speaker is whoever asks, NOT the Professor
  ✓ "I'm in Montreal right now, Professor." → speaker is the GUEST (responding while addressing Professor)
  ✓ "Yeah, [Name]." / "[Name], yeah." → speaker is the one ACKNOWLEDGING, not the named person
  ✓ "Thank you, [Name]." → speaker is the one giving thanks, not the named person

ALIGNMENT INSTRUCTIONS:
1. Your PRIMARY goal is to make [WRONG] segments consistent with the conversational flow of [CORRECT] segments
2. [CORRECT] segments are user-verified ground truth — use them as anchor points to infer speaker identity
3. Match vocabulary, topic ownership, sentence structure, and speaking style to each speaker's "Sample statements"
4. Consider conversational turn-taking: after a [CORRECT] segment ends a thought, who would logically speak next?
5. Consider: who asks questions vs. who answers? who narrates vs. who responds?
6. For every [WRONG] segment you MUST return a definitive speakerId — never leave uncertain
7. Only use speakerIds from the SPEAKERS list above
8. Every [WRONG] segment index must appear in your response exactly once

Respond with ONLY valid JSON:
{"reassignments": [
  {"index": <number>, "speakerId": "<correct_speaker_id>", "reason": "<concise reasoning>", "confidence": <0.0–1.0>},
  ...
]}`;

    // Call GPT-4o with JSON mode for reliable structured output
    const apiKey = await getOpenAIApiKeyForUser(userId);
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: TOUCHUP_MODEL,
      response_format: { type: 'json_object' },
      max_completion_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });

    const rawText = completion.choices[0]?.message?.content ?? '';

    // Track usage (fire-and-forget)
    if (userId) {
      trackOpenAIUsage({
        userId,
        projectId,
        response: completion,
        modelName: TOUCHUP_MODEL,
        purpose: 'segment touchup',
      }).catch(err => console.error('[touchup] Failed to track usage:', err));
    }

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
      speakers: recomputeSpeakerCounts(speakers, updatedSegments),
      detectionMetadata: {
        ...speakerData.detectionMetadata,
        lastModified: new Date().toISOString(),
        lastModificationType: 'ai_touchup'
      }
    };

    // Save to database
    const { data: savedAI, error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-expect-error - Supabase types issue with update
      .update({ speaker_data: updatedSpeakerData })
      .eq('id', projectId)
      .select('speaker_data')
      .single();

    if (updateError || !savedAI) {
      console.error('[touchup] Error saving AI touch-up (0 rows matched or DB error):', updateError);
      return NextResponse.json({ error: 'Failed to save touch-up results' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reassignments,
      updatedSpeakerData: savedAI.speaker_data
    });

  } catch (error) {
    console.error('[touchup] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
