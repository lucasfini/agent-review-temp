import { getIntegrationConnectionHealth } from '@/lib/integrations/connection-health';

describe('integration connection health', () => {
  it('treats missing or revoked rows as disconnected', () => {
    expect(getIntegrationConnectionHealth(null)).toMatchObject({
      healthStatus: 'disconnected',
      connected: false,
      needsReview: false,
    });

    expect(getIntegrationConnectionHealth({ status: 'revoked' })).toMatchObject({
      healthStatus: 'disconnected',
      connected: false,
      needsReview: false,
    });
  });

  it('marks saved connections with missing tokens for review', () => {
    expect(getIntegrationConnectionHealth({ status: 'connected', access_token_enc: null })).toMatchObject({
      healthStatus: 'review',
      connected: false,
      needsReview: true,
      issue: 'missing_token',
    });
  });

  it('marks non-connected saved statuses for review', () => {
    expect(getIntegrationConnectionHealth({ status: 'needs_attention', access_token_enc: 'token' })).toMatchObject({
      healthStatus: 'review',
      connected: false,
      needsReview: true,
      issue: 'needs_attention',
    });
  });

  it('allows expired access tokens when a refresh token exists', () => {
    expect(getIntegrationConnectionHealth({
      status: 'connected',
      access_token_enc: 'token',
      refresh_token_enc: 'refresh-token',
      expires_at: '2020-01-01T00:00:00.000Z',
    })).toMatchObject({
      healthStatus: 'connected',
      connected: true,
      needsReview: false,
    });
  });

  it('marks expired tokens without refresh support for review', () => {
    expect(getIntegrationConnectionHealth({
      status: 'connected',
      access_token_enc: 'token',
      refresh_token_enc: null,
      expires_at: '2020-01-01T00:00:00.000Z',
    })).toMatchObject({
      healthStatus: 'review',
      connected: false,
      needsReview: true,
      issue: 'expired_token',
    });
  });
});
