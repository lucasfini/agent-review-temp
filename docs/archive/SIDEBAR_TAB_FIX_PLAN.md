# Sidebar Tab Fix Plan

## Summary of Mismatches
The core inconsistency lies in how the `driver.js` tour interacting with the sidebar is configured. 
For the "good" tabs (Summary, Chapters, Takeaways, Quotes), the tour programmatically clicks the tab button to reveal the content, and then highlights the large **content panel** itself (e.g., `[data-tour="summary-panel"]`).

For the "inconsistent" tabs (Review, Insights, Speakers), the tour highlights the tiny **tab buttons** (e.g., `[data-tour="sidebar-tab-review"]`) rather than the content panels. This happens because the tour doesn't click into the tabs *before* highlighting them, so the panels don't exist in the DOM yet. 

Additionally, the Insights tab panel wrapper uses `<div className="h-full">` which lacks the generic padding (`p-3` or `p-4`) used consistently across all other tab panels.

## 1. Define the "Correct" Pattern
Used by Summary/Takeaways/Chapters/Quotes:
- **Layout structure**: An outer wrapping `<div className="p-3">` (or `p-4`) containing the panel layout.
- **Data-Tour Attribute**: Placed on the wrapper `div` (e.g., `data-tour="chapters-panel"`).
- **Highlight Behavior**: The `DemoTour.tsx` step specifically targets the `-panel` element, and the *previous* tour step's `onNextClick` handler clicks the `<button>` tab to ensure the panel renders in the DOM *before* driver.js attempts to highlight it.

## 2. Concrete Change List

### File 1: `components/demo/DemoTour.tsx`
We must update the tour steps to target the panels, and ensure the panels are opened during the transition between steps.

1.  **Add `showReview` handler:**
    In the `handlers` object (around line 470), add:
    `showReview: () => clickAndAdvance('[data-tour="sidebar-tab-review"]', 50),`
2.  **Update Step 5 (Sidebar Panel):**
    Add the `onNextClick` property to open the Review tab:
    `onNextClick: handlers.showReview,`
3.  **Update Step 6 (Review):**
    Change the `element` selector from the button to the panel:
    `- element: '[data-tour="sidebar-tab-review"]'`
    `+ element: '[data-tour="review-panel"]'`
4.  **Update Step 7 (Speakers):**
    Change the `element` selector from the button to the panel:
    `- element: '[data-tour="sidebar-tab-speakers"]'`
    `+ element: '[data-tour="speakers-panel"]'`
5.  **Update Step 10 (Insights):**
    Change the `element` selector from the button to the panel:
    `- element: '[data-tour="sidebar-tab-insights"]'`
    `+ element: '[data-tour="insights-panel"]'`

### File 2: `components/ContextSidebar.tsx`
We must align the layout wrapper for the Insights panel to match the rest.

1.  **Update Insights Container (approx. line 1035):**
    Change the wrapper classes to match the `p-3` padding convention:
    `- <div className="h-full" data-tour="insights-panel">`
    `+ <div className="p-3 h-full" data-tour="insights-panel">`

*(Note: Review and Speakers already have `<div className="p-3 ..." data-tour="review-panel">` defined, so no layout changes are needed for them; they just weren't being targeted by the tour).*

## 3. Acceptance Checklist
- [ ] The "Review" tour step highlights the entire review workflow panel, not just the tab button.
- [ ] The "Speakers" tour step highlights the speaker list panel, not just the tab button.
- [ ] The "Insights" tour step highlights the insights feed panel, not just the tab button.
- [ ] The horizontal padding/alignment of the Insights panel content perfectly matches the Summary/Chapters tabs.
- [ ] Guided tour does not crash due to missing DOM elements when transitioning between these tabs.
