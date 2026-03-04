# OpenAI Key Opt-in Plan

## Overview
AudioRepurpose now supports an opt-in model where users who agree to OpenAI data sharing use a separate API key (`OPENAI_API_KEY_OPTIN`), while all others use a strict non-data-sharing key (`OPENAI_API_KEY_NONOPTIN`). 

All direct references to `process.env.OPENAI_API_KEY` must be replaced with the user-aware resolver located in `@/lib/openai/consent.ts`.

## 1. Single Source of Truth
The resolver function already exists in `lib/openai/consent.ts`:

```typescript
export async function getOpenAIApiKeyForUser(userId?: string): Promise<string | null>
export async function getOpenAIClientForUser(userId?: string): Promise<OpenAI | null>
```

**Data flow:**
1. Call `getOpenAIApiKeyForUser(userId)`.
2. It fetches the user's `user_metadata.openai_data_sharing_opt_in` from Supabase Auth admin.
3. If true and `OPENAI_API_KEY_OPTIN` exists, it returns it.
4. Otherwise, it returns `DEFAULT_NONOPTIN_KEY` (which falls back to `OPENAI_API_KEY_NONOPTIN` or `OPENAI_API_KEY`).
5. Background scripts without a `userId` naturally fallback to the non-opt-in key.

## 2. Inventory & Replacements

### Core Lib Services
These services must be updated to accept `userId` and await the resolved key instead of falling back to `process.env.OPENAI_API_KEY`.

- `lib/llm-segment-mapping.ts`
- `lib/gpt-speaker-intelligence.ts`
- `lib/gpt-segment-reassignment.ts`
- `lib/speaker-intelligence.ts`
- `lib/speaker-role-classifier.ts`
- `lib/dirty-cluster-resolution.ts`
- `lib/narrative-coverage-analyzer.ts`
- `lib/refactored-speaker-pipeline.ts`

**Change Pattern:**
```diff
- const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
+ import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
+ const apiKey = options.apiKey || await getOpenAIApiKeyForUser(options.userId);
```
*(Requires adding `userId?: string` to each function's `options` interface and making callers async where necessary).*

### Content Generators
Similarly, update these functions in `lib/content-generators/`:
- `summary.ts`
- `chapters.ts`
- `takeaways.ts`
- `quotes.ts`
- `pre-processor.ts`

### Multi-Provider Layer
- `lib/ai-providers/multi-provider.ts` -> Ensure the caller passes the resolved OpenAI key down instead of letting the constructor fallback to `process.env`.

### Testing & Verification Scripts
Scripts like `run-audio-pipeline-test.ts` and `regression-test.ts` pass options to the pipeline.
- Update them to directly require `OPENAI_API_KEY_NONOPTIN` or default to standard behavior. Since they don't have a concept of `userId`, they will naturally get the non-optin key via the consent helper if no `apiKey` is provided.

## 3. Environment Variables

- [ ] Ensure `.env.local` and Vercel/production environments define both `OPENAI_API_KEY_OPTIN` (for opted-in users generating content) and `OPENAI_API_KEY_NONOPTIN` (for background processing, basic tier, and non-opted-in users).
- [ ] Remove hard requirements and checks for `OPENAI_API_KEY` in deployment scripts, pointing instead to the new variables.

## 4. Edge Cases

- **Webhooks / API routes:** Ensure the `/api/upload` and `/api/content/generate` routes pass the `user.id` from the Supabase session into the pipeline functions so the correct key resolves.
- **Unauthenticated Users:** The resolver safely falls back to the Non-opt-in key. No specific handling needed.
- **Database Schema:** No schema changes required. The opt-in flag is stored securely within Supabase `user_metadata` JSONB.

## 5. Verification Checklist

- [ ] Opt in via Settings and verify a generated output request headers use the `sk-...OPTIN` key.
- [ ] Opt out via Settings and verify requests use the `sk-...NONOPTIN` key.
- [ ] Upload an audio file as a non-opt-in user and ensure no pipeline crashes due to a "missing OPENAI_API_KEY" error.
