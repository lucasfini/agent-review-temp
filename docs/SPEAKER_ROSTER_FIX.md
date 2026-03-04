# Speaker Roster Fix Implementation Brief

## 1. Problem Summary
The Speaker Roster provided via "Advanced Settings" during upload is successfully saving to the database (`preset_speakers` on the `projects` table) and passing to the backend processing pipeline. However, the speaker identification pipeline (`lib/refactored-speaker-pipeline.ts`) passes the roster into `identifySpeakersWithGPT` (Pass 1) as a prompt hint without strictly enforcing its output. Because the LLM makes its own decisions, it can drop user-provided names, rename them, or assign them to incorrect roles. Furthermore, later passes (orphan recovery, dirty cluster detection, heuristics) can inadvertently mutate or overwrite these roster entries, leading to a mismatch between the provided roster and the output shown in the Speakers tab and Conversation view.

## 2. Expected Behavior
- **Authoritative Roster (Partial or Full):** A user might provide a roster of 2 speakers for an audio file that actually contains 5 speakers. The pipeline **should still run GPT-based name extraction** to identify the remaining 3 speakers, but the 2 user-provided roster names must be treated as absolute sources of truth. 
- **No Overrides:** The 2 provided roster names must exist in the final speaker list exactly as inputted by the user. The AI cannot rename them, replace them, or alter their spelling.
- **Roster Injection / Post-Pass-1 Enforcement:** After Pass 1 (GPT extraction) runs, the pipeline must guarantee that all preset roster speakers are present in the list before moving to Pass 2 (Mapping).
- **Protection from Downstream Mutations:** Heuristic passes (such as Orphan Recovery, Title-Based Host Lock, Conflict Detection) must explicitly ignore and NEVER mutate speakers that were defined in the user's preset roster.

## 3. Where to Look in the Codebase
- **Pipeline Invocation:** 
  - `app/api/transcribe/route.ts` (lines ~760-780): Calls `runRefactoredSpeakerPipeline` passing `hasPresetRoster` and `presetRoster`.
- **Speaker Pipeline (The Core Issue):** 
  - `lib/refactored-speaker-pipeline.ts`: The orchestrator for speaker mapping.
  - `lib/gpt-speaker-intelligence.ts` (`identifySpeakersWithGPT`): The Pass 1 prompt that currently takes the `presetRoster` but doesn't hard-enforce the output.
- **Display Components:** 
  - `components/ConversationView.tsx` and `components/SpeakerManagerModal.tsx` simply iterate over `project.speaker_data.speakers`. Fixing the backend automatically fixes the frontend.

## 4. Proposed Changes

### File: `lib/refactored-speaker-pipeline.ts`
Modify the `runRefactoredSpeakerPipeline` function.

**Step 1: Enforce the Roster After Pass 1**
Allow Pass 1 to run normally so GPT can identify any *extra* speakers not included in the roster. Immediately after `identifySpeakersWithGPT` returns, enforce the roster by merging it into `gptResult.speakers`:
- Check if `options.hasPresetRoster` is true.
- Iterate over `options.presetRoster`. Check if `gptResult.speakers` contains an exact name match.
- If it does not, add the preset speaker to the list or overwrite an AI-generated speaker that closely matches it (using fuzzy matching or replacing an `Unknown`). If the preset roster has more speakers than GPT generated, push them as new speaker objects.
- Tag these speakers with `isPreset: true` or `source: 'preset_roster'` so downstream passes know they are untouchable.

**Step 2: Disable Heuristics from Modifying Preset Speakers**
- **Heuristic Fallback (Filename/Title Context):** Do not allow the host-lock or guest-assignment logic to rename a speaker if their `source` is `preset_roster`. The user already accurately defined them.
- **Pass 1.5 & Pass 1.6 (Orphaned / Conflicting Self-IDs):** When checking if an extracted name is in the roster, treat the `presetRoster` names as locked. They can add *new* speakers, but shouldn't create duplicates of the preset names.

### File: `app/api/transcribe/route.ts`
Double-check how `preset_speakers` is passed. Currently, when `hasPresetRoster` is true, it passes `options.speakerCount` as `existingProject.preset_speakers.length`. 
- **Change:** If the user supplies a roster of 2 speakers but the diarization detected 5 voices, setting `speakerCount = 2` might cripple GPT. Pass `speakerCount` as either undefined, or explicitly pass the raw cluster count, so GPT knows to look for all 5 voices while prioritizing the 2 preset names.

## 5. Edge Cases and Fallback Behavior
- **Fewer Custom Speakers than Raw Clusters:** Roster has 2 names, file has 5 speakers. GPT identifies the remaining 3 speakers and maps the 2 roster names. The mapping passes strictly enforce the 2 roster names + 3 AI generated names.
- **More Custom Speakers than Raw Clusters:** Roster has 5 names, file has 3 voices. The 5 roster names are explicitly enforced after Pass 1. Pass 2 (Mapping) will map the 3 voices to the most likely 3 names from the roster, leaving 2 roster names with 0 segments. This is correct behavior.
- **Phonetic Dedup and Enforcement:** Ensure that `deduplicateRosterByPhonetics` does not accidentally merge and delete a preset roster name into an AI-generated slightly-different name.

## 6. Test or Validation Steps
1. **Manual Upload Test (Partial Roster):**
   - Upload an audio file with 4 speakers.
   - Expand **Advanced Settings**.
   - Enter a Roster with only 2 names (e.g., Name: "SuperHost Alpha", Role: Host; Name: "Guest Omega", Role: Guest).
   - Start Upload / Processing.
2. **Dashboard Verification:**
   - Go to the **Speakers** tab for the project. 
   - Verify that "SuperHost Alpha" and "Guest Omega" are exactly present.
   - Verify that the pipeline also populated the 2 remaining speakers (either with actual names extracted by GPT, or as Speaker 3 / Speaker 4).
3. **Database Check:**
   - Verify `speaker_data.speakers` rigidly retained the provided names and correctly mapped the extra speakers.
