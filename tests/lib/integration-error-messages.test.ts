import {
  buildIntegrationErrorPayload,
  getIntegrationErrorMessage,
} from '@/lib/integrations/error-messages';

describe('integration error messages', () => {
  it('uses a generic sign-in message', () => {
    expect(getIntegrationErrorMessage({ code: 'SIGN_IN_REQUIRED' })).toBe(
      'Please sign in again to continue.'
    );
  });

  it('asks users to reconnect when credentials are invalid', () => {
    expect(getIntegrationErrorMessage({
      provider: 'google_drive',
      code: 'RECONNECT_REQUIRED',
      action: 'list',
    })).toBe('Google Drive needs to be reconnected before we can load files.');
  });

  it('keeps provider API failures simple', () => {
    expect(getIntegrationErrorMessage({
      provider: 'zoom',
      code: 'LIST_FAILED',
      action: 'list',
    })).toBe('We could not load files from Zoom. Reconnect the app, then try again.');
  });

  it('explains download and unsupported-media failures without raw provider details', () => {
    expect(getIntegrationErrorMessage({
      provider: 'slack',
      code: 'DOWNLOAD_FAILED',
      action: 'download',
    })).toBe('We could not download that file from Slack. Check that you can open it there, then try again.');

    expect(getIntegrationErrorMessage({
      provider: 'onedrive',
      code: 'UNSUPPORTED_MEDIA',
      action: 'import',
    })).toBe('That file is not an audio or video file we can import.');
  });

  it('returns a UI-friendly payload shape', () => {
    expect(buildIntegrationErrorPayload({
      provider: 'youtube',
      code: 'TEMPORARY_UNAVAILABLE',
      action: 'list',
    })).toEqual({
      error: 'YouTube is temporarily unavailable. Try again in a few minutes.',
      message: 'YouTube is temporarily unavailable. Try again in a few minutes.',
      code: 'TEMPORARY_UNAVAILABLE',
      provider: 'youtube',
      action: 'list',
      reconnect: false,
      retryable: true,
    });
  });
});
