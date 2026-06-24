# Phase 8E: Email Deliverability and Lead Notification QA

Phase 8E verifies that public agency lead notification and confirmation emails are ready for production without adding newsletters, drip campaigns, CRM sync, or marketing automation.

Status: Ready for staging email deliverability testing after code review.

## Summary

The agency lead email flow is production-oriented:
- `POST /api/agency-leads` creates the lead before attempting any email sends.
- Internal notification and public confirmation emails are attempted independently.
- Email failures are logged and do not lose the submitted lead.
- The internal notification contains a bounded lead summary, not the raw request payload.
- The public confirmation does not imply account creation, dashboard access, or a client portal.
- Resend is optional locally but required for production launch email delivery.

No real Resend keys, mailbox credentials, or customer data were added.

## Required Environment

Production email delivery requires:

```text
RESEND_API_KEY
AGENCY_LEAD_FROM_EMAIL
AGENCY_LEAD_NOTIFICATION_EMAIL
NEXT_PUBLIC_APP_URL
```

Related production lead ownership config:

```text
AGENCY_LEAD_ORGANIZATION_ID
```

Fallback email settings:

```text
CONTACT_FROM_EMAIL
CONTACT_TO_EMAIL
```

Rules:
- `RESEND_API_KEY` must be configured only in the deployment environment.
- `AGENCY_LEAD_FROM_EMAIL` must be an address on a verified sending domain.
- `AGENCY_LEAD_NOTIFICATION_EMAIL` may contain one or more comma-separated internal recipients.
- `NEXT_PUBLIC_APP_URL` must be the canonical HTTPS production app URL so email links resolve to the right host.
- `CONTACT_FROM_EMAIL` and `CONTACT_TO_EMAIL` remain fallback values, but production should set agency-specific values explicitly.
- Never commit Resend API keys, mailbox credentials, lead data exports, or internal recipient lists that are not meant to be public.

## Sender and Domain Verification

Before production launch:
1. Verify the sending domain in Resend.
2. Confirm DNS records are active for SPF and DKIM.
3. Configure a DMARC policy appropriate for the domain.
4. Send a test email from `AGENCY_LEAD_FROM_EMAIL`.
5. Confirm the message passes SPF, DKIM, and DMARC in the received headers.
6. Confirm the sender display name and address match the intended agency brand.
7. Confirm replies to internal lead notifications go to the submitter email through `reply_to`, while the actual sender remains the verified agency sender.

Launch blocker:
- Any production sender address that is not verified in Resend.

## Internal Notification QA

Flow:

```text
POST /api/agency-leads
sendAgencyLeadNotification(lead)
Resend /emails
```

Expected behavior:
- Sends to `AGENCY_LEAD_NOTIFICATION_EMAIL`.
- Uses `AGENCY_LEAD_FROM_EMAIL` as the sender.
- Sets `reply_to` to the lead submitter email.
- Includes a safe summary:
  - name
  - email
  - company
  - website
  - role
  - package interest
  - timeline
  - budget range
  - submitted timestamp
  - dashboard review link when `NEXT_PUBLIC_APP_URL` is configured
- Includes only a bounded message excerpt.
- Escapes lead-controlled values in HTML output.
- Does not include raw metadata, service-role details, request headers, IP addresses, API keys, or full unbounded payloads.

Manual test:
1. Configure staging `RESEND_API_KEY`, `AGENCY_LEAD_FROM_EMAIL`, `AGENCY_LEAD_NOTIFICATION_EMAIL`, and `NEXT_PUBLIC_APP_URL`.
2. Submit a public agency inquiry with normal values.
3. Confirm exactly one internal notification arrives.
4. Confirm the notification goes only to the configured internal recipient list.
5. Confirm reply action targets the submitter email.
6. Confirm the dashboard review link points to `/dashboard/agency/leads` on the staging app host.
7. Submit a lead with a long message and confirm the message is truncated.
8. Submit a lead containing HTML-like text and confirm the received HTML email renders it as text.

