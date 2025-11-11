import crypto from 'crypto';

export function computeAudioFingerprint(data: ArrayBuffer | Buffer): string {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
