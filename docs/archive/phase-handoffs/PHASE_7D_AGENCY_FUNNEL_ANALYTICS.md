# Phase 7D: Agency Funnel Analytics Events

Status: Implemented and reviewed. Not committed.

## Objective

Add lightweight first-party analytics events for the public agency funnel without adding third-party trackers or exposing analytics records publicly.

## Schema

Migration:

```text
supabase/migrations/20260608160000_phase_7d_agency_funnel_events.sql
```

Table added:

```text
agency_funnel_events
```

Fields include:

- event name
- anonymous ID
- optional lead ID
- path/referrer
- UTM fields
- sanitized metadata JSON
- created timestamp

Allowed events:

- `agency_page_view`
- `agency_cta_click`
- `agency_intake_view`
- `agency_intake_started`
- `agency_intake_submitted`
- `agency_intake_validation_error`
- `agency_thank_you_view`

## Security Model

The analytics table has RLS enabled.

No direct anonymous or authenticated table access is granted:

```sql
REVOKE ALL ON public.agency_funnel_events FROM anon;
REVOKE ALL ON public.agency_funnel_events FROM authenticated;
```

Only service role can manage rows. Public writes go through the API route, which validates event names and sanitizes metadata.

No internal read API was added in this phase. That can be added later if the dashboard needs analytics reporting.

## Public Event API

Route:

```text
POST /api/agency-funnel-events
```

Behavior:

- validates allowed event names
- rate limits public writes with a bounded in-memory limiter
- strips PII-like metadata keys
- stores path, referrer, UTM fields, anonymous ID, and safe metadata
- returns only `{ "success": true }`
- does not return event records

Public reads return:

```text
405 Method not allowed
```

## Client Tracking

Added:

```text
lib/agency-funnel-client.ts
components/site/AgencyFunnelTracker.tsx
```

The tracker is mounted only in the public agency shell.

Tracked client-side events:

- agency page views
- intake page views
- thank-you page views
- agency contact CTA clicks
- intake form started
- intake validation/submission errors

Tracking failure is ignored so analytics cannot break the public funnel.

## Lead Submission Event

Updated:

```text
app/api/agency-leads/route.ts
```

After a valid lead is stored, the route records:

```text
agency_intake_submitted
```

That event is linked to the stored `lead_id` server-side. If event recording fails, the lead submission still succeeds.

## Privacy Decisions

The analytics helper strips metadata keys that may contain personal or sensitive information, including:

- email
- name
- message
- phone
- company
- website/url
- token/secret/password/cookie/authorization

Allowed metadata is intentionally narrow:

- CTA label/href
- form ID
- source
- selected offer title
- validation error category/message

## Intentionally Not Tracked

- internal agency console activity
- SaaS dashboard activity
- billing activity
- Slack/Granola workflows
- raw lead message content
- raw email/name/company/website fields

## Intentionally Not Built

- Google Analytics
- Meta Pixel
- LinkedIn Insight Tag
- third-party trackers
- external analytics sync
- broad analytics dashboard
- public analytics read access

## Tests Added or Updated

Coverage includes:

- allowed event normalization
- disallowed event rejection
- metadata PII stripping
- public event rate limiting
- API insert success without returning records
- public read rejection
- lead submission event linked to lead ID
- funnel events migration privacy/RLS checks
