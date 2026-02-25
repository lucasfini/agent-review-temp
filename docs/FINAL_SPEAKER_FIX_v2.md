# Speaker Attribution - Final Fix (v2)

## What Went Wrong with v1

The first fix (adding aggressive debate extraction) made things WORSE:
- speaker_11: Extracted "Nigerian" as a name (from "I'm Nigerian")
- speaker_12: Extracted "your second" as a name
- speaker_10: Created with "your second" as finalName
- Result: 11 speakers instead of 10, severe imbalance

**Root Cause**: Emphasized "EXTRACT ALL SELF-IDS" → GPT extracted adjectives/phrases as names.

---

## v2 Fixes Implemented

### 1. Reverted Aggressive GPT Prompt ✅
**Reverted**: Removed "DEBATES & PANELS: EXTRACT ALL SELF-IDENTIFICATIONS"
**Added**: Explicit name validation rules in GPT prompt:
```
NAME EXTRACTION: Only extract FULL PROPER NAMES:
- Valid: "Olami Olaleri", "Sam Harris", "Dr. Jane Smith", "JJ"
- INVALID: Adjectives ("Nigerian"), possessives ("your second"), descriptors
- If you see "My name is Olami" but also "I'm Nigerian" → extract "Olami", NOT "Nigerian"
```

### 2. Enhanced Stopwords in GPT Validation ✅
**File**: `lib/gpt-speaker-intelligence.ts:418-437`

**Added to stopword list**:
- Possessives: `your`, `his`, `her`, `their`, `our`
- Ordinals: `first`, `second`, `third`, `last`, `final`
- Nationalities: `nigerian`, `american`, `canadian`, `british`, `indian`, `chinese`, etc.
- Role descriptors: `student`, `candidate`, `host`, `moderator`, `speaker`, `guest`

**Effect**: `isValidSpeakerName("Nigerian")` → `false` → name set to `null`

### 3. Added Name Validation in Constraint Solver ✅
**File**: `lib/constraint-solver.ts:693-725`

**New function**: `extractSelfIdName()` now validates names before returning:
- Rejects possessives (`your`, `my`)
- Rejects nationalities (`Nigerian`)
- Rejects ordinals (`second`, `third`)
- Rejects all-lowercase (likely verbs)

### 4. Added Name Validation in Orphan Recovery ✅
**File**: `lib/refactored-speaker-pipeline.ts:27-60`

**New function**: `isValidProperName()` with same validation as constraint solver.

---

## How It Works Now

### GPT Pass 1: Speaker Intelligence
1. GPT extracts speaker names from transcript
2. **NEW**: Names validated through `isValidSpeakerName()`
3. Invalid names ("Nigerian", "your second") → rejected → set to `null`
4. Output: Clean roster with only valid proper names

### Pass 1.5: Orphan Recovery
1. Scans segments for self-IDs not in GPT roster
2. **NEW**: Validates extracted names before creating speakers
3. Rejects invalid names with logging
4. Only creates speakers for valid proper names

### Pass 2: Constraint Solver
1. Extracts anchors from self-IDs
2. **NEW**: Validates names during extraction
3. Logs rejected invalid names
4. Only creates anchors for valid matches

---

## Expected Results (Next Upload)

### ✅ What Should Happen

1. **10 Speakers Total**:
   - 9 candidates: Terry, Emily, Abdullah, Aaron, Mariam, Colin, Christopher, JJ, Erin
   - 1 host: [actual host name] OR speaker_N (unnamed)

2. **"My name is Olami" Handling**:
   - **If GPT extracts "Olami"**: Assigned correctly to Olami candidate
   - **If GPT misses "Olami"**: Orphan recovery creates speaker_N: "Olami"
   - **"Nigerian" rejected**: Won't create a "Nigerian" speaker

3. **Balanced Segments**:
   - Host: 30-50 segments (handoff language)
   - Candidates: 20-35 segments each (within 25% of average)
   - No 1-segment or 109-segment speakers

4. **No Invalid Names**:
   - No "Nigerian", "your second", "first", "student", etc.
   - All speakers have either proper names or null (fallback to role)

---

## Validation Checklist

### Check 1: Speaker Count
```
Expected: 10 speakers (9 candidates + 1 host)
```

### Check 2: Name Validity
```
All finalNames should be either:
- Valid proper names (capitalized, 1-3 words)
- Role-based fallbacks ("Guest 1", "Host")
- NOT: "Nigerian", "your second", "first", "student", adjectives
```

### Check 3: Olami Assignment
Search for "My name is Olami" segment:
```
Expected: Assigned to speaker with finalName="Olami Olaleri" or "Olami"
OR: Created via orphan recovery if GPT missed it
```

