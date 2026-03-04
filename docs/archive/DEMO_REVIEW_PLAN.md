# Demo Experience Review Plan

## 1. Scope & Assumptions
**In Scope:**
*   `/app/auth/demo/page.tsx` (Demo login screen)
*   `app/dashboard/layout.tsx` (Global demo shell, welcome modal trigger)
*   `components/demo/*` (Banner, Tour, Welcome Modal)
*   Dashboard navigation while authenticated as a demo user.

**Exclusions:**
*   Actual audio upload processing (demo accounts should be read-only).
*   Credit purchasing or stripe integration (demo accounts should bypass this).

**Prerequisites:**
*   `NEXT_PUBLIC_DEMO_PASSWORD` must be set in the local/remote `.env`.
*   A Supabase user matching `DEMO_EMAIL` (`demo@audiorepurpose.com` or similar defined in `@/lib/demo-mode`) must exist and have the correct password.
*   The demo account must have pre-populated data (at least 4 projects, including a "Premium" project named "AI Roundtable" as referenced in the tour).

---

## 2. Critical User Journeys
The following flows must be verified manually or via automated browser tests:

### Journey A: The Entry Point
1.  Navigate to the Landing Page.
2.  Click the **"Try Demo"** link.
3.  Expectation: Routes to `/auth/demo`. Logs in automatically using ENV password. Does not prompt for credentials. Transitions to `/dashboard/hub`.

### Journey B: First-Time Demo User (The Tour)
1.  Clear `localStorage` (specifically `demoWelcomeSeen` and `demoTourChapter`).
2.  Navigate to `/auth/demo`.
3.  Expectation: Upon reaching the Hub, the `WelcomeModal` appears.
4.  Expectation: Clicking "Start Tour" initializes `driver.js`. The tour steps through Hub stats -> Grid -> Filters -> Prompts to navigate to Projects.
5.  Expectation: The tour persists across page loads. Navigating to Projects automatically resumes the Projects chapter of the tour.

### Journey C: Repeat Demo User
1.  Ensure `localStorage.getItem('demoWelcomeSeen')` is set to `'1'`.
2.  Navigate to `/auth/demo` and arrive at `/dashboard/hub`.
3.  Expectation: No Welcome Modal appears. No Tour auto-starts.
4.  Expectation: A floating "🗺 Tour" button is visible in the bottom right context to manually restart the tour.

---

## 3. Functional Checks
Verify these specific technical implementation details:

*   [ ] **Auth Context:** `useAuth()` correctly identifies `isDemoMode`. The `DemoBanner` reliably renders at the top of the dashboard layout.
*   [ ] **Tour State Persistence:** `localStorage.getItem('demoTourChapter')` updates correctly when clicking "Next" on boundaries that require navigation (e.g., moving from `#projects` to `#upload`).
*   [ ] **Tour Event Wiring:** Check that `handlers.openGenerateModal` in `DemoTour.tsx` correctly fires the `demoOpenGenerateContent` CustomEvent, and that the Generate modal actually listens for this event and opens.
*   [ ] **Tour DOM Selectors:** Verify that every `[data-tour="..."]` data attribute referenced in `DemoTour.tsx` actually exists in the corresponding dashboard components (e.g., `hub-stats`, `premium-project`, `credit-balance`). *If these are missing, the tour will break.*

---

## 4. UX & Trust Checks
*   [ ] **Visibility:** The amber "Demo Account" banner (`DemoBanner.tsx`) is fixed at the top, does not scroll out of view, and doesn't obscure the main navbar.
*   [ ] **Clarity:** The Welcome Modal clearly states that this is a read-only environment using pre-processed files.
*   [ ] **Guardrails:** Actions that mutate data (Upload, Delete Project, Change Password, Buy Credits) should either be hidden or gracefully blocked (e.g., a toast saying "Action disabled in demo mode") when `isDemoMode` is true.

---

## 5. Cross-Browser & Responsive Checks
*   [ ] **Tour Positioning:** Verify `driver.js` popovers do not overflow off-screen on mobile devices (iPhone SE width).
*   [ ] **Global Layout:** The fixed coverage/upload banners in `layout.tsx` do not overlap or misalign with the `DemoBanner` on narrow viewports.
*   [ ] **Browser Support:** Tour logic relies heavily on `localStorage`. Verify behavior in Safari Incognito (which can sometimes restrict storage APIs).

---

## 6. Failure Modes to Test
*   [ ] **Missing ENV Variable:** Temporarily remove `NEXT_PUBLIC_DEMO_PASSWORD`. Navigate to `/auth/demo`.
    *   *Expected behavior:* Renders error "Demo account is not configured." and shows "Sign up for free instead →" fallback link.
*   [ ] **Invalid Supabase Creds:** Change the password in Supabase but not the `.env`.
    *   *Expected behavior:* Renders error "Unable to access the demo account."
*   [ ] **Missing DOM Element in Tour:** If a user deletes the "AI Roundtable" project, the `[data-tour="premium-project"]` selector won't exist.
    *   *Expected behavior:* The tour should gracefully skip the step or stop, rather than crashing the React tree.

---

## 7. Acceptance Criteria Check-list
Before public launch, the following must be true:
- [ ] `.env.production` has `NEXT_PUBLIC_DEMO_PASSWORD` set.
- [ ] Supabase production has the demo user seeded with the 4 required projects.
- [ ] All `data-tour` attributes are correctly placed in the production markup.
- [ ] The "Generate Content" modal opens automatically via the CustomEvent during the Projects tour chapter.
- [ ] Read-only guardrails are active (users cannot delete the seeded demo projects).
