# Progress Tracking Feature Guide

> Note: this guide describes the progress-tracking UX and backend stages. For current deployment and provider configuration, use the production docs first.

## Overview

Your AudioRepurpose application now has **granular progress tracking** that shows real-time status updates during the entire transcription pipeline:

1. ✅ **Uploading** - Audio file upload
2. ✅ **Transcribing** - Speech-to-text conversion
3. ✅ **Diarization** - Speaker detection
4. ✅ **Role Assigning** - AI speaker naming + role classification
5. ✅ **Finalizing** - Persisting speaker data & metadata
6. ✅ **Completed** - Ready for content generation

---

## Features Implemented

### Backend Progress Tracking

**New Database Columns:**
- `processing_stage` - Current stage (uploading, transcribing, etc.)
- `processing_progress` - Progress percentage (0-100) for current stage
- `processing_message` - Human-readable status message
- `stage_started_at` - Timestamp when current stage started

**Progress Stages:**
| Stage | Description | Approx. Duration |
|-------|-------------|------------------|
| `pending` | Project created, not started | 0s |
| `uploading` | File upload in progress | 5-30s |
| `transcribing` | Audio transcription | 30s-2min |
| `diarization` | Speaker detection | 1-3min |
| `role_assignment` | AI naming + role assignment | 10-30s |
| `finalizing` | Persisting speaker data | 5-15s |
| `completed` | All processing done | - |
| `failed` | Processing error occurred | - |

### API Updates

**Upload API** (`/api/upload/route.ts`):
- Sets initial stage to `uploading` on project creation
- Updates to `transcribing` after upload completes

**Transcribe API** (`/api/transcribe/route.ts`):
- Updates progress at each major stage:
  - `transcribing` → `diarization` → `role_assignment` → `finalizing` → `completed`

**Status API** (`/api/projects/[id]/status`):
- Returns new fields:
  - `processing_stage`
  - `processing_progress`
  - `processing_message`
  - `stage_started_at`

### UI Component

**`ProgressTracker.tsx`** - Beautiful progress visualization component

Features:
- Real-time progress updates (polls every 2 seconds)
- Visual progress bar with percentage
- Stage-by-stage breakdown with icons
- Animated loading spinners
- Success/error states
- Responsive design

---

## Database Migration

### Apply Migration

```bash
# Open Supabase dashboard → SQL Editor
# Run: database-progress-tracking.sql
```

**Migration Contents:**
```sql
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS processing_stage TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS processing_message TEXT,
ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_processing_stage
ON projects (processing_stage);
```

---

## How to Use

### Option 1: Use ProgressTracker Component

Add to your upload page (e.g., `app/dashboard/upload/page.tsx` or project detail page):

```tsx
import ProgressTracker from '@/components/ProgressTracker';

export default function UploadPage() {
  const [projectId, setProjectId] = useState<string | null>(null);

  return (
    <div>
      {/* Your upload form */}
      <UploadForm onUploadSuccess={(id) => setProjectId(id)} />

      {/* Show progress tracker after upload */}
      {projectId && (
        <ProgressTracker
          projectId={projectId}
          onComplete={() => {
            console.log('Processing complete!');
            // Navigate to project page or show success message
          }}
          pollInterval={2000} // Poll every 2 seconds
          className="mt-6"
        />
      )}
    </div>
  );
}
```

### Option 2: Manual Polling

Poll the status API directly:

```tsx
const checkProgress = async (projectId: string) => {
  const response = await fetch(`/api/projects/${projectId}/status`);
  const data = await response.json();

  console.log('Current stage:', data.processing_stage);
  console.log('Progress:', data.processing_progress + '%');
  console.log('Message:', data.processing_message);

  return data;
};

// Poll every 2 seconds
useEffect(() => {
  const interval = setInterval(async () => {
    const status = await checkProgress(projectId);

    if (status.status === 'completed' || status.status === 'failed') {
      clearInterval(interval);
    }
  }, 2000);

  return () => clearInterval(interval);
}, [projectId]);
```

---

## Progress Calculation

### Stage Weights

Overall progress is calculated based on estimated time distribution:

```typescript
const STAGE_WEIGHTS = {
  uploading:         0% →  10%   (10% of total)
  transcribing:     10% →  55%   (45% of total)
  diarization:      55% →  80%   (25% of total)
  role_assignment:  80% →  90%   (10% of total)
  finalizing:       90% → 100%   (10% of total)
};
```

**Example:**
- Stage: `transcribing`
- Stage Progress: 50%
- Overall Progress: 10% + (50% × 40%) = **30%**

### Formula

```typescript
overallProgress = stageStart + (stageProgress / 100) * (stageEnd - stageStart)
```

---

## API Response Examples

### Status During Processing

```json
{
  "status": "processing",
  "processing_stage": "diarization",
  "processing_progress": 45,
  "processing_message": "Analyzing audio for speaker detection...",
  "stage_started_at": "2025-01-09T10:15:30.000Z",
  "progress": 65,
  "transcription_text": null,
  "created_at": "2025-01-09T10:10:00.000Z"
}
```

### Status When Complete

