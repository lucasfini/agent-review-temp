# AudioRepurpose Repo Organization Plan

You are an expert DX (Developer Experience) Engineer. Your task is to organize the AudioRepurpose repository to establish a clean, consistent structure and predictable file placement.

Currently, the repository root is cluttered with many one-off markdown files documenting past feature work, fixes, and generation progress. This clutters the root directory and makes navigation difficult.

## 1. Proposed Organization Scheme
- **`app/`**: Next.js App Router pages and layouts.
- **`components/`**: React UI components.
- **`lib/`**: Core business logic, utilities, AI pipelines, and database clients.
- **`config/`**: Configuration files (e.g., site config, constants).
- **`scripts/`**: CLI scripts, background jobs, and test runners.
- **`database/`**: SQL migrations and schema definitions.
- **`tests/`**: Unit and integration tests.
- **`public/`**: Static assets.
- **`docs/`**: Active, long-form project documentation.
- **`docs/archive/`**: Deprecated, completed, or point-in-time reference documents (generative run logs, fix summaries).
- **`/` (Root)**: Keep only core configuration files (`package.json`, `.env.*`, `next.config.ts`, `docker-compose.yml`, etc.) and the primary `README.md`.

## 2. Rules for Organization
1. **Never delete a file.** Only move or archive.
2. If a markdown file documents a past fix or a specific point-in-time generation session, move it to `docs/archive/`.
3. If a markdown file contains active architectural guidelines, setup instructions, or master prompt instructions, move it to `docs/`.
4. Keep the main `README.md` in the root.

## 3. Exact File Moves

Please run the necessary `mv` (or `git mv`) commands to relocate the following files from the root directory:

**Move to `docs/archive/` (Historical/Point-in-time records):**
- `BILLING_IMPLEMENTATION.md` -> `docs/archive/BILLING_IMPLEMENTATION.md`
- `CONTENT_GENERATION_PROGRESS_SETUP.md` -> `docs/archive/CONTENT_GENERATION_PROGRESS_SETUP.md`
- `DATABASE_CONSTRAINT_FIXES.md` -> `docs/archive/DATABASE_CONSTRAINT_FIXES.md`
- `DEMO_REVIEW_PLAN.md` -> `docs/archive/DEMO_REVIEW_PLAN.md`
- `HARD_RESET_COMPLETE.md` -> `docs/archive/HARD_RESET_COMPLETE.md`
- `INLINE_GENERATION_PROGRESS.md` -> `docs/archive/INLINE_GENERATION_PROGRESS.md`
- `LINEAR_REDESIGN_PROMPT.md` -> `docs/archive/LINEAR_REDESIGN_PROMPT.md`
- `OPENAI_KEY_OPTIN_PLAN.md` -> `docs/archive/OPENAI_KEY_OPTIN_PLAN.md`
- `PERSISTENT_GENERATION_STATE.md` -> `docs/archive/PERSISTENT_GENERATION_STATE.md`
- `PLATFORM_FIXES_SUMMARY.md` -> `docs/archive/PLATFORM_FIXES_SUMMARY.md`
- `QUICK_FIX_GENERATION_PROGRESS.md` -> `docs/archive/QUICK_FIX_GENERATION_PROGRESS.md`
- `REALTIME_FIXES.md` -> `docs/archive/REALTIME_FIXES.md`
- `SIDEBAR_TAB_FIX_PLAN.md` -> `docs/archive/SIDEBAR_TAB_FIX_PLAN.md`
- `TEST_GENERATION_FLOW.md` -> `docs/archive/TEST_GENERATION_FLOW.md`
- `URGENT_CREATE_TABLE.md` -> `docs/archive/URGENT_CREATE_TABLE.md`
- `launch-page-audit.md` -> `docs/archive/launch-page-audit.md`
- `Screenshot 2025-11-10 at 11.31.45 AM.png` -> `docs/archive/Screenshot 2025-11-10 at 11.31.45 AM.png`

**Move to `docs/` (Active reference/Architecture):**
- `COLLAB_PROMPTS.md` -> `docs/COLLAB_PROMPTS.md`
- `DEPLOYMENT.md` -> `docs/DEPLOYMENT.md`
- `MASTER_PROMPT_SYSTEM.md` -> `docs/MASTER_PROMPT_SYSTEM.md`
- `PLATFORM_THEME_METADATA.md` -> `docs/PLATFORM_THEME_METADATA.md`
- `REFINED_MASTER_PROMPT.md` -> `docs/REFINED_MASTER_PROMPT.md`

## 4. Safeguards against breakage
1. **Search for broken imports:** Run a search across the codebase (specifically in other markdown files, `package.json` scripts, or `.github/` workflows) to see if anything was hardcoding a path to the moved files.
2. **Do not move application logic:** Ensure no `.ts`, `.tsx`, or `.js` files currently in the root (like `proxy.ts`, `jest.config.js`) are moved, to prevent breaking the build system. The only exceptions are the strange timestamped `player-script.js` files (`1771954922147-player-script.js`), which should arguably also be moved to an archive or ignored directory, but verify their purpose first.

## 5. Verification Checklist
- [ ] Ensure all markdown files specified above have been moved out of the root.
- [ ] Ensure `README.md` remains in the root.
- [ ] Run `npm run build` or the equivalent build command to verify that no build scripts were broken by the file moves.
- [ ] Run `ls -1a` in the root directory and ensure the structure visually represents a clean Next.js application.
