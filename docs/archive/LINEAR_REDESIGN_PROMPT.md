# Analytics Cards Redesign: Linear / Vercel Dark Style

You are an expert Frontend Engineer and UI Designer. Your task is to update the Tailwind styling of the existing Analytics cards to match a premium "Linear meets Vercel dark" aesthetic.

## Scope
Modify exactly two files:
1. `components/analytics/InsightsGrid.tsx`
2. `components/analytics/GoalsSection.tsx`

## Aesthetic Direction
The goal is a sleek, quiet, premium dark mode:
- **Backgrounds:** Deep, neutral darks (e.g., `bg-slate-950` or `bg-[#0c0c0c]`). Avoid large tinted backgrounds like `bg-red-900/20`.
- **Borders:** Soft, subtle inner borders (`border-slate-800/60` or `border-white/5`).
- **Typography:** Crisp, high-contrast primary text (`text-slate-50`), soft muted secondary text (`text-slate-400`), tight tracking on small elements (`tracking-wide`).
- **Depth:** Subtle shadows (`shadow-sm`, `shadow-black/40`), glowing hover effects on borders rather than background color shifts.
- **Accents:** Use sharp, vibrant colors (blue, teal, emerald, amber, red) only for small icons, badges, or progress bars, not whole card backgrounds.

---

## 1. Updates to `InsightsGrid.tsx`

### Current Problem
The `InsightCard` uses heavy colored backgrounds (`bg-red-900/20`, `bg-amber-900/20`) which looks dated and "template-y".

### Implementation
- **Card Wrapper:** Change the base card to `bg-slate-950 border border-slate-800/60 shadow-sm`. Add a hover effect that slightly highlights the border: `hover:border-slate-700 hover:shadow-md transition-all duration-300`. Remove the conditional `bg-[color]-900/20` classes from the wrapper.
- **Header Icons:** Change the `bg-[color]-100 text-[color]-600` rounded boxes to a cleaner dark style. Example for Gap: `bg-red-500/10 text-red-500 border border-red-500/20 p-2 rounded-lg`.
- **Badges:** Update the "type" badge to match. Example: `bg-slate-900 text-slate-300 border border-slate-800 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide uppercase`.
- **Summary Text:** Make all summary text a consistent `text-slate-300 text-sm leading-relaxed`. Remove conditional colored text classes (like `text-red-300`).
- **Action Area (Bottom):** Change from a tinted box (`bg-[color]-100/50`) to a clean divider: `mt-4 pt-3 border-t border-slate-800/60 flex items-center gap-2`. Make the action text `text-xs font-medium text-slate-300 transition-colors group-hover:text-white`.
- **Paused State:** Use `opacity-60 grayscale-[50%] bg-slate-950 border-slate-800/40`.

---

## 2. Updates to `GoalsSection.tsx`

### Current Problem
The `GoalCard` relies on a highly visible left-border (`border-l-4`) and colored sub-backgrounds which break the sleek consistency.

### Implementation
- **Card Wrapper:** Remove the `border-l-4` and dynamic `typeStyle.border` classes. Use `bg-slate-950 border border-slate-800/60 shadow-sm rounded-xl hover:border-slate-700 transition-colors`.
- **Header Row:** Instead of the colored left border, use a small, vibrant dot or icon color to indicate the type. For example, keep the icon colored (`text-blue-500`) but contained within a subtle circle (`bg-blue-500/10 p-1.5 rounded-md`).
- **Badges:** Change the goal type badge from `uppercase px-1.5 py-0.5 rounded [color-bg] [color-text]` to the Vercel-style: `text-[10px] font-medium tracking-wide border px-2 py-0.5 rounded-full bg-slate-900 text-slate-300 border-slate-800`.
- **Progress Bar Components:** 
  - Update the background track: `bg-slate-900 shadow-inner`.
  - Ensure the fill uses gradients or vibrant solid colors with no borders (e.g., `bg-blue-500`, or a subtle gradient `bg-gradient-to-r from-blue-600 to-blue-400`).
- **Bottom Actions:** Make the action bar (`px-4 py-2 bg-slate-800/50...`) cleaner. Remove the distinct background color. Just use a top border: `border-t border-slate-800/60 pt-3 mt-4 px-0 flex justify-end gap-3`. Change link text to `text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors`.

---

## 3. Constraints & Rules
- **DO NOT** rewrite the component structure, map loops, or logic.
- **DO NOT** change the `interface` definitions or prop drilling.
- **DO NOT** use tables or lists. Keep the masonry and grid card layouts.
- **DO NOT** add new CSS files; rely entirely on existing Tailwind utility classes.
- **DO NOT** remove functionality like the `isPaused` overlay in the Insight card or the Progress Bar in the Goals card.

## 4. Acceptance Checklist
- [ ] No large tinted background cards remain (no `bg-red-900/20`, etc. on main wrappers).
- [ ] All cards use a consistent `bg-slate-950` or similar deep dark with soft `border-slate-800/60`.
- [ ] Vibrant colors are restricted to icons, progress bars, and specific pill borders.
- [ ] Typography employs proper hierarchy (`slate-50` for titles, `slate-400` for meta-text, `slate-300` for body).
- [ ] Layout spacing is preserved but feels cleaner due to the removal of intermediate box backgrounds.
