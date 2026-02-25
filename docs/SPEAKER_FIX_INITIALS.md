# Speaker Attribution Fix: Initials Support (JJ, DJ, etc.)

## Problem Discovered

The self-ID patterns were failing to detect names that use initials or lowercase nicknames:

### Pattern Limitation
```typescript
// OLD PATTERN (broken for initials):
/\b(?:my name is|My name is|MY NAME IS)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:\s|[.,!?]|$)/
//                                         ^^^^^^^^^^^^^^
//                                         Requires: Capital + lowercase (e.g., "John")
//                                         REJECTS: "JJ", "jj", "DJ", etc.
```

### Real-World Impact (MSU Debate 2026)

From the JSON export analysis:

**Segment 7-8 sequence:**
```
Seg 7 (speaker_10): "Thank you. You'll move now to Juliana. Jack."
Seg 8 (speaker_10): "Hi, folks. My name is jj. I use she her pronouns."
```

**What went wrong:**
1. ❌ Pattern didn't match "jj" (all lowercase, doesn't match `[A-Z][a-z]+`)
2. ❌ Pass 1.6 conflict detection never found "jj" in speaker_10
3. ❌ GPT only saw "Juliana Jack" from the handoff, not the self-ID
4. ❌ speaker_10 (Host) ended up with 125 segments (Host + JJ merged)
5. ❌ "JJ" / "Juliana Jack" was never properly separated into its own speaker

**Validation also rejected initials:**
```typescript
// In isValidProperName() and extractSelfIdName():
if (name === name.toLowerCase()) {  // "jj" rejected here
  return false;
}

// In isValidSpeakerName() (GPT):
const hasUppercase = /[A-Z]/.test(cleaned);  // "jj" rejected here
if (!hasUppercase) return false;
```

---

## Fix Implemented

### 1. Updated Self-ID Patterns

**File:** `lib/self-id-patterns.ts`

```typescript
export const STRONG_SELF_ID_PATTERNS = [
  // "My name is Colin Scott" - captures proper names (Colin Scott)
  // Also handles initials/nicknames: "JJ", "jj", "DJ"
  /\b(?:my name is|My name is|MY NAME IS)\s+([A-Z]{2,}|[a-z]{2,}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:\s|[.,!?]|$)/,

  // Pattern now matches THREE types:
  // 1. [A-Z]{2,}       → All-caps initials: "JJ", "DJ", "ABC"
  // 2. [a-z]{2,}       → Lowercase nicknames: "jj", "sam"
  // 3. [A-Z][a-z]+...  → Proper names: "Colin Scott"

  // Same for "I'm" and "I am" patterns...
];
```

### 2. Updated Name Validation (3 files)

#### A. `lib/refactored-speaker-pipeline.ts` - isValidProperName()

```typescript
function isValidProperName(name: string): boolean {
  // ... existing validation ...

  // Allow initials/nicknames: 2-3 characters, all same case (JJ, DJ, jj, etc.)
  const isInitials = /^[A-Z]{2,3}$/.test(name) || /^[a-z]{2,3}$/.test(name);
  if (isInitials) {
    return true; // Initials are valid
  }

  // Reject if all lowercase (likely a verb or adjective) - but not initials
  if (name === name.toLowerCase()) {
    return false;
  }

  return true;
}
```

#### B. `lib/constraint-solver.ts` - extractSelfIdName()

```typescript
function extractSelfIdName(text: string): string | null {
  // ... pattern matching ...

  // Allow initials/nicknames: 2-3 characters, all same case (JJ, DJ, jj, etc.)
  const isInitials = /^[A-Z]{2,3}$/.test(extracted) || /^[a-z]{2,3}$/.test(extracted);
  if (isInitials) {
    return extracted; // Initials are valid
  }

  // ... rest of validation ...
}
```

#### C. `lib/gpt-speaker-intelligence.ts` - isValidSpeakerName()

```typescript
function isValidSpeakerName(name: string): boolean {
  const cleaned = name.trim();
  const words = cleaned.split(/\s+/);

  // Allow initials/nicknames: single word, 2-3 chars, all same case (JJ, DJ, jj, etc.)
  const isInitials = words.length === 1 && (/^[A-Z]{2,3}$/.test(cleaned) || /^[a-z]{2,3}$/.test(cleaned));
  if (isInitials) {
    return true; // Initials are valid
  }

  // ... rest of validation ...
}
```

---

## Testing Results

### Pattern Matching Tests

| Input Text | OLD Result | NEW Result |
|------------|-----------|-----------|
| `"Hi, folks. My name is jj. I use she her pronouns."` | ❌ No match | ✅ Matched: "jj" |
| `"My name is JJ"` | ❌ No match | ✅ Matched: "JJ" |
| `"My name is Juliana Jack and I use she her pronouns."` | ✅ Matched: "Juliana Jack" | ✅ Matched: "Juliana Jack" |
| `"My name is Erin. I am so happy"` | ✅ Matched: "Erin" | ✅ Matched: "Erin" |
| `"My name is Abdullah Masoodi."` | ✅ Matched: "Abdullah Masoodi" | ✅ Matched: "Abdullah Masoodi" |