Launch blockers:
- Internal notification not delivered in staging.
- Internal notification includes secrets, tokens, raw request payloads, or unbounded lead text.
- Internal notification points reviewers to the wrong app host.

## Public Confirmation QA

Flow:

```text
POST /api/agency-leads
sendAgencyLeadConfirmationEmail(lead)
Resend /emails
```

Expected behavior:
- Sends to the lead submitter email.
- Uses the verified agency sender.
- Does not set `reply_to` to an internal inbox.
- Confirms receipt only.
- Does not include internal notes, dashboard links, lead IDs, organization IDs, or routing metadata.
- Does not imply that an account, dashboard, workspace, subscription, or client portal was created.
- Links only to the public agency site when `NEXT_PUBLIC_APP_URL` is configured.

Manual test:
1. Submit a staging public agency inquiry using an email inbox you control.
2. Confirm exactly one public confirmation arrives.
3. Confirm the message says the inquiry was received.
4. Confirm the message does not mention dashboard access, login, account setup, subscriptions, or client portal access.
5. Confirm any public agency link points to `/agency` on the staging app host.
6. Confirm lead-specific internal fields are absent from the email body.

Launch blockers:
- Confirmation email includes internal review links or IDs.
- Confirmation copy implies account creation or client portal access.
- Confirmation is not delivered in staging after Resend is configured.

## Failure Behavior

Current route behavior is intentionally tolerant after the lead is created:
- If funnel event tracking fails, the lead submission still succeeds.
- If internal notification delivery fails, the lead submission still succeeds.
- If public confirmation delivery fails, the lead submission still succeeds.
- Email failures are logged server-side with safe messages.

Expected public response:

```text
201 Created
success: true
lead.id
lead.status
```

This is required because email delivery must not be the source of truth for agency lead capture.

Launch blocker:
- Any email delivery failure that prevents a valid lead from being stored.

## Local, Staging, and Production Differences

Local:
- `RESEND_API_KEY` may be empty.
- Email helper returns a skipped result when Resend is not configured.
- Tests should not call the real Resend API.

Staging:
- Use a Resend test or staging domain when available.
- Use staging recipient inboxes for `AGENCY_LEAD_NOTIFICATION_EMAIL`.
- Run full manual notification and confirmation tests before launch.

Production:
- Use the verified production sender domain.
- Use the real internal recipient list.
- Keep the Resend API key only in production environment configuration.
- Confirm DNS and deliverability before opening the public funnel to real traffic.

## Launch Checklist

Before launch:
- [ ] `RESEND_API_KEY` is configured in production environment variables.
- [ ] `AGENCY_LEAD_FROM_EMAIL` is a verified Resend sender.
- [ ] `AGENCY_LEAD_NOTIFICATION_EMAIL` points to the intended agency recipient list.
- [ ] `NEXT_PUBLIC_APP_URL` is the canonical HTTPS production URL.
- [ ] Resend domain DNS verification passes.
- [ ] SPF, DKIM, and DMARC pass on a received test message.
- [ ] Internal notification arrives with safe lead summary only.
- [ ] Public confirmation arrives with receipt-only copy.
- [ ] Email failure does not prevent lead creation in staging.
- [ ] No real secrets are present in repo files or test fixtures.

## Validation

Run:

```bash
npx jest tests/lib/agency-lead-notifications.test.ts tests/lib/agency-leads-route.test.ts tests/scripts/phase-8e-email-deliverability-qa.test.js --runInBand
npx tsc --noEmit
npm run -s lint
git diff --check
```

## Review Findings

Code review confirmed:
- Email config comes from environment variables and uses agency-specific values when present.
- Internal notifications set `reply_to` to the lead email.
- Public confirmations do not expose dashboard links.
- Lead creation is not rolled back by notification or confirmation failures.
- Existing route behavior remains unchanged.

Known limitation:
- Live deliverability cannot be proven locally. Staging must verify actual Resend sender, DNS, inbox placement, and received message headers.