### Check 4: Segment Balance
```
Host: 30-50 segments (10-17% of total)
Each candidate: 15-40 segments (5-14% each)
No candidate with <10 or >50 segments
```

### Check 5: Console Logs
Look for these indicators of success:
```
[GPT SPEAKER INTELLIGENCE] Sanitized names: [...] ← Should reject bad names
[ORPHAN RECOVERY] Rejected invalid name: "Nigerian" ← Validation working
[CSP] Rejected invalid self-ID name: "your second" ← Pattern validation working
```

---

## If Issues Persist

### Scenario 1: Still Extracting Invalid Names

**Check Logs**:
```
[GPT SPEAKER INTELLIGENCE] speaker_11: Nigerian (guest, conf: 0.9)
```

**Diagnosis**: Stopword validation not working.

**Fix**: The name might be multi-word like "Nigerian Student". Update validation to check ALL words:
```typescript
// In isValidSpeakerName()
const allWords = words.map(w => w.toLowerCase());
if (allWords.some(w => stopwords.has(w))) return false;
```

### Scenario 2: Olami Still Missing

**Check Logs**:
```
[GPT SPEAKER INTELLIGENCE] GPT identified 9 speakers
[ORPHAN RECOVERY] Found 1 self-identified speakers NOT in GPT roster:
[ORPHAN RECOVERY]   - "Olami"
[ORPHAN RECOVERY] ✓ Created speaker_11: "Olami"
```

**Status**: This is actually GOOD - orphan recovery caught it.

**If orphan recovery also fails**:
- Check if "Olami" is being rejected by name validation (shouldn't be)
- Check console for `[ORPHAN RECOVERY] Rejected invalid name: "Olami"`
- If so, "olami" might be in stopwords (it shouldn't be)

### Scenario 3: 11+ Speakers Created

**Check Logs**:
```
[GPT SPEAKER INTELLIGENCE] GPT identified 11 speakers
```

**Diagnosis**: GPT is over-extracting speakers.

**Fix**: Increase conservativeness in GPT prompt:
```
WHEN UNCERTAIN: Prefer fewer speakers over more. Require STRONG evidence (self-ID or introduction) before creating a speaker entry.
```

---

## Technical Implementation Details

### Name Validation Pipeline

```
GPT Extraction
    ↓
isValidSpeakerName() → Rejects invalid names
    ↓
gptSpeaker.name (cleaned)
    ↓
Orphan Recovery: isValidProperName() → Double-check
    ↓
Constraint Solver: extractSelfIdName() → Triple-check
    ↓
Final roster with only valid names
```

### Validation Rules (Applied at All Stages)

1. **Must start with capital letter** (proper noun)
2. **1-3 words max** (human names are short)
3. **No stopwords** (articles, possessives, nationalities, descriptors)
4. **Only letters, hyphens, apostrophes** (names like "O'Brien", "Mary-Jane")
5. **Not all lowercase** (rejects verbs like "trying", "going")

### Stopwords List (Comprehensive)

```typescript
stopwords = [
  // Possessives
  'my', 'your', 'his', 'her', 'their', 'our',

  // Ordinals
  'first', 'second', 'third', 'last', 'next', 'final',

  // Nationalities (80+ common ones)
  'nigerian', 'american', 'canadian', 'british', ...

  // Role descriptors
  'student', 'candidate', 'host', 'moderator', 'speaker', 'guest',

  // Common false positives
  'person', 'guy', 'man', 'woman', 'people', 'one', 'two'
]
```

---

## Rollback Instructions

If v2 causes new issues:

```bash
git log --oneline -5  # Find commit before these changes
git checkout <commit-hash> -- lib/gpt-speaker-intelligence.ts lib/constraint-solver.ts lib/refactored-speaker-pipeline.ts
```

Or manually revert stopwords list to original (remove nationalities, ordinals, descriptors).

---

## Success Metrics

| Metric | v1 (Broken) | v2 (Expected) |
|--------|-------------|---------------|
| Total Speakers | 11 | 10 |
| Invalid Names | 2 ("Nigerian", "your second") | 0 |
| Named Candidates | 10 | 9 |
| Host Segments | 109 (38%) | 30-50 (10-17%) |
| Smallest Candidate | 1 segment (Mariam) | 15+ segments |
| Largest Candidate | 109 segments (host) | 35 segments |
| Olami Found | No (absorbed into host) | Yes |

---

**Next Step**: Re-upload MSU Debate 2026 and verify speaker count = 10 with valid names only!
