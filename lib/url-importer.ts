import { Readable } from 'stream';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as net from 'net';
import { lookup } from 'dns/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import youtubedl from 'youtube-dl-exec';

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const YT_DLP_JS_RUNTIME = `node:${process.execPath}`;

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const bufferToArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes.buffer;
};

const isPrivateIpv4 = (ip: string) => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
};

const isPrivateIpv6 = (ip: string) => {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
};

const isPrivateIp = (ip: string) => {
  const type = net.isIP(ip);
  if (type === 4) return isPrivateIpv4(ip);
  if (type === 6) return isPrivateIpv6(ip);
  return true;
};

export const isYouTubeUrl = (value: string) => {
  const lower = value.toLowerCase();
  return lower.includes('youtube.com') || lower.includes('youtu.be');
};

type YouTubeImportErrorCode =
  | 'protected_video'
  | 'video_unavailable'
  | 'unsupported_video'
  | 'download_failed';

export class YouTubeImportError extends Error {
  code: YouTubeImportErrorCode;
  status: number;
  details?: string;

  constructor(code: YouTubeImportErrorCode, message: string, status = 422, details?: string) {
    super(message);
    this.name = 'YouTubeImportError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const getYouTubeDlCommonFlags = () => ({
  noPlaylist: true,
  jsRuntimes: YT_DLP_JS_RUNTIME,
});

const classifyYouTubeError = (error: unknown) => {
  if (error instanceof YouTubeImportError) {
    return error;
  }

  const stderr = typeof error === 'object' && error !== null && 'stderr' in error
    ? String((error as { stderr?: unknown }).stderr || '')
    : '';
  const stdout = typeof error === 'object' && error !== null && 'stdout' in error
    ? String((error as { stdout?: unknown }).stdout || '')
    : '';
  const message = error instanceof Error ? error.message : String(error || '');
  const details = [stderr, stdout, message].filter(Boolean).join('\n').toLowerCase();

  if (
    details.includes('sign in to confirm you’re not a bot')
    || details.includes("sign in to confirm you're not a bot")
    || details.includes('use --cookies-from-browser')
    || details.includes('use --cookies')
    || details.includes('bot')
  ) {
    return new YouTubeImportError(
      'protected_video',
      'This YouTube video is protected by a sign-in or bot check and cannot be imported right now. Please use a public YouTube link or upload the audio file directly.',
      422,
      message
    );
  }

  if (
    details.includes('private video')
    || details.includes('video unavailable')
    || details.includes('this video is unavailable')
    || details.includes('has been removed')
    || details.includes('is not available')
  ) {
    return new YouTubeImportError(
      'video_unavailable',
      'This YouTube video is unavailable, private, or has been removed. Please confirm the link is public and still accessible.',
      422,
      message
    );
  }

  if (
    details.includes('unsupported url')
    || details.includes('unsupported site')
    || details.includes('unsupported')
  ) {
    return new YouTubeImportError(
      'unsupported_video',
      'This YouTube link could not be imported. Right now we only support public YouTube videos.',
      422,
      message
    );
  }

  return new YouTubeImportError(
    'download_failed',
    'We could not import this YouTube video right now. Please try another public link or upload the media file directly.',
    502,
    message
  );
};

export const validatePublicUrl = async (value: string) => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http/https URLs are supported.');
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Localhost URLs are not allowed.');
  }

  const ipType = net.isIP(hostname);
  if (ipType) {
    if (isPrivateIp(hostname)) {
      throw new Error('Private or local IPs are not allowed.');
    }
    return url;
  }

  const records = await lookup(hostname, { all: true });
  if (!records.length) {
    throw new Error('Unable to resolve the URL hostname.');
  }
  if (records.some(record => isPrivateIp(record.address))) {
    throw new Error('Private or local IPs are not allowed.');
  }

  return url;
};

const streamToBuffer = async (stream: Readable, maxBytes: number) => {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of stream) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bufferChunk.length;
    if (total > maxBytes) {
      throw new Error('File size exceeds 500MB limit');
    }
    chunks.push(bufferChunk);
  }

  return Buffer.concat(chunks);
};

const getFileNameFromHeaders = (headers: Headers, fallback: string) => {
  const contentDisposition = headers.get('content-disposition');
  if (contentDisposition) {
    const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
    if (match?.[1]) return match[1];
  }
  return fallback;
};

export const downloadYouTubeAudio = async (url: string) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-import-'));
  try {
    // Metadata lookup is useful for naming, but it should not block imports.
    let title = 'YouTube import';
    try {
      const info = await youtubedl(url, {
        ...getYouTubeDlCommonFlags(),
        dumpSingleJson: true,
      }) as { title?: string };
      title = info.title || title;
    } catch (error) {
      console.warn('[URL IMPORT] YouTube metadata lookup failed, continuing with fallback title:', classifyYouTubeError(error));
    }

    title = title.replace(/[/\\:*?"<>|]/g, '-');

    // Download best audio to temp file
    const outputTemplate = path.join(tmpDir, 'audio.%(ext)s');
    try {
      await youtubedl(url, {
        ...getYouTubeDlCommonFlags(),
        format: 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
        output: outputTemplate,
      });
    } catch (error) {
      throw classifyYouTubeError(error);
    }

    // Read the output file (yt-dlp fills in the real extension)
    const files = await fs.readdir(tmpDir);
    const audioFile = files.find(f => f.startsWith('audio.'));
    if (!audioFile) throw new Error('yt-dlp produced no output file');

    const audioBuffer = await fs.readFile(path.join(tmpDir, audioFile));
    if (audioBuffer.byteLength > MAX_FILE_SIZE) throw new Error('File size exceeds 500MB limit');

    const ext = path.extname(audioFile).slice(1); // 'm4a', 'webm', 'opus', etc.
    const contentType = ext === 'webm' || ext === 'opus' ? 'audio/webm' : 'audio/mp4';

    return {
      buffer: bufferToArrayBuffer(audioBuffer),
      title,
      fileName: `${title}.${ext}`,
      contentType,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
};

export const downloadDirectMedia = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download URL (${response.status})`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
    throw new Error('File size exceeds 500MB limit');
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const fallbackName = path.basename(new URL(url).pathname) || 'url-import';
  const fileName = getFileNameFromHeaders(response.headers, fallbackName);

  if (!response.body) {
    throw new Error('No response body received.');
  }

  const nodeStream = Readable.fromWeb(response.body as any);
  const buffer = await streamToBuffer(nodeStream, MAX_FILE_SIZE);

  const isVideo = contentType.startsWith('video/') || /\.(mp4|mov|mkv|avi|webm)$/i.test(fileName);

  return {
    buffer: bufferToArrayBuffer(buffer),
    fileName,
    contentType,
    isVideo
  };
};

export const extractAudioFromVideoBuffer = async (buffer: ArrayBufferLike) => {
  if (!ffmpegPath) {
    throw new Error('FFmpeg binary not available for video extraction');
  }
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'url-import-'));
  const inputPath = path.join(tmpDir, 'input-video');
  const outputPath = path.join(tmpDir, 'output-audio.mp3');

  try {
    await fs.writeFile(inputPath, Buffer.from(buffer));

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioQuality(2)
        .save(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err));
    });

    const audioBuffer = await fs.readFile(outputPath);
    if (audioBuffer.byteLength > MAX_FILE_SIZE) {
      throw new Error('Extracted audio exceeds 500MB limit');
    }

    return {
      buffer: bufferToArrayBuffer(audioBuffer),
      contentType: 'audio/mpeg'
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
};
