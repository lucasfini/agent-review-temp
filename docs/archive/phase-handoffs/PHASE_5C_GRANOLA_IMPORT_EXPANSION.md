# Phase 5C: Granola Import Expansion

## Summary

Phase 5C expands the private internal agency Granola manual import workflow.

Agency users can now capture richer meeting context from pasted Granola notes and save it as structured `source_imports.metadata_json` while preserving the existing manual-only source import behavior.

No Granola OAuth, API calls, scheduled sync, or automated generation were added.

## Manual-Only Design

The workflow remains:

- select an internal agency client
- paste Granola meeting notes
- optionally fill structured meeting fields
- save an internal `source_imports` record with `provider = 'granola'`

`client_integrations.provider = 'granola'` remains passive tracking for the manual workflow. It does not represent an external Granola API connection.

## Fields Captured

The API accepts and stores:

- meeting title
- meeting date
- meeting type
- participants
- raw notes
- summary
- decisions
- action items
- customer pain points
- notable quotes
- follow-up opportunities

Raw notes are stored in `source_imports.raw_text`.

Summary is stored in `source_imports.summary`.

Structured fields are stored in `source_imports.metadata_json`.

## Parser Behavior

Added:

```text
lib/agency-granola-parser.ts
```

The parser is deterministic and best-effort. It looks for common pasted-note headings such as:

- `Summary`
- `Participants`
- `Decisions`
- `Action Items`
- `Customer Pain Points`
- `Notable Quotes`
- `Follow-up Opportunities`

Explicit form/API fields override parsed sections. Parser warnings are stored in metadata but never fail an import.

No AI parsing is used.

## API Updated

Updated:

```text
POST /api/agency/granola/imports
GET /api/agency/granola/imports
```

Existing access rules remain unchanged:

- internal agency access only
- selected client must belong to the active internal agency organization
- source import writes require internal agency operator access
- demo users are read-only
- SaaS organizations are denied

## UI Updated

Updated:

```text
/dashboard/agency/granola
```

The page now includes:

- meeting type
- decisions
- action items
- customer pain points
- notable quotes
- follow-up opportunities
- structured preview before save
- recent import metadata badges for meeting type, participant count, and action count

The page remains private to internal agency organizations.

## Intentionally Not Built

- Granola OAuth
- Granola API integration
- scheduled Granola sync
- fake external connection status
- automatic draft generation
- Slack behavior changes
- SaaS customer Granola surface
- billing changes

## Tests Added Or Updated

- `tests/lib/agency-granola-parser.test.ts`
- `tests/lib/agency-granola-imports-route.test.ts`

Coverage includes:

- structured heading parsing
- list deduplication
- explicit manual fields overriding parsed note sections
- parser warnings without import failure
- Granola route structured metadata persistence
- provider remains `granola`
- existing SaaS denial and demo write blocking

## Validation

Passed:

```bash
npm test -- tests/lib/agency-granola-parser.test.ts tests/lib/agency-granola-imports-route.test.ts tests/lib/agency-source-imports.test.ts tests/lib/agency-source-imports-route.test.ts tests/lib/agency-client-integrations.test.ts tests/lib/agency-permissions.test.ts --runInBand
npx tsc --noEmit
git diff --check
```

Focused test result:

- 6 test suites passed
- 38 tests passed

Full lint is run as part of the broader Phase 5 validation passes.

## Next Phase

Phase 5D can connect internal agency source imports to draft generation. Granola should remain manual source material unless a later phase explicitly approves real API integration or scheduled sync.
