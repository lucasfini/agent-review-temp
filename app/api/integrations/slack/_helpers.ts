import { getDecryptedTokens } from '../_utils';

export const SLACK_SCOPES = ['files:read', 'users:read', 'team:read'];

export type SlackFile = {
  id: string;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
  created?: number;
  url_private_download?: string;
  url_private?: string;
  user?: string;
};

export function getSlackOAuthConfig() {
  return {
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    redirectUri: process.env.SLACK_REDIRECT_URI,
  };
}

export function isImportableSlackMimeType(mimeType?: string | null) {
  return Boolean(mimeType && (mimeType.startsWith('audio/') || mimeType.startsWith('video/')));
}

export function mapSlackFile(file: SlackFile) {
  return {
    id: file.id,
    name: file.title || file.name || 'Slack file',
    size: file.size || null,
    createdAt: file.created ? new Date(file.created * 1000).toISOString() : null,
    mimeType: file.mimetype || null,
    fileType: file.filetype || null,
    downloadUrl: file.url_private_download || file.url_private || null,
  };
}

export function getSlackAccessToken(connection: any) {
  const { accessToken } = getDecryptedTokens(connection);
  return accessToken;
}
