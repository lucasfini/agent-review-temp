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

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const bufferToArrayBuffer = (buffer: Buffer) => {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
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
    // Fetch metadata (title) — fast, no download
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noPlaylist: true,
    }) as { title?: string };
    const title = (info.title || 'YouTube import').replace(/[/\\:*?"<>|]/g, '-');

    // Download best audio to temp file
    const outputTemplate = path.join(tmpDir, 'audio.%(ext)s');
    await youtubedl(url, {
      format: 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      noPlaylist: true,
      output: outputTemplate,
    });

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

export const extractAudioFromVideoBuffer = async (buffer: ArrayBuffer) => {
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
        .on('error', (err) => reject(err));
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
