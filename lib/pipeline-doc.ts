import {
  MAX_FILE_SIZE_BYTES,
  LARGE_FILE_THRESHOLD_BYTES,
  ESTIMATED_BITRATE_BPS,
  ALLOWED_TYPES,
  ALLOWED_EXTENSIONS,
  UPLOAD_TIMEOUT_MS,
} from '@/lib/upload-constants';
import { CHUNKED_UPLOAD_DEFAULTS, CHUNKED_UPLOAD_THRESHOLD_MB } from '@/lib/chunked-upload';

export type PipelineDocSection = {
  title: string;
  items: string[];
};

export type PipelineDoc = {
  title: string;
  generatedAt: string;
  summary: string;
  sections: PipelineDocSection[];
  modelVerdict: string[];
  references: string[];
};

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${mb.toFixed(0)}MB`;
}

function formatMs(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

export function getPipelineDoc(): PipelineDoc {
  const maxFileSize = formatBytes(MAX_FILE_SIZE_BYTES);
  const largeFileThreshold = formatBytes(LARGE_FILE_THRESHOLD_BYTES);
  const chunkSize = `${CHUNKED_UPLOAD_DEFAULTS.chunkSizeMB}MB`;
  const chunkThreshold = `${CHUNKED_UPLOAD_THRESHOLD_MB}MB`;
  const timeout = formatMs(UPLOAD_TIMEOUT_MS);
  const bitrate = `${Math.round(ESTIMATED_BITRATE_BPS / 1000)}kbps`;

  return {
    title: 'Upload → Transcription → Content Pipeline',
    generatedAt: new Date().toISOString(),
    summary: 'This page describes the end-to-end upload pipeline as implemented in the app. It is generated at request time and pulls live values from code constants (limits, thresholds, timeouts).',
    sections: [
      {
        title: '1) Client Upload Flow (UI)',
        items: [
          'User selects tier (basic/pro/premium), optional roster speakers, optional speaker count, and a file in `app/dashboard/upload/page.tsx`.',
          'If video, audio is extracted client-side before upload.',
          'Files are queued; active file calls `POST /api/upload` with `FormData`.',
          `Client timeout is ${timeout}. UI simulates stage progress while uploading.`,
        ],
      },
      {
        title: '2) Direct Upload API',
        items: [
          'Route: `app/api/upload/route.ts`.',
          `Validates file size (max ${maxFileSize}), type (${ALLOWED_TYPES.join(', ')}), and extension (${ALLOWED_EXTENSIONS.join(', ')}).`,
          `Computes audio fingerprint and estimated duration using ${bitrate}.`,
          'Creates a `projects` record with status `uploading` and progress metadata.',
          'If roster speakers are provided, saves them + auto-generated keywords on the project.',
          `Uploads to Supabase Storage for files ≤ ${largeFileThreshold}; larger files skip storage and are kept in memory.`,
          'Stores the file in `global.uploadedFiles` for immediate processing.',
          'Checks transcription cache by fingerprint; if found, hydrates base transcription on the project.',
          'Updates progress to `transcribing` and fires a background POST to `/api/transcribe`.',
        ],
      },
      {
        title: '3) Chunked Upload Path (Optional)',
        items: [
          'Client helper: `lib/chunked-upload.ts`.',
          `Chunking threshold: ${chunkThreshold}; default chunk size: ${chunkSize}.`,
          'Chunks are sent to `POST /api/upload/chunk` and assembled via `POST /api/upload/finalize`.',
          '`/finalize` creates the project, uploads the assembled file, caches in memory, then triggers `/api/transcribe`.',
        ],
      },
      {
        title: '4) Transcription + Diarization',
        items: [
          'Route: `app/api/transcribe/route.ts`.',
          'Loads the audio from `global.uploadedFiles`, writes a temp file, and preflights credit balance.',
          'Calls AssemblyAI or Deepgram for ASR + speaker diarization.',
          'Tracks usage and debits credits, then caches the transcription by fingerprint.',
          'Groups diarized segments into speakers and assigns fallback names.',
        ],
      },
      {
        title: '5) LLM Speaker Pipeline + Classification',
        items: [
          'Early project type classification (debate/interview/podcast/other).',
          'LLM pipeline: GPT-5 extracts speaker names; GPT-5-nano reassigns segments.',
          'Debate/self-ID corrections, duplicate merges, smoothing, and final speaker data assembly.',
        ],
      },
      {
        title: '6) Persist + Complete',
        items: [
          'Saves transcription, segments, speaker_data, costs, and project type.',
          'Marks project `completed` and updates processing progress.',
        ],
      },
      {
        title: '7) Background Tier Tasks',
        items: [
          'Runs summary, roles, chapters, takeaways, quotes, and insights (tier-gated) asynchronously.',
          'Updates `speaker_data.detectionMetadata.aiProcessing` as tasks complete.',
        ],
      },
      {
        title: '8) Cleanup',
        items: [
          'Deletes temp file.',
          'Purges in-memory audio from `global.uploadedFiles`.',
        ],
      },
      {
        title: 'Key Config Values (Live)',
        items: [
          `Max file size: ${maxFileSize}.`,
          `Large-file threshold: ${largeFileThreshold} (skips storage, in-memory only).`,
          `Chunking threshold: ${chunkThreshold}.`,
          `Chunk size: ${chunkSize}.`,
          `Upload timeout: ${timeout}.`,
        ],
      },
    ],
    modelVerdict: [
      'Specialized ASR/diarization models (AssemblyAI/Deepgram) are best for transcript accuracy, speed, and cost.',
      'General LLMs are best for semantic enrichment (speaker naming, summaries, chapters, takeaways, roles).',
      'Recommendation: keep specialized ASR + general LLM enrichment unless you need domain-specific fine-tuning.',
    ],
    references: [
      'app/dashboard/upload/page.tsx',
      'app/api/upload/route.ts',
      'app/api/upload/chunk/route.ts',
      'app/api/upload/finalize/route.ts',
      'app/api/transcribe/route.ts',
      'lib/chunked-upload.ts',
      'lib/upload-constants.ts',
    ],
  };
}
