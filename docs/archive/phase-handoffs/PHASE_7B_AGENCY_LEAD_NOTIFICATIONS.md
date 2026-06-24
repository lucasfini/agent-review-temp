# Phase 7B: Agency Lead Notification Emails

Status: Implemented and reviewed. Not committed.

## Objective

Send internal notification emails when a valid public agency lead is submitted, while preserving the public lead intake and internal review workflow.

## Email Provider

The implementation reuses the existing Resend pattern used by support contact emails.

Required shared env var:

```text
RESEND_API_KEY=
```

Agency-specific optional env vars:

```text
AGENCY_LEAD_FROM_EMAIL=
AGENCY_LEAD_NOTIFICATION_EMAIL=
```

Fallback behavior:

- `AGENCY_LEAD_FROM_EMAIL` falls back to `CONTACT_FROM_EMAIL`, then `support@audiorepurpose.com`.
- `AGENCY_LEAD_NOTIFICATION_EMAIL` falls back to `CONTACT_TO_EMAIL`, then `support@audiorepurpose.com`.
- `AGENCY_LEAD_NOTIFICATION_EMAIL` supports comma-separated recipients.
- `NEXT_PUBLIC_APP_URL` is used only to build a safe internal dashboard review link.

If `RESEND_API_KEY` is missing, the notification helper returns a non-delivered result and does not call Resend.

## Helper Added

Created:

```text
lib/agency-lead-notifications.ts
```

Functions:

- `buildAgencyLeadNotificationEmail(...)`
- `sendAgencyLeadNotification(...)`

The email payload includes:

- name
- email
- company
- website
- role
- package interest
- timeline
- budget range
- submitted timestamp
- safe internal dashboard review link when `NEXT_PUBLIC_APP_URL` is configured
- truncated message excerpt

The raw oversized message is not included. Message content is truncated before being placed in the email body.

## API Behavior

Updated:

```text
app/api/agency-leads/route.ts
```

When a valid lead is stored:

1. The lead is inserted normally.
2. The route attempts to send the internal notification email.
3. Missing email config or delivery failure is logged safely.
4. The public lead submission still succeeds.

The public response remains the existing safe shape:

```json
{
  "success": true,
  "lead": {
    "id": "...",
    "status": "new"
  }
}
```

## Privacy and Security Notes

- No public confirmation email was added.
- No newsletter, CRM sync, or marketing automation was added.
- No secrets are included in the email body.
- Resend API keys are read only from environment variables.
- The Resend token is not logged.
- Invalid, spam, or rate-limited leads do not trigger notification email.
- The notification link points only to the existing internal agency lead review route.

## Files Updated

```text
app/api/agency-leads/route.ts
lib/agency-lead-notifications.ts
.env.example
.env.production.example
README.md
tests/lib/agency-lead-notifications.test.ts
tests/lib/agency-leads-route.test.ts
```

## Tests Added or Updated

Coverage includes:

- notification email payload formatting
- message excerpt truncation
- missing env behavior
- agency-specific recipient configuration
- fallback to contact email settings
- send called after valid lead creation
- no send for invalid, spam, or rate-limited submissions
- email delivery failure does not block lead creation

## Intentionally Not Built

- public lead confirmation email
- email marketing automation
- CRM sync
- client auto-creation
- analytics events
- lead routing/scoring

## Remaining Recommendations

- Configure `AGENCY_LEAD_NOTIFICATION_EMAIL` before real funnel traffic.
- Use a verified sender/domain for `AGENCY_LEAD_FROM_EMAIL`.
- Monitor Resend failures in server logs until broader operational alerting exists.
