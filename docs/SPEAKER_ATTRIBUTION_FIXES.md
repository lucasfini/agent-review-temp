# Speaker Attribution System - Complete Fix Summary

## Problem Diagnosis

After analyzing the MSU Presidential Debate 2026 export, we identified the root cause:

**GPT-4o Pass 1 (Speaker Intelligence) was missing candidate "Olami"**
- Extracted only 9 speakers (Terry, Emily, Abdullah, Aaron, Mariam, Colin, Christopher, JJ, Erin)
- **Missing: Olami** (10th candidate)
- Result: "My name is Olami" segment had no roster match → fell back to acoustic clustering → assigned to unnamed host (speaker_11)

### Why This Happened

GPT-4o's prompt said: *"Prefer fewer speakers over more. It's better to miss a speaker than to hallucinate one."*

This conservative approach works for podcasts but FAILS for debates with 9+ candidates who each introduce themselves once.

---

## Implemented Fixes

### Fix 1: Debate-Aware GPT Prompt ✅

**File**: `lib/gpt-speaker-intelligence.ts`

**Changes**:
1. Added debate detection instruction:
   ```
   DEBATES & PANELS: If you see phrases like "nine candidates", "all candidates",
   or multiple self-introductions in quick succession:
   - EXTRACT ALL SELF-IDENTIFICATIONS
   - Do NOT merge candidates who say similar things
   - Count the self-IDs and ensure your speaker count matches
   ```

2. Emphasized self-ID extraction:
   ```
   CRITICAL: ALWAYS extract speakers from explicit self-identifications.
   FOR DEBATES/PANELS: Every "My name is X" MUST create a speaker entry.
   ```

3. Made conservative rule podcast-specific:
   ```
   WHEN UNCERTAIN (podcasts/interviews only): If NOT a debate/panel,
   prefer fewer speakers over more. But for debates, extract ALL self-identified speakers.
   ```

**Expected Impact**: GPT-4o should now extract all 10 candidates including Olami.

---

### Fix 2: Orphaned Self-ID Validation ✅

**File**: `lib/constraint-solver.ts` (lines 284-315)

**Added**: Validation logging in `extractAnchors()` to detect when Pass 2 finds self-IDs that weren't in the Pass 1 roster.

**Output Example**:
```
[CSP] ⚠️  ORPHANED SELF-IDs DETECTED: 1 self-identifications NOT in GPT roster
[CSP] Orphaned names: Olami
[CSP] → These speakers were missed in Pass 1 (GPT speaker intelligence)
[CSP] → Segments will fall back to acoustic clustering (may cause misassignment)
[CSP] → Consider improving Pass 1 prompt or increasing intro window
```

**Purpose**: Makes it obvious when GPT misses a speaker, so we can diagnose and fix it.

---

### Fix 3: Dynamic Speaker Recovery ✅

**File**: `lib/refactored-speaker-pipeline.ts` (lines 27-73, 173-203)

**Added**: "Pass 1.5" that runs between GPT intelligence and segment mapping.

**What It Does**:
1. Scans all segments for self-identifications using `STRONG_SELF_ID_PATTERNS`
2. Compares extracted names to GPT roster
3. For any orphaned names (not in roster):
   - Creates a new `speaker_N` entry with `role: 'guest'`
   - Adds to roster with `confidence: 0.90` and `source: 'orphan_recovery'`
   - Logs the recovery action

**Example Output**:
```
--- PASS 1.5: ORPHANED SELF-ID RECOVERY ---

[ORPHAN RECOVERY] Found 1 self-identified speakers NOT in GPT roster:
[ORPHAN RECOVERY]   - "Olami" (segment 42, cluster Speaker_G)
[ORPHAN RECOVERY] ✓ Created speaker_11: "Olami" (recovered from self-ID)
```

**Safety Net**: Even if GPT misses a speaker, the constraint solver will catch it and add them dynamically.

---

## Other Improvements from Earlier Refactor

### From Original Refactor (Already Implemented):

