# In-App Notifications Implementation Brief

## 1. Problem Summary
The application currently uses native browser `alert()` and `confirm()` dialogs across several key user flows (e.g., project deletion, goal archiving, export failures, and upload errors). These native dialogs disrupt the modern SaaS aesthetic, cannot be styled to match the dark theme, and block the main thread. We need to replace them with a polished, non-blocking toast notification system and a custom confirmation modal that utilizes the existing UI language (Tailwind, Lucide, and Radix/Shadcn).

## 2. Expected UX Behavior
- **Success/Failure Toasts:** Action outcomes (like "Upload failed," "Export failed," "Project deleted") should trigger a top-right or bottom-right slide-in notification. It should auto-dismiss after a few seconds.
- **Destructive Actions:** Actions like deleting a project or archiving a goal must trigger an in-app modal overlay that dims the background. The user must explicitly click "Delete" or "Cancel".
- **Visuals:** Dark UI styling, subtle borders (`border-slate-800`), standard Lucide icons (e.g., check-circle, alert-triangle).

## 3. Proposed Components
1. **Toast/Notification System:** 
   - Integrate `sonner` or shadcn `'use-toast'`. Since you already have `radix-ui` and Tailwind set up, running `npx shadcn@latest add sonner` is the cleanest approach.
   - Component: `<Toaster />` added to the root layout.
2. **Custom Confirmation Modal:**
   - Create `components/ui/confirm-modal.tsx`.
   - Built on top of the existing `components/ui/dialog.tsx` (which is already installed).
   - Props: `isOpen`, `onClose`, `onConfirm`, `title`, `description`, `confirmText`, `cancelText`, `isDestructive` (makes the confirm button red).

## 4. Data Flow
- **Toasts:** Any client component can call `import { toast } from "sonner"`. Then `toast.success("Done")` or `toast.error("Failed")` upon catch blocks.
- **Confirm Modal:** State-driven per page.
  - Page keeps `[isConfirmOpen, setIsConfirmOpen] = useState(false)` and `[pendingActionId, setPendingActionId] = useState<string | null>(null)`.
  - Clicking "Delete" sets the ID and opens the modal.
  - Clicking "Confirm" inside the modal fires the actual delete function, closes the modal, and triggers a `toast.success()`.

## 5. Files to Edit and Step-by-Step Changes

**Step 1: Install & Setup**
- Run `npx shadcn@latest add sonner` (or manually create a toast context).
- Update `app/layout.tsx` (or `app/dashboard/layout.tsx`): 
  - Import `<Toaster theme="dark" position="top-right" />` and place it at the root of the body.

**Step 2: Create `ConfirmModal`**
- Create `components/ui/confirm-modal.tsx` using your existing `<Dialog>`, `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, etc. Add buttons for Cancel and Confirm.

**Step 3: Replace Usages in Components**
- **`app/dashboard/hub/page.tsx`:** 
  - Replace `if (!confirm('Delete this project?')) return;` with the `ConfirmModal` state flow.
  - Replace `alert('Failed to delete project');` with `toast.error(...)`.
  - Add a `toast.success('Project deleted')` after successful deletion.
- **`app/dashboard/projects/page.tsx`:** 
  - Apply the exact same `ConfirmModal` state for the "Delete Project" button (around line 1040).
  - Replace export failure `alert` with `toast.error()`.
- **`app/dashboard/analytics/page.tsx`:** 
  - Replace the goal archive `confirm()` and `alert()` with `ConfirmModal` and `toast`.
- **`app/dashboard/upload/page.tsx`:** 
  - The UI currently says `{/* Inline delete confirmation — replaces native confirm() dialog */}`. Standardize this by using the shared `ConfirmModal` component if applicable, or keep the inline but replace the oversized file `alert` logic with `toast.error()`.
- **`app/debug/process-payments/page.tsx`:** 
  - Replace standard `alert` calls with `toast()`.

## 6. Edge Cases
- **Multiple Toasts:** `sonner` handles stacking automatically gracefully.
- **Async Confirmations:** The "Confirm" button in the modal should accept an asynchronous `onConfirm` and display a loading spinner (`Loader2` from Lucide) to prevent double-clicks while network requests are pending.
- **Error Fallback:** If the network request fails, the modal should handle the error, stay open (or close and show an error toast), and stop the spinner.

## 7. Validation Steps
1. **Upload Error:** Try uploading a file larger than the maximum limit and verify a toast appears instead of an alert.
2. **Project Deletion:** Navigate to the Hub, click delete on a test project. A styled modal should appear. Click cancel—nothing happens. Click delete—button spins, modal closes, toast appears, project disappears.
3. **Goal Archive:** Navigate to Analytics and attempt to archive a goal. Verify the modal and success toast.
