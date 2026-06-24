# Phase 7E: Lead Qualification, Scoring, and Routing

Status: Implemented and reviewed. Not committed.

## Objective

Add deterministic qualification fields, scoring, and internal routing controls so public agency leads can be prioritized without adding AI scoring, auto-rejection, CRM sync, or automatic client creation.

## Schema

Migration:

```text
supabase/migrations/20260608170000_phase_7e_agency_lead_qualification.sql
```

Fields added to `agency_leads`:

- `qualification_score integer`
- `qualification_tier text`
- `assigned_to uuid references auth.users(id) on delete set null`
- `review_notes text`
- `last_contacted_at timestamptz`
- `next_follow_up_at timestamptz`

Tier values:

- `high`
- `medium`
- `low`
- `unqualified`

The migration adds score/tier constraints and indexes for tier, assignee, and next follow-up.

The existing `agency_leads` RLS model is unchanged: no direct public table access, service-role route access only.

## Scoring Helper

Created:

```text
lib/agency-lead-qualification.ts
```

Scoring is deterministic and explainable.

Factors include:

- package interest present
- company present
- website present
- budget range present
- budget range matching service range
- timeline present
- active timeline
- role present
- decision-maker or operator role
- useful message context/detail
- low-context penalty
- excessive-link penalty

The score is bounded from 0 to 100.

Tier thresholds:

- `high`: 70+
- `medium`: 45-69
- `low`: 20-44
- `unqualified`: below 20

## Public Lead Creation

Public lead creation now computes an initial deterministic score and tier.

This does not:

- reject the lead
- create a client
- assign a user
- trigger external systems
- change public form fields

## Internal API Updates

Updated:

```text
GET /api/agency/leads
PATCH /api/agency/leads/:id
```

List supports:

- status filter
- qualification tier filter

Patch supports:

- status
- score
- tier
- assignee
- review notes
- last contacted date
- next follow-up date

Demo users remain blocked from writes.

## Internal UI Updates

Updated:

```text
app/dashboard/agency/leads/page.tsx
```

The agency lead review page now shows:

- qualification score/tier
- high-fit count
- tier filter
- assignee field
- review notes
- last contacted date
- next follow-up date

The UI preserves the existing status update and lead-to-client conversion workflow.

## Limitations

- Assignment uses a user UUID field. A richer member picker can be added later if needed.
- Scores are a prioritization aid only.
- There is no AI scoring.
- Leads are not auto-rejected.
- Leads are not auto-converted.
- No external CRM integration was added.

## Tests Added or Updated

Coverage includes:

- score calculation and tier thresholds
- sparse leads remain stored as unqualified
- public lead gets initial score/tier
- internal tier filtering
- internal qualification updates
- demo write blocking remains enforced
- schema migration fields and constraints
- existing lead conversion behavior remains deliberate