1. ✅ **Stricter Self-ID Patterns** - Rejects "I'm trying", "I'm proposing" (verbs)
2. ✅ **Consolidated Patterns** - Single source of truth in `self-id-patterns.ts`
3. ✅ **Increased Acoustic Weight** - 3.0 → 6.0 (catches phonetic collisions)
4. ✅ **Higher Acoustic Threshold** - 0.35 → 0.65 (stricter matching)
5. ✅ **Context-Aware Role Scoring** - Disables role bias for debate candidates
6. ✅ **Acoustic Validation in Intro Overrides** - Rejects mismatches
7. ✅ **Fixed Phonetic Collision Logic** - "Erin" and "Aaron Rebelo" stay separate

---

## Expected Results After Re-Upload

### ✅ What Should Work Now:

1. **All 10 Candidates Extracted**:
   - GPT-4o should identify all 9 candidates + host = 10 speakers
   - Olami should be in the roster

2. **Self-IDs Correctly Assigned**:
   - "My name is Olami" → Olami (not host)
   - "My name is Erin" → Erin (not Aaron)

3. **Balanced Segment Distribution**:
   - All candidates should have ~20-30 segments (within 25% of average)
   - No more 134-segment host speaker
   - No more 1-5 segment candidates

4. **Separate Speakers**:
   - Erin and Aaron Rebelo remain distinct (phonetic fix working)

5. **Clear Logging**:
   - If GPT misses a speaker → orphan recovery kicks in
   - If acoustic mismatch → intro override logged

---

## Testing Checklist

After re-uploading MSU Debate 2026:

### Check 1: Speaker Count
```
Expected: 10 speakers (9 candidates + 1 host)
- Host: [actual host name] (30-50 segments with handoffs)
- Candidates: Terry, Emily, Abdullah, Aaron, Mariam, Colin, Christopher, JJ, Erin, Olami
```

### Check 2: Self-ID Assignments
```sql
-- Find "My name is Olami" segment
SELECT speaker_id, final_name, text
FROM segments
WHERE text LIKE '%my name is olami%';

-- Expected: speaker_id should be Olami's speaker ID, not host
```

### Check 3: Segment Balance
```
Average segments per candidate: ~19.4 (total 290 / 9 = 32.2 for candidates)
Range should be: 15-40 segments per candidate
No candidate should have <10 or >50 segments
```

### Check 4: Validation Logs

Look for these console logs:
```
[GPT SPEAKER INTELLIGENCE] GPT identified 10 speakers  ← Should be 10, not 9
[ORPHAN RECOVERY] ✓ No orphaned self-IDs detected     ← Should be 0 orphans
[CSP] Self-ID anchor: seg X → "Olami"                 ← Should see Olami anchor
[ANCHOR] Detected context: debate                      ← Should detect debate
```

---

## If Issues Persist

### Scenario 1: GPT Still Misses Olami

**Check**:
```
[GPT SPEAKER INTELLIGENCE] GPT identified 9 speakers
[ORPHAN RECOVERY] Found 1 self-identified speakers NOT in GPT roster:
[ORPHAN RECOVERY]   - "Olami"
[ORPHAN RECOVERY] ✓ Created speaker_11: "Olami"
```

**What This Means**: GPT prompt update didn't help, but orphan recovery caught it.

**Solution**: The system will still work (orphan recovery fixes it), but we should:
- Increase `maxUtterances` from 150 to 200 in Pass 1
- Or manually tune the intro window detection

### Scenario 2: Segments Still Imbalanced

**Check**: Are segments evenly distributed or still clustered?

**Possible Causes**:
1. Acoustic profiles too permissive → increase threshold further (0.65 → 0.75)
2. Intro override too aggressive → reduce acoustic validation threshold (0.50 → 0.40)
3. Host has too many segments → review handoff detection patterns

### Scenario 3: Orphans Detected but Not Recovered

