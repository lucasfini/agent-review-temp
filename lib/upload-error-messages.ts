const STORAGE_UNREACHABLE_MESSAGE =
  'We could not reach audio storage during the upload. Check your connection and try again. If it keeps failing, verify Cloudflare R2 CORS allows PUT requests from this app domain.';

export function getPresignedUploadNetworkErrorMessage() {
  return STORAGE_UNREACHABLE_MESSAGE;
}

export function getPresignedUploadStatusErrorMessage(status: number, statusText?: string) {
  if (status === 0) {
    return getPresignedUploadNetworkErrorMessage();
  }

  if (status === 403) {
    return 'Audio storage rejected the upload. The signed upload URL may have expired, or Cloudflare R2 CORS/policy settings may be blocking the request. Please try again.';
  }

  if (status === 413) {
    return 'Audio storage rejected this file as too large. Upload files must be 500 MB or smaller.';
  }

  const cleanStatusText = statusText?.trim();
  return `Audio storage upload failed with status ${status}${cleanStatusText ? ` (${cleanStatusText})` : ''}.`;
}
