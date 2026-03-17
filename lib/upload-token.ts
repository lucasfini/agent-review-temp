import { createHmac, timingSafeEqual } from 'crypto';

type UploadTokenPayload = {
  projectId: string;
  objectKey: string;
  audioFingerprint: string;
  userId: string;
  exp: number;
};

const getUploadTokenSecret = (): string | null => {
  return process.env.UPLOAD_TOKEN_SECRET || null;
};

export const createUploadToken = (payload: UploadTokenPayload): string => {
  const secret = getUploadTokenSecret();
  if (!secret) {
    throw new Error('UPLOAD_TOKEN_SECRET is not configured');
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
};

export const verifyUploadToken = (token: string): UploadTokenPayload | null => {
  const secret = getUploadTokenSecret();
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as UploadTokenPayload;
    if (!decoded?.projectId || !decoded?.objectKey || !decoded?.audioFingerprint || !decoded?.userId || typeof decoded?.exp !== 'number') {
      return null;
    }
    if (decoded.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};
