export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
export const LARGE_FILE_THRESHOLD_BYTES = 25 * 1024 * 1024; // 25MB
export const ESTIMATED_BITRATE_BPS = 128000; // 128kbps (used for duration estimate)
export const UPLOAD_TIMEOUT_MS = 300000; // 5 minutes

export const ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',   // macOS/Chrome reports M4A as this
  'audio/flac',
  'audio/ogg',
  'audio/webm',
];

export const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'];
