# Audio Follow-Along Implementation Plan

## 1. Root Cause Analysis of Current Audio Issues
Currently, the audio player is unreliable due to a combination of missing configuration and architectural quirks:
- **R2 CORS & Range Requests**: Cloudflare R2 buckets do not enable CORS by default. Without a proper CORS policy allowing `GET` and `HEAD` methods along with `Range` headers, browsers (especially Safari) will fail to seek or seamlessly stream audio files via standard `<audio>` elements.
- **Error Swallowing**: In `AudioPlayer.tsx`, `audio.play().catch(() => undefined);` silently swallows `NotAllowedError` (autoplay blocks) and `NotSupportedError` (CORS/format issues), masking the real reasons playback fails.
- **Component Lifecycle & Ref Wiring**: The hidden `<audio>` element is rendered inside `AudioPlayer.tsx` but its `ref` (`audioElementRef`) is passed down from the massive `page.tsx` component. This can lead to race conditions where the `useEffect` attaching event listeners in `ConversationView.tsx` or `AudioPlayer.tsx` runs before the `ref.current` is fully hydrated, or detaches listeners unnecessarily on re-renders.

## 2. Files to Edit
1. `components/AudioPlayer.tsx` (Major redesign)
2. `components/ConversationView.tsx` (Active segment styling & interaction)
3. `app/dashboard/projects/page.tsx` (Ref wiring cleanup)
4. *External Action Required*: Cloudflare R2 CORS Configuration via CLI/Dashboard.

## 3. UI/UX Behavior Spec
**Aesthetic Direction**: "Apple Podcasts meets Linear dark"

### **A. Static Waveform Bar (Visual Timeline)**
- Replace the current solid blue progress bar with a series of vertical bars simulating a waveform.
- Since we aren't decoding the audio to get true peaks (for performance), we will generate a deterministic pseudo-random array of bar heights based on the `src` string or duration, creating a static, purely visual waveform.
- Unplayed portion: `bg-slate-700/50`.
- Played portion: `bg-blue-500` or a gradient `bg-gradient-to-r from-blue-500 to-indigo-400`.

### **B. Hover Scrubbing & Timestamp Tooltip**
- When the user hovers over the waveform, capture the murine `clientX` to determine the corresponding timestamp.
- **Tooltip Styling** (Strict Requirements):
  - Small rounded pill with subtle blur: `backdrop-blur-md rounded-full`
  - Background: `bg-slate-900/90`
  - Border: `border border-slate-700/80`
  - Text: `text-[11px] font-medium text-slate-200`
  - Padding: `px-2 py-1`
  - Shadow: `shadow-md shadow-black/40`
  - Position: Above cursor with a slight offset, centered horizontally (`transform: translateX(-50%)`).
  - Pointer: `pointer-events-none` so it doesn't block the click to seek.

### **C. Playback Chip (Now Playing Pill)**
- A sleek floating or inline pill next to the player controls showing: `Speed (1x) • CurrentTime / Duration`.
- Interactive: Clicking speed toggles `1x -> 1.2x -> 1.5x -> 2x`.

### **D. Transcript Follow-Along (premium feel)**
- **Active Segment Highlight**: The current speaking segment in `ConversationView.tsx` should gently transition to a highlighted state (e.g., `bg-blue-900/10 border-l-2 border-blue-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]`).
- **Auto-scroll with Override**: 
  - As the audio progresses, sync `activeSegmentIndex`.
  - Use smooth scrolling (`behavior: 'smooth', block: 'center'`) to keep the active segment in view.
  - *Override logic*: If the user manually scrolls the transcript container, disable auto-scroll. Show a small "Resume Auto-scroll" floating button. Re-enable if they click the button or click a new segment to play from.

## 4. Concrete Implementation Steps

### Step 1: Fix Cloudflare R2 CORS (Instructions for User)
Ensure the R2 bucket has the following CORS policy applied:
```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "Authorization", "Content-Type"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges"]
  }
]
```
*(Optionally explicitly set `crossOrigin="anonymous"` on the `<audio>` tag if needed).*

### Step 2: Redesign `AudioPlayer.tsx`
- Remove the old `progressFillRef` slider.
- Implement the `<Waveform />` exact component. Use ~100 vertical `div` bars. Use inline styles for heights mapping `Math.sin` or a seeded random to create an aesthetically pleasing envelope.
- Implement mouse movement tracking on the waveform container to calculate `hoverTime` and `hoverX`. Render the tooltip conditionally conditionally based on `isHovering`.
- Add the playback chip UI replacing the basic text duration. Include a rate toggle button.
- Make sure to handle play promise rejection properly and display a graceful UI error toast or state if R2 blocks it.

### Step 3: Enhance `ConversationView.tsx` Transcript Sync
- Add an `isUserScrolling` ref to detect manual wheel/touch events on the transcript container.
- Update the `useEffect` listening to `audio.timeupdate`:
  ```typescript
  if (!isUserScrolling.current) {
    document.getElementById(`segment-${found}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  ```
- Enhance the individual segment rendering loop to apply `transition-all duration-300` and the active styling if `index === activeSegmentIndex`.
- Allow clicking any segment text to instantly seek the audio to `segment.startTime` and start playing.

### Step 4: Cleanup Refs across `page.tsx`
- Ensure `audioElementRef` stability.
- Pass a `seekTo` or `playSegment` function securely down so that `<ConversationView>` can control the player without depending entirely on raw `audio.currentTime` modifications where possible, or stick to the `useImperativeHandle` / raw ref approach but ensure null checks are robust.

## 5. Acceptance Criteria & Test Checklist
- [ ] **R2 Audio Loads**: Audio plays successfully without CORS or NotSupportedError. Range requests work (can jump to the end of a 2-hour file instantly).
- [ ] **Waveform Renders**: A sleek, dark-mode friendly static waveform is visible.
- [ ] **Hover Tooltip**: Moving the mouse over the waveform shows the exact timestamp floating above the cursor with the precise css specs provided.
- [ ] **Follow-along Sync**: Hitting play automatically begins highlighting the correct segment in the transcript.
- [ ] **Auto-scroll & Override**: The transcript scrolls down automatically. Scrolling via mouse wheel temporarily disables auto-scroll. 
- [ ] **Click to Jump**: Clicking a transcript segment instantly jumps the audio and playback resumes seamlessly from that word/segment.
- [ ] **Aesthetics**: UI feels snappy, "Apple Podcasts meets Linear", no janky borders, smooth transitions on play/pause and highlights.