### Validation Tests

| Name | OLD `isValidProperName()` | NEW `isValidProperName()` |
|------|--------------------------|--------------------------|
| `"jj"` | ❌ Rejected (all lowercase) | ✅ Accepted (initials) |
| `"JJ"` | ✅ Accepted (has uppercase) | ✅ Accepted (initials) |
| `"DJ"` | ✅ Accepted | ✅ Accepted |
| `"trying"` | ❌ Rejected (all lowercase) | ❌ Rejected (not initials) |
| `"Colin Scott"` | ✅ Accepted | ✅ Accepted |

---

## Expected Results (Next Upload)

### ✅ What Should Happen Now

1. **JJ Detection**:
   - "My name is jj" segment → extracted as "jj"
   - Pass 1.6 detects conflict: speaker_10 has both "jj" (self-ID) and Host behavior
   - Creates new speaker for "jj" or matches to "Juliana Jack" in roster

2. **Dirty Cluster Resolution**:
   - speaker_10 (Host) should split into:
     - Host speaker: ~50-70 handoff segments
     - JJ/Juliana Jack speaker: ~20-35 segments with self-ID "jj"

3. **Speaker Count**:
   - Should reach **10 total speakers** (9 candidates + 1 host)
   - All 9 expected candidates present:
     1. Terry
     2. Emily Donjong
     3. Abdullah Masoodi (currently mislabeled as "Juliana Jack")
     4. Aaron Rebelo (currently merged with Erin)
     5. Mariam Saleem
     6. Colin Scott
     7. Christopher Xenos
     8. JJ / Juliana Jack (currently merged with Host)
     9. Erin (currently merged with Aaron)

4. **Segment Balance**:
   - Host: 50-70 segments (15-20% of total)
   - Each candidate: 18-35 segments (5-10% each)
   - No more 125-segment clusters

---

## Remaining Issues to Fix

### Issue 1: Erin + Aaron Phonetic Collision

**Problem:** speaker_11 contains both:
- "My name is Erin" (self-ID)
- "Aaron I think one thing..." (Aaron speaking)

**Why it's not split:**
- Both are valid self-IDs
- Pattern only matches strong self-IDs ("My name is X")
- "Aaron I think..." doesn't match self-ID pattern (correct behavior)

**Solution needed:**
- Implement segment-level speaker attribution using:
  - Acoustic embeddings (Erin and Aaron have different voices)
  - LLM dirty cluster resolver for speaker_11
  - Check for intro handoff: "Next we have Aaron Rebelo" → following segments should be Aaron

### Issue 2: Abdullah Mislabeled as "Juliana Jack"

**Problem:** speaker_4 has:
- Self-ID: "My name is Abdullah Masoodi"
- But roster shows finalName: "Juliana Jack"

**Likely cause:**
- GPT extracted both "Juliana Jack" (from handoff) and "Abdullah Masoodi" (from self-ID)
- Mapping logic incorrectly assigned "Juliana Jack" name to speaker_4
- This is a CSP or reconciliation error, not a pattern matching issue

**Solution needed:**
- Investigate why CSP/reconciliation chose "Juliana Jack" over the self-ID "Abdullah Masoodi"
- Priority ranking should be: self-ID > handoff target > majority vote

---

## Files Modified

| File | Lines Changed | Change Summary |
|------|---------------|----------------|
| `lib/self-id-patterns.ts` | 10-18 | Added `[A-Z]{2,}\|[a-z]{2,}` to match initials |
| `lib/refactored-speaker-pipeline.ts` | 49-60 | Added initials exception to validation |
| `lib/constraint-solver.ts` | 715-726 | Added initials exception to validation |
| `lib/gpt-speaker-intelligence.ts` | 413-419 | Added initials exception to validation |

---

## Next Steps

1. **Re-upload MSU Debate 2026** to test the fix
2. **Verify JJ detection**:
   - Check logs for: `[CONFLICT DETECTION] Cluster speaker_10 has 2 different self-IDs: "jj", ...`
   - Check roster includes "JJ" or "Juliana Jack" as separate speaker
3. **Check speaker count**: Should be 10 (not 9)
4. **Check segment distribution**: No 125-segment clusters
5. **Address remaining issues**:
   - Erin/Aaron split (acoustic + LLM resolver)
   - Abdullah/Juliana Jack name mixup (CSP priority fix)

---

## Rollback Instructions

If this fix causes new issues:

```bash
git checkout HEAD~1 -- lib/self-id-patterns.ts lib/refactored-speaker-pipeline.ts lib/constraint-solver.ts lib/gpt-speaker-intelligence.ts
```

Or manually revert the patterns to old version:
```typescript
// OLD (revert to this if needed):
/\b(?:my name is|My name is|MY NAME IS)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:\s|[.,!?]|$)/
```

---

## Success Criteria

✅ **Fix Complete When:**
- "My name is jj" detected in segments
- Pass 1.6 creates "jj" or "Juliana Jack" speaker
- speaker_10 (Host) has <70 segments (not 125)
- Total speaker count = 10 (not 9)
- All 9 expected candidates present in roster

**Date implemented:** 2026-02-09
**Ready for testing:** Yes ✅
