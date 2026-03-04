# Loading Placeholders Implementation Plan

## 1. Scope & Objective
Eliminate "blank page" moments during route changes, login, and data fetches by introducing Next.js App Router `loading.tsx` files and a reusable `Skeleton` component that matches the dark UI aesthetic of the AudioRepurpose app.

## 2. Reusable Skeleton Component Spec
**File:** `components/ui/skeleton.tsx`
Create a simple, lightweight Tailwind-based wrapper component.
```tsx
import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-800/50", className)}
      {...props}
    />
  )
}

export { Skeleton }
```
*Note: We use standard Tailwind `animate-pulse` with a `bg-slate-800/50` to match the dark aesthetic without pulling in heavy animation libraries.*

## 3. Full-Page Loading Overlay Spec
**Intended Use:** For auth flows (`app/auth/loading.tsx`) and the root dashboard transition (`app/dashboard/loading.tsx`) where a full-page replace is necessary.
**Behavior:** 
- Appears instantly (with a very subtle 150ms fade-in to avoid flashing if the load is instant).
- Disappears native to Next.js suspense resolution.
- Does not block user interaction until it absolutely has to, though standard `loading.tsx` covers the viewport.

**Component API structure for `OverlayLoader`:**
```tsx
export function FullPageLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A] animate-in fade-in duration-200">
      <div className="flex flex-col items-center gap-4">
        {/* Replace with your brand logo/icon if desired */}
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
        <p className="text-sm font-medium text-slate-400">Loading...</p>
      </div>
    </div>
  )
}
```

## 4. Pages to Update & Skeleton Placements
We will drop a `loading.tsx` file in each of these route segments. Each file should export a default function that returns the appropriately structured skeleton layout.

1. **`app/auth/loading.tsx`**
   - Renders the `FullPageLoader` component to gracefully handle pre-login/callback transitions.

2. **`app/dashboard/loading.tsx`**
   - Renders the dashboard shell skeleton: Sidebar placeholder on the left, top header placeholder, and a generic content area skeleton.

3. **`app/dashboard/hub/loading.tsx`**
   - Renders skeletons for the daily metric cards (e.g., `<Skeleton className="h-32 w-full" />` repeating 3-4 times in a grid).
   - Renders a larger skeleton block for the recent activity feed.

4. **`app/dashboard/projects/loading.tsx`**
   - Left sidebar (Project list): `<Skeleton className="h-12 w-full mb-2" />` repeated ~10 times.
   - Main content area: A large `<Skeleton className="h-full w-full rounded-xl" />` or a structural mockup of the audio player and transcript view.

5. **`app/dashboard/upload/loading.tsx`**
   - Central drag-and-drop zone skeleton: `<Skeleton className="h-[400px] w-full max-w-2xl rounded-2xl border border-dashed border-slate-700" />`.

6. **`app/dashboard/analytics/loading.tsx`**
   - Chart placeholders: Large rectangular skeletons matching the dimensions of the insights/coverage graphs.

7. **`app/dashboard/settings/loading.tsx`**
   - Form field skeletons: Repeated `<Skeleton className="h-10 w-full mb-4" />` with small label skeletons above them.

## 5. Acceptance Checklist
- [ ] `Skeleton` component created in `components/ui/skeleton.tsx`.
- [ ] `loading.tsx` added to `app/auth`, `app/dashboard`, and all major `app/dashboard/*` sub-routes.
- [ ] Skeletons perfectly match the dark dashboard aesthetics (no glaring white flashes).
- [ ] `layout.tsx` shifts are non-existent or minimal because skeleton dimensions match the final rendered content.
- [ ] Navigation feels significantly faster and snappier due to instant feedback.
- [ ] Uses only lightweight Tailwind CSS classes (no Framer Motion or heavy JS).
