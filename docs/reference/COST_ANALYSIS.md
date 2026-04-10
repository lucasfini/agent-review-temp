# Cost Analysis

This document describes the current source of truth for pricing and usage tracking in the app.

## Canonical Runtime Sources

Use these files instead of hard-coded pricing notes in older docs:

- [lib/billing/cost-map.ts](/Users/lucas/Desktop/audiorepurpose/lib/billing/cost-map.ts)
- [lib/billing/track-usage.ts](/Users/lucas/Desktop/audiorepurpose/lib/billing/track-usage.ts)
- [lib/cost-calculator.ts](/Users/lucas/Desktop/audiorepurpose/lib/cost-calculator.ts)
- [lib/transaction-data.ts](/Users/lucas/Desktop/audiorepurpose/lib/transaction-data.ts)

## What The App Uses Now

- AssemblyAI for transcription-related provider costs
- OpenAI for supported OpenAI-backed features
- Anthropic for supported Claude-backed features
- Perplexity for supported research flows

The actual billed pricing shown by the app is derived from the code, not from static markdown tables.

## Markup

The app reads the configured markup from:

- `COST_MARKUP_PERCENTAGE`

If you want to change production pricing posture, update the runtime config and validate the resulting UI and billing behavior end to end.

## Important Note

Older cost docs referenced:

- Whisper-era transcription pricing
- local PyAnnote assumptions
- older deployment overhead assumptions

Do not use those older static numbers for launch decisions. Use the current billing code and a live verification pass in staging or production-like infrastructure.
