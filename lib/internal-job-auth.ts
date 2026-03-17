import { createHash, timingSafeEqual } from 'crypto';

const deriveInternalToken = (): string | null => {
  const seed = process.env.INTERNAL_JOB_SECRET;
  if (!seed) return null;
  return createHash('sha256').update(seed).digest('hex');
};

export const getInternalJobToken = (): string | null => {
  return deriveInternalToken();
};

export const isValidInternalJobToken = (provided: string | null): boolean => {
  if (!provided) return false;
  const expected = deriveInternalToken();
  if (!expected) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
};
