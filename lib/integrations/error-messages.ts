export type IntegrationProvider =
  | 'zoom'
  | 'microsoft'
  | 'youtube'
  | 'notion'
  | 'onedrive'
  | 'google_drive'
  | 'granola'
  | 'slack';

export type IntegrationErrorAction =
  | 'connect'
  | 'callback'
  | 'list'
  | 'import'
  | 'download'
  | 'disconnect';

export type IntegrationErrorCode =
  | 'SIGN_IN_REQUIRED'
  | 'RECONNECT_REQUIRED'
  | 'INTEGRATION_NOT_CONFIGURED'
  | 'OAUTH_LINK_EXPIRED'
  | 'LIST_FAILED'
  | 'DOWNLOAD_FAILED'
  | 'UNSUPPORTED_MEDIA'
  | 'BAD_REQUEST'
  | 'TEMPORARY_UNAVAILABLE'
  | 'DISCONNECT_FAILED'
  | 'IMPORT_FAILED';

export const INTEGRATION_PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  zoom: 'Zoom',
  microsoft: 'Microsoft Teams',
  youtube: 'YouTube',
  notion: 'Notion',
  onedrive: 'OneDrive',
  google_drive: 'Google Drive',
  granola: 'Granola AI',
  slack: 'Slack',
};

export type IntegrationErrorPayload = {
  error: string;
  message: string;
  code: IntegrationErrorCode;
  provider?: IntegrationProvider;
  action?: IntegrationErrorAction;
  reconnect?: boolean;
  retryable?: boolean;
};

export function getIntegrationProviderLabel(provider: IntegrationProvider) {
  return INTEGRATION_PROVIDER_LABELS[provider];
}

export function getIntegrationErrorMessage(params: {
  provider?: IntegrationProvider;
  code: IntegrationErrorCode;
  action?: IntegrationErrorAction;
}) {
  const label = params.provider ? getIntegrationProviderLabel(params.provider) : 'this integration';

  switch (params.code) {
    case 'SIGN_IN_REQUIRED':
      return 'Please sign in again to continue.';
    case 'RECONNECT_REQUIRED': {
      const actionCopy =
        params.action === 'list'
          ? 'load files'
          : params.action === 'download'
            ? 'download that file'
            : params.action === 'connect'
              ? 'connect'
              : 'import files';
      return `${label} needs to be reconnected before we can ${actionCopy}.`;
    }
    case 'INTEGRATION_NOT_CONFIGURED':
      return `${label} is not fully configured yet. Please contact support.`;
    case 'OAUTH_LINK_EXPIRED':
      return 'The connection link expired. Start the connection again.';
    case 'LIST_FAILED':
      return `We could not load files from ${label}. Reconnect the app, then try again.`;
    case 'DOWNLOAD_FAILED':
      return `We could not download that file from ${label}. Check that you can open it there, then try again.`;
    case 'UNSUPPORTED_MEDIA':
      return 'That file is not an audio or video file we can import.';
    case 'BAD_REQUEST':
      return `Choose a valid ${label} item and try again.`;
    case 'TEMPORARY_UNAVAILABLE':
      return `${label} is temporarily unavailable. Try again in a few minutes.`;
    case 'DISCONNECT_FAILED':
      return `We could not disconnect ${label}. Try again in a moment.`;
    case 'IMPORT_FAILED':
    default:
      return 'We could not import that item. Try again in a moment.';
  }
}

export function buildIntegrationErrorPayload(params: {
  provider?: IntegrationProvider;
  code: IntegrationErrorCode;
  action?: IntegrationErrorAction;
}): IntegrationErrorPayload {
  const message = getIntegrationErrorMessage(params);
  const reconnect = params.code === 'RECONNECT_REQUIRED' || params.code === 'LIST_FAILED';
  const retryable = params.code === 'TEMPORARY_UNAVAILABLE' || params.code === 'IMPORT_FAILED';

  return {
    error: message,
    message,
    code: params.code,
    provider: params.provider,
    action: params.action,
    reconnect,
    retryable,
  };
}
