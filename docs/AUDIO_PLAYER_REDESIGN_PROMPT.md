# Audio Player & Transcript Sync Implementation

You are an expert Frontend Engineer and UX/UI Designer. Your task is to upgrade the audio player and conversation highlighting experience in the AudioRepurpose dashboard.

## Context
- **Project:** AudioRepurpose (Next.js App Router + Tailwind CSS)
- **Audio Delivery:** Audio files are now served via signed Cloudflare R2 URLs, not local files.
- **Current State:** The audio player is likely a basic HTML `<audio>` tag that doesn't fit the premium dark theme, and the transcript doesn't follow along with playback.

## Goals
1. Replace/restyle the default HTML `<audio>` player with a custom React audio player that perfectly matches the app's premium "Vercel/Linear dark" aesthetic.
2. Ensure the custom audio player correctly loads and streams from the provided R2 `audioUrl`.
3. Track the `currentTime` of the audio player and highlight the corresponding spoken segment in the Conversation View.
4. Ensure standard playback controls work flawlessly (Play/Pause, Seek, Mute/Volume).

## Scope & Files to Inspect
1. `app/dashboard/projects/page.tsx`
   - Review where `audioUrl` is fetched and passed down. 
   - Review how the audio player is currently rendered (likely via a `useRef` to an `<audio>` tag around line 80).
2. `components/ConversationView.tsx` (or `components/TeamsStyleTranscript.tsx`)
   - Review how transcription `segments` are rendered.
   - Look for the data structure holding `start_time` and `end_time` (or `start` / `end`) on each segment.

## Required UI Style Changes
- **Aesthetic:** Deep slate/black backgrounds (`bg-slate-900` or `bg-slate-950`), subtle borders (`border-slate-800`), crisp typography (`text-slate-200`).
- **Controls:** Use Lucide React icons (`Play`, `Pause`, `Volume1`, `Volume2`, `VolumeX`). 
- **Progress Bar:** Custom range input or clickable `div` progress bar with a vibrant accent color (e.g., `bg-blue-500` or `bg-blue-600`) for the played portion and a subtle track (`bg-slate-800`).
- **Segment Highlight:** The active transcript segment should visually stand out. 
  - Passive state: normal opacity/coloring.
  - Active state: slightly elevated background (e.g., `bg-slate-800/50`) and a subtle left-border highlight (`border-l-2 border-blue-500`).

## Data Flow & Architecture 
To avoid excessive re-renders bringing the app to a crawl during time updates, follow this architecture:
1. Maintain global audio state in the parent (`projects/page.tsx`) or a dedicated AudioContext provider, but **DO NOT** store `currentTime` in a React state variable that triggers a full page re-render 4 times a second.
2. Instead, use a `useRef<number>` for the current time, or use a customized hook that only forces re-renders on the components that specifically need to see the time (the progress bar and the transcript view).
3. **Transcript Syncing Strategy:**
   - In `ConversationView.tsx`, use a `useEffect` that listens to the `timeupdate` event of the `audioElementRef.current`.
   - On each tick, find the segment where `time >= segment.start && time <= segment.end`.
   - Keep track of the `activeSegmentIndex` in local state.
   - When `activeSegmentIndex` changes, scroll that segment smoothly into view using `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`.

## Event Listeners Required
Ensure the custom audio player attaches these listeners to the underlying hidden `<audio>` element:
- `onTimeUpdate`: update progress bar and trigger transcript sync.
- `onLoadedMetadata`: grab the total duration for the UI.
- `onEnded`: reset play state and pause.
- `onPlaying` / `onPause`: sync the Play/Pause button UI state.

## Acceptance Checklist
- [ ] A custom, dark-themed audio player is visible on the project page.
- [ ] The player successfully streams the `audioUrl` (R2 presigned URL).
- [ ] Clicking Play/Pause toggles the audio correctly.
- [ ] Clicking on the progress bar seeks to that time in the audio.
- [ ] While playing, the Conversation View automatically highlights the segment currently being spoken.
- [ ] The Conversation View automatically scrolls the active segment into the center of the viewport as playback continues.
- [ ] Performance does not degrade while audio plays (no massive React tree re-renders on every animation frame).
