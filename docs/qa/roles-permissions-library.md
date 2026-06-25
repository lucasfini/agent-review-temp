# Roles, Permissions, and Library QA

## Owner

- Invite `admin`, `editor`, and `reader` from workspace settings.
- Change an `editor` to `reader`.
- Remove an `editor` and confirm shared content remains available.
- View recent audit logs in workspace settings.
- Approve and publish a Library item linked to an approval-required plan.
- Open Library version history for a shared draft.

## Admin

- Invite `editor` and `reader`.
- Attempt to invite `owner` and confirm the server rejects it.
- Attempt to invite or promote another `admin` and confirm current workspace rules.
- View recent audit logs in workspace settings.
- Approve and publish a shared Library item.
- Confirm ownership transfer controls are not available.

## Editor

- Create a Profile, Voice, and Plan.
- Generate content and save a draft to Library.
- Submit a draft for review by changing status to `in_review`.
- Attempt to set status directly to `approved` or `published` when `approval_required` is enabled and confirm rejection.
- Attempt to edit a locked shared asset and confirm rejection.
- Open version history for an editable draft.

## Reader

- View shared Profiles, Voices, and Plans.
- View a shared Library item and its generation context snapshot.
- Attempt to generate content and confirm rejection.
- Attempt to edit a Library item and confirm rejection.
- Attempt to invite a user and confirm rejection.
- Confirm private linked assets cannot be opened through a shared draft.

## Demo

- Attempt to accept a real invite and confirm rejection.
- Attempt to mutate workspace settings and confirm rejection.
- Attempt to generate content and confirm rejection.
- Attempt to save a permanent draft and confirm rejection if the flow is exposed.

## Visibility

- Create a shared draft from a private Profile or Voice and confirm only safe snapshot fields are shown.
- Confirm readers cannot open private linked Profile or Voice records from the shared draft.

## Collections

- Delete a collection that contains drafts.
- Confirm the drafts remain in Library and become `Unfiled`.

## Version History

- Edit a Library item title or body and confirm a new version row appears.
- Confirm the UI shows version history as read-only and does not offer restore.
