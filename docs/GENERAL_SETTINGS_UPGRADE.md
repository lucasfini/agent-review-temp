# General Settings Upgrade Implementation Brief

## 1. Problem Summary
The current General Settings page (`app/dashboard/settings/unified-settings.tsx`) covers basic profile and password changes but lacks standard modern SaaS features such as User Preferences (timezone, locale) and Notifications management. Additionally, the Profile section does not differentiate between users who authenticated via OAuth (Google) versus standard Email/Password, allowing users to attempt edits on fields that should be managed by their identity provider.

## 2. Expected Behavior
- **Profile Section (Google Auth):** If the user logged in via Google, the Display Name and Email input fields must be auto-filled from their Google profile and set to **READ-ONLY**. (Password change section can be hidden or disabled entirely).
- **Profile Section (Email Auth):** The Display Name can be edited. The Email should remain **READ-ONLY** (as changing emails usually requires a dedicated secure flow/verification email).
- **Preferences Section:** Add a new card to manage UI/system defaults (e.g., Time zone select, Locale/Date format select, Default Output Preferences like length/style).
- **Notifications Section:** Add a new card with toggle switches for various alerts: "Processing Complete", "Processing Failed", "Low Credits", "Weekly Summary". 
- **State Persistence:** Even if backend cron jobs for notifications are not built yet, the UI must accurately reflect and save these boolean states to the database.

## 3. Data Model Updates
No new database tables are required. Consistent with how `openai_data_sharing_opt_in` is currently stored, all new preferences and notification toggles should be saved in Supabase's native `auth.users` table inside the `raw_user_meta_data` JSONB column.

**Expected `user_metadata` shape:**
```typescript
{
  full_name?: string; // (Existing from Google)
  display_name?: string; // (Custom email override)
  timezone?: string; // e.g., "America/New_York"
  locale?: string; // e.g., "en-US"
  output_preference?: string; // e.g., "concise", "detailed"
  notifications: {
    processing_complete: boolean;
    processing_failed: boolean;
    low_credits: boolean;
    weekly_summary: boolean;
  }
}
```

## 4. Backend Changes
No custom API routes are necessary for storing preferences. The Supabase JS Client (`supabase.auth.updateUser`) inside the frontend component is sufficient to safely write to `user_metadata`.

## 5. Frontend Changes
**File:** `app/dashboard/settings/unified-settings.tsx`
- **Detecting Provider:** Extract the authentication provider from the session to determine UI rules.
  ```typescript
  const providers = session?.user?.app_metadata?.providers || [];
  const isGoogleAuth = providers.includes('google');
  ```
- **Profile Card Updates:** 
  - Auto-fill `displayName` prioritizing `user.user_metadata.display_name` over `user.user_metadata.full_name`.
  - Add `disabled={isGoogleAuth || savingProfile}` to the Display Name input.
  - Add `disabled={true}` to the Email input always (add a tooltip explaining email changes require contacting support or a dedicated flow).
  - Hide the "Change Password" card entirely if `isGoogleAuth` is true.
- **New Preferences Component:** Build a `Card` containing `select` native dropdowns for Timezone, Locale, and Default Style.
- **New Notifications Component:** Build a `Card` containing toggle switches (using Shadcn UI `Switch` or custom styled checkboxes) for the 4 notification types.
- **Save Handler:** Update the existing `handleSaveProfile` to push all state variables (display name, preferences, notifications) up to Supabase via `supabase.auth.updateUser({ data: { ... } })`.

## 6. Edge Cases
- **Missing Profile Metadata:** Legacy users might not have a `notifications` object in their `user_metadata`. The UI must handle `undefined` by providing sensible defaults (e.g., all toggles `true` by default except `weekly_summary`).
- **Google vs Email Merging:** If a user logs in via Email but later links Google, ensure `user_metadata` does not destructively overwrite preferences.

## 7. Validation Steps
1. **Google Auth Test:** Log out, log in via Google. Navigate to Settings -> General. Verify Name/Email are disabled. Verify "Change Password" is hidden.
2. **Email Auth Test:** Log out, log in via Email/Password (or sign up). Navigate to Settings -> General. Verify Name is editable but Email is disabled.
3. **Preferences State:** Change the Timezone and toggle off "Weekly Summary". Click Save. Refresh the page entirely. Verify the component initializes with the toggles matching what you saved (pulled successfully from `user_metadata`).
