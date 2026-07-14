import {
  getPresignedUploadNetworkErrorMessage,
  getPresignedUploadStatusErrorMessage,
} from '@/lib/upload-error-messages';

describe('upload error messages', () => {
  it('explains likely storage connectivity and CORS failures for XHR network errors', () => {
    expect(getPresignedUploadNetworkErrorMessage()).toContain('Cloudflare R2 CORS');
    expect(getPresignedUploadStatusErrorMessage(0)).toBe(getPresignedUploadNetworkErrorMessage());
  });

  it('gives status-specific guidance for rejected presigned uploads', () => {
    expect(getPresignedUploadStatusErrorMessage(403)).toContain('signed upload URL');
    expect(getPresignedUploadStatusErrorMessage(413)).toContain('500 MB');
    expect(getPresignedUploadStatusErrorMessage(500, 'Server Error')).toBe(
      'Audio storage upload failed with status 500 (Server Error).'
    );
  });
});
