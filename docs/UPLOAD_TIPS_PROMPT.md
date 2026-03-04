# Upload Page Tips Update Prompt

You are an expert Frontend Engineer and UX Writer. Your task is to update the "Tips for Best Results" section on the Upload page to include two new, highly relevant tips regarding AI limitations and audio quality.

## Scope
Modify exactly one file:
`app/dashboard/upload/page.tsx`

## Current UI Context
Around line **943**, there is a `<div className="grid grid-cols-3 gap-4">` containing three tips:
1. Speaker Count
2. Naming
3. Audio Quality

## The Goal
We need to add two *new* tips to this grid. Because the grid will now have 5 items in a 3-column layout, we must adjust the grid column structure so it wraps elegantly (e.g., `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`).

### New Tip 1: Spoken Names
**Context:** AI cannot infer names that are never said out loud.
**Title:** Spoken Names
**Body:** The AI can only identify speakers by name if they are explicitly introduced or addressed in the recording. 
**Icon:** Use `UserCircle` or `MessageSquare` (import from `lucide-react`).

### New Tip 2: Clear Turn-Taking
**Context:** Overlapping/chaotic conversation ruins diarization.
**Title:** Clear Turn-Taking
**Body:** Avoid talking over one another. Overlapping speech significantly reduces the AI's ability to accurately separate speakers.
**Icon:** Use `ListChecks` or `MoreHorizontal` (import from `lucide-react`).

## Implementation Steps

### 1. Update Imports
Ensure you import the new icons at the top of the file:
```typescript
import { /* ... existing ... */ UserCircle, MoreHorizontal } from 'lucide-react';
```

### 2. Update Grid Layout
Locate the container for the tips (around line 943):
```tsx
// BEFORE
<div className="grid grid-cols-3 gap-4">

// AFTER (Make it responsive to handle 5 items gracefully)
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
```

### 3. Insert New Tips
Add the two new tip blocks inside the grid container, matching the exact DOM structure and Tailwind classes of the existing tips:

```tsx
{/* New Tip: Spoken Names */}
<div className="flex gap-2.5">
  <UserCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
  <div>
    <p className="text-xs font-semibold text-slate-300 mb-0.5">Spoken Names</p>
    <p className="text-xs text-slate-400 leading-relaxed">The AI can only identify speakers by name if they are explicitly introduced or addressed in the recording.</p>
  </div>
</div>

{/* New Tip: Clear Turn-Taking */}
<div className="flex gap-2.5">
  <MoreHorizontal className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
  <div>
    <p className="text-xs font-semibold text-slate-300 mb-0.5">Clear Turn-Taking</p>
    <p className="text-xs text-slate-400 leading-relaxed">Avoid talking over one another. Overlapping speech significantly reduces the AI's ability to accurately separate speakers.</p>
  </div>
</div>
```

## Acceptance Checklist
- [ ] 5 tips total are visible in the "Tips for Best Results" section.
- [ ] Grid layout uses responsive column counts (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) to prevent squishing 5 items into 3 columns.
- [ ] The wording matches the provided copy exactly.
- [ ] Icons are properly imported from `lucide-react`.
- [ ] The tone and styling perfectly match the existing SaaS dark mode UI (using `text-blue-400`, `text-slate-300`, `text-slate-400`).