```json
{
  "status": "completed",
  "processing_stage": "completed",
  "processing_progress": 100,
  "processing_message": "Processing complete! Ready to generate content.",
  "stage_started_at": "2025-01-09T10:18:00.000Z",
  "progress": 100,
  "transcription_text": "Full transcript here...",
  "processing_time": 480,
  "outputs_generated": 0,
  "created_at": "2025-01-09T10:10:00.000Z",
  "updated_at": "2025-01-09T10:18:00.000Z"
}
```

### Status When Failed

```json
{
  "status": "failed",
  "processing_stage": "failed",
  "processing_progress": 0,
  "processing_message": "Transcription failed: API error",
  "stage_started_at": "2025-01-09T10:15:30.000Z",
  "progress": 0
}
```

---

## ProgressTracker Component Props

```typescript
interface ProgressTrackerProps {
  projectId: string;           // Required: Project ID to track
  onComplete?: () => void;     // Optional: Callback when processing completes
  pollInterval?: number;       // Optional: Polling interval in ms (default: 2000)
  className?: string;          // Optional: Additional CSS classes
}
```

**Usage Examples:**

```tsx
// Basic usage
<ProgressTracker projectId={projectId} />

// With completion callback
<ProgressTracker
  projectId={projectId}
  onComplete={() => router.push(`/projects/${projectId}`)}
/>

// Custom poll interval (faster updates)
<ProgressTracker
  projectId={projectId}
  pollInterval={1000}
/>

// With custom styling
<ProgressTracker
  projectId={projectId}
  className="mt-6 shadow-lg"
/>
```

---

## Visual States

### 1. **Processing State**

```
┌─────────────────────────────────────┐
│ 🔄 Processing Audio          65%    │
│ ████████████████░░░░░░░░░░░░░░░░   │
│                                     │
│ ✓ Uploading                         │
│ ✓ Transcribing                      │
│ 🔄 Speaker Detection           45%  │
│   Name Extraction                   │
│   Keyword Rules                     │
└─────────────────────────────────────┘
```

### 2. **Complete State**

```
┌─────────────────────────────────────┐
│ ✅ Processing Complete!             │
│ Ready to generate content           │
└─────────────────────────────────────┘
```

### 3. **Failed State**

```
┌─────────────────────────────────────┐
│ ❌ Processing Failed                │
│ Transcription failed: API error     │
└─────────────────────────────────────┘
```

---

## Progress Flow

### AssemblyAI Pipeline (Fast - Cloud)

```
1. Upload                 →  0-10%
2. Transcribing          → 10-50%
   (AssemblyAI does transcription + diarization together)
3. Name Extraction       → 80-90%
4. Keyword Detection     → 90-100%
5. Completed             → 100%

Total Time: ~2-3 minutes for 2-hour podcast
```

The older local Whisper/PyAnnote pipeline notes have been intentionally removed from this guide because they are no longer the runtime source of truth.

---

## Troubleshooting

### Progress Stuck at One Stage

**Symptom:** Progress stays at same stage for too long

**Causes:**
1. Server restart during processing
2. Background process failed silently
3. Database update error

**Solutions:**
1. Check server logs for errors
2. Verify project status in database
3. Retry transcription if stuck

**Debug Query:**
```sql
SELECT
  id, title, status,
  processing_stage, processing_progress,
  processing_message, stage_started_at
FROM projects
WHERE id = 'your-project-id';
```

### Progress Not Updating in UI

**Symptom:** Component shows "Loading progress..." indefinitely

**Causes:**
1. Project ID invalid
2. API endpoint error
3. Network issue

**Solutions:**
1. Check browser console for errors
2. Verify `/api/projects/[id]/status` endpoint works
3. Check network tab for failed requests

### Stage Skipped

**Symptom:** Some stages don't appear

**Reason:** Different pipelines skip certain stages:
- AssemblyAI skips separate `diarization` stage (does it during transcription)
- Role assignment runs even without manual presets—no keyword setup required

**Expected Behavior:** This is normal!

---

## Performance Considerations

### Polling Frequency

**Default:** 2000ms (2 seconds)

**Recommendations:**
- **2-3 seconds**: Good balance (default)
- **1 second**: Faster updates, more API calls
- **5 seconds**: Reduced load, slower updates

**Impact:**
- 2-second polling: 30 API calls per minute
- 5-second polling: 12 API calls per minute

### Database Load

Progress updates use simple UPDATE queries:
```sql
UPDATE projects
SET
  processing_stage = 'diarization',
  processing_progress = 45,
  processing_message = 'Analyzing audio...',
  stage_started_at = NOW()
WHERE id = $1;
```

**Performance:** ~5-10ms per update
**Impact:** Negligible (only during active processing)

---

## Analytics & Monitoring

### Track Processing Times

Query average stage durations:

```sql
SELECT
  processing_stage,
  COUNT(*) as total_projects,
  AVG(EXTRACT(EPOCH FROM (updated_at - stage_started_at))) as avg_duration_seconds,
  MIN(EXTRACT(EPOCH FROM (updated_at - stage_started_at))) as min_duration_seconds,
  MAX(EXTRACT(EPOCH FROM (updated_at - stage_started_at))) as max_duration_seconds
FROM projects
WHERE status = 'completed'
  AND processing_stage != 'completed'
GROUP BY processing_stage
ORDER BY avg_duration_seconds DESC;
```

