# Phase 1C-2: Ad-Hoc Project Route Cutover

Date: 2026-05-26

## Scope

This phase converts single-project API routes that still had ad-hoc ownership checks to the central `requireProjectOwner` helper, while avoiding broad list-route, billing-wide, integration-wide, and UI conversion.

Out of scope (unchanged):
- Dashboard list routes
- Billing-wide route conversion
- Integration-wide route conversion
- Subscription billing
- Agency client features
- Slack/Granola work
- UI redesign

## Routes Converted

The following routes now use `requireProjectOwner` for project authorization:

- `app/api/upload/finalize/route.ts`
- `app/api/generate-selected-content/route.ts`
- `app/api/projects/[id]/audio/route.ts`
- `app/api/projects/[id]/audio-url/route.ts`
- `app/api/projects/[id]/cancel/route.ts`
- `app/api/projects/[id]/generate/route.ts`
- `app/api/projects/[id]/status/route.ts`
- `app/api/projects/[id]/run-coverage/route.ts`
- `app/api/projects/[id]/reconcile/route.ts` (non-internal user path)

## Routes Inspected But Skipped

### `app/api/transcribe/route.ts`

Skipped in this phase.

Reason:
- This route is hybrid internal-worker + user-triggered processing and relies on request body `projectId`, queued/background orchestration, maintenance/internal authentication behavior, and long-running lock semantics.
- Forcing it fully into helper-driven request auth in this phase would risk changing internal processing behavior, which is out of scope.

Current behavior retained:
- Existing non-internal ownership check remains (`callerUserId` vs `project.user_id`).
- Internal worker/maintenance path remains unchanged.

## Compatibility Notes

- Legacy owner access still works through helper's `legacy_owner` path.
- Active organization members now gain access on converted routes when `project.organization_id` is present and membership is active.
- Legacy projects with `organization_id = null` remain owner-only.
- `audio-url` and `status` preserve their schema-compat fallback reads while delegating authorization to `requireProjectOwner`.

## Focused Logic Preservation

- Business logic, AI/transcription/generation pipelines, and billing workflows were not broadly refactored.
- Route status validation and response payloads were preserved as closely as possible.
- For `cancel`, post-auth project status mutation now scopes by `projectId` after helper authorization (instead of a redundant `user_id` filter), so org-member authorized access can execute correctly.

## Tests

Added focused test coverage for a converted route:
- `tests/lib/project-audio-route-auth.test.ts`

Also kept helper tests:
- `tests/lib/route-auth.test.ts`

## Remaining Ad-Hoc `user_id` Checks

Not all ad-hoc checks are converted yet. Remaining categories include:
- Internal/worker routes (notably `app/api/transcribe/route.ts`)
- Non-helper project routes outside this phase scope
- List/dashboard/billing/integration/admin areas intentionally deferred

## Validation

Commands run:
- `npx tsc --noEmit` -> pass
- `npm run -s lint` -> pass with existing warnings only (no new errors)
- `npx jest --runInBand tests/lib/route-auth.test.ts tests/lib/project-audio-route-auth.test.ts` -> pass

## Next Steps (Phase 1C-3)

1. Convert remaining safe single-project ad-hoc routes (outside internal worker flows).
2. Plan a dedicated cutover for `transcribe`-style hybrid internal routes with explicit internal-vs-user auth paths.
3. Continue keeping list/billing/integration-wide cutovers in separate scoped phases.