**Check Logs**:
```
[ORPHAN RECOVERY] Found 1 self-identified speakers NOT in GPT roster
[ORPHAN RECOVERY]   - "Olami"
[ORPHAN RECOVERY] ✓ Created speaker_11: "Olami"  ← Should see this
```

If recovery line is missing, there's a bug in the dynamic creation logic.

---

## Technical Details

### Self-ID Pattern Matching

The system uses these patterns (now consolidated):
```typescript
STRONG_SELF_ID_PATTERNS = [
  /\bmy name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:\s|[.,!?]|$)/i,
  /\bI'?m\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:\s|[.,!?]|$)/,
  /\bI am\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:\s|[.,!?]|$)/,
  /\bthis is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:speaking|here)/i,
];
```

**Key Features**:
- Requires capitalization (`[A-Z]`) → rejects verbs like "trying", "proposing"
- Word boundaries (`\b`) → prevents partial matches
- End anchors (`(?:\s|[.,!?]|$)`) → ensures clean name extraction

### Orphan Detection Logic

1. Extract all self-IDs from segments using `STRONG_SELF_ID_PATTERNS`
2. Normalize names (lowercase, trim)
3. Check against roster (exact match + first name partial match)
4. If no match found → add to orphan list
5. Create `speaker_N` entries for orphans with:
   - `role: 'guest'` (default for debates)
   - `confidence: 0.90` (high, from explicit self-ID)
   - `source: 'orphan_recovery'` (for tracking)

### Acoustic Validation

Intro overrides now check acoustic similarity:
```typescript
if (targetProfile?.acoustic?.centrdEmbedding && nextSegEmbedding) {
  const sim = acousticSimilarity(clusterProfile, targetProfile);
  if (sim < 0.50) {  // Strong mismatch
    console.log(`[CSP] Intro override: handoff rejected (acoustic mismatch: ${sim})`);
    continue;  // Don't create handoff target anchor
  }
}
```

This prevents "Next up is Colin" from binding to Aaron if they sound different.

---

## Files Modified

1. `lib/self-id-patterns.ts` - ✅ Created (consolidated patterns)
2. `lib/gpt-speaker-intelligence.ts` - ✅ Updated prompt for debates
3. `lib/constraint-solver.ts` - ✅ Added orphan validation, acoustic override
4. `lib/speaker-profiles.ts` - ✅ Context-aware role scoring, higher thresholds
5. `lib/refactored-speaker-pipeline.ts` - ✅ Added orphan recovery pass
6. `lib/anchor-mapping.ts` - ✅ Context detection, profile passing
7. `lib/dirty-cluster-resolution.ts` - ✅ Embedding hints for LLM
8. `lib/utils/phonetic.ts` - ✅ Stricter last name matching

---

## Success Metrics

After re-upload, the export should show:

| Metric | Before | After (Expected) |
|--------|--------|------------------|
| Total Speakers | 10 | 10 |
| Named Candidates | 8 | 9 (+ Olami) |
| Unnamed Speakers | 2 (host + Erin as "unknown") | 1 (host only) |
| Host Segments | 134 (46%) | 30-50 (10-17%) |
| Mariam Segments | 1 (0.3%) | 20-30 (7-10%) |
| JJ Segments | 5 (1.7%) | 20-30 (7-10%) |
| Olami Segments | 0 (in host cluster) | 20-30 (7-10%) |
| Orphaned Self-IDs | 1 (Olami) | 0 |
| Erin/Aaron Separate | ✓ Yes | ✓ Yes |

---

## Next Steps

1. **Re-upload the debate** and check the export JSON
2. **Review console logs** for orphan recovery and validation messages
3. **Compare segment distribution** to expected ranges
4. **Verify self-ID assignments** using the testing checklist above

If issues persist, the logs will tell us exactly where the system is failing:
- Orphan recovery logs → GPT Pass 1 effectiveness
- CSP validation logs → Anchor extraction accuracy
- Profile scoring logs → Acoustic matching quality

---

**All changes are code-only (no database migrations). Can be rolled back via Git if needed.**