### Track Success Rate

```sql
SELECT
  status,
  processing_stage,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM projects
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status, processing_stage
ORDER BY count DESC;
```

### Find Stuck Projects

```sql
SELECT
  id, title, status, processing_stage,
  stage_started_at,
  EXTRACT(EPOCH FROM (NOW() - stage_started_at)) / 60 as minutes_stuck
FROM projects
WHERE status IN ('processing', 'uploading')
  AND stage_started_at < NOW() - INTERVAL '30 minutes'
ORDER BY stage_started_at ASC;
```

---

## Advanced Customization

### Custom Progress Messages

Modify `lib/progress-tracker.ts`:

```typescript
const STAGE_LABELS: Record<ProcessingStage, string> = {
  uploading: 'Uploading your podcast...',
  transcribing: 'Converting speech to text...',
  diarization: 'Identifying speakers in the audio...',
  role_assignment: 'Naming speakers & assigning roles...',
  finalizing: 'Finalizing project data...',
  completed: 'All done! 🎉',
  failed: 'Oops, something went wrong'
};
```

### Custom Stage Weights

Adjust overall progress calculation:

```typescript
// In lib/progress-tracker.ts
const STAGE_WEIGHTS: Record<ProcessingStage, { start: number; end: number }> = {
  uploading: { start: 0, end: 20 },      // Increased from 10
  transcribing: { start: 20, end: 60 },  // More weight to transcription
  diarization: { start: 60, end: 85 },
  role_assignment: { start: 85, end: 95 },
  finalizing: { start: 95, end: 100 }
};
```

### Add More Stages

1. **Define new stage:**
```typescript
// In lib/progress-tracker.ts
export type ProcessingStage =
  | 'uploading'
  | 'transcribing'
  | 'diarization'
  | 'role_assignment'
  | 'finalizing'
  | 'content_generation'  // NEW
  | 'completed'
  | 'failed';
```

2. **Update weights:**
```typescript
const STAGE_WEIGHTS = {
  // ... existing stages
  content_generation: { start: 95, end: 100 }
};
```

3. **Add to ProgressTracker component:**
```typescript
const STAGES = [
  // ... existing stages
  { id: 'content_generation', label: 'Generating Content', icon: Sparkles }
];
```

---

## Testing

### Manual Test Flow

1. **Upload a podcast:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@podcast.mp3" \
  -F "title=Test Podcast"
```

2. **Poll status:**
```bash
watch -n 2 'curl -s http://localhost:3000/api/projects/PROJECT_ID/status | jq ".processing_stage, .processing_progress, .processing_message"'
```

3. **Expected output:**
```
"uploading"
0
"Uploading audio file..."

→ (2-10 seconds later)

"transcribing"
25
"Transcribing audio..."

→ (30-60 seconds later)

"diarization"
60
"Analyzing audio for speaker detection..."

→ (continues through all stages)

"completed"
100
"Processing complete! Ready to generate content."
```

---

## Integration Examples

### Example 1: Show Progress in Upload Modal

```tsx
function UploadModal() {
  const [uploading, setUploading] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    setProjectId(data.projectId);
  };

  return (
    <Modal>
      {!projectId ? (
        <UploadForm onSubmit={handleUpload} />
      ) : (
        <ProgressTracker
          projectId={projectId}
          onComplete={() => {
            toast.success('Processing complete!');
            router.push(`/projects/${projectId}`);
          }}
        />
      )}
    </Modal>
  );
}
```

### Example 2: Project List with Status Badges

```tsx
function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="border rounded-lg p-4">
      <h3>{project.title}</h3>

      {project.status === 'processing' && (
        <div className="flex items-center space-x-2 text-blue-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">
            {project.processing_message || 'Processing...'}
          </span>
        </div>
      )}

      {project.status === 'completed' && (
        <span className="text-green-600 text-sm">✓ Complete</span>
      )}
    </div>
  );
}
```

---

## Conclusion

Your AudioRepurpose application now provides **real-time, granular progress tracking** that gives users visibility into every step of the transcription pipeline!

**Benefits:**
- ✅ Better user experience (users know what's happening)
- ✅ Reduced support questions ("Is it working?")
- ✅ Professional appearance
- ✅ Easy debugging (see exactly where processing fails)
- ✅ Analytics (track stage performance)

**Files Created/Modified:**
1. ✅ `database-progress-tracking.sql` - Database migration
2. ✅ `lib/progress-tracker.ts` - Progress utility functions
3. ✅ `components/ProgressTracker.tsx` - UI component
4. ✅ `app/api/upload/route.ts` - Upload progress updates
5. ✅ `app/api/transcribe/route.ts` - Transcription progress updates
6. ✅ `app/api/projects/[id]/status/route.ts` - Status API updates

Treat this as an implementation guide, not a launch-readiness guarantee.
