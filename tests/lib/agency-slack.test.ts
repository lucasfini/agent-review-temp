import {
  normalizeSlackImportLimit,
  normalizeSlackSelectedChannels,
  selectedSlackChannelName,
  slackChannelIsSelected,
  slackMessagesToRawText,
} from '@/lib/agency-slack';

describe('agency Slack helpers', () => {
  const integration = {
    id: 'integration-1',
    clientId: 'client-1',
    provider: 'slack',
    status: 'connected',
    metadata: {
      selectedChannels: [
        {
          id: 'C123',
          name: 'support',
          isPrivate: false,
          isArchived: false,
          memberCount: 12,
        },
      ],
    },
    tokenStored: true,
    tokenScopes: ['channels:read', 'channels:history'],
    tokenType: 'bot',
    tokenExpiresAt: null,
    connectedAt: null,
    lastSyncAt: null,
    createdAt: '2026-06-08T00:00:00.000Z',
    updatedAt: '2026-06-08T00:00:00.000Z',
  } as any;

  it('normalizes selected channels and removes duplicates', () => {
    expect(normalizeSlackSelectedChannels([
      { id: 'C123', name: 'support', isPrivate: false, memberCount: 12 },
      { id: 'C123', name: 'support-updated', isPrivate: true, memberCount: 14 },
    ])).toEqual([
      {
        id: 'C123',
        name: 'support-updated',
        isPrivate: true,
        isArchived: false,
        memberCount: 14,
      },
    ]);
  });

  it('caps manual import limits', () => {
    expect(normalizeSlackImportLimit(undefined)).toBe(50);
    expect(normalizeSlackImportLimit(0)).toBe(50);
    expect(normalizeSlackImportLimit(500)).toBe(200);
    expect(normalizeSlackImportLimit(25)).toBe(25);
  });

  it('detects selected channels from integration metadata', () => {
    expect(slackChannelIsSelected(integration, 'C123')).toBe(true);
    expect(slackChannelIsSelected(integration, 'C999')).toBe(false);
    expect(selectedSlackChannelName(integration, 'C123')).toBe('support');
  });

  it('formats imported Slack messages as bounded source text', () => {
    expect(slackMessagesToRawText([
      { type: 'message', user: 'U123', text: 'Customer asked about onboarding.', ts: '1710000000.0001' },
      { type: 'message', bot_id: 'B123', text: 'Follow-up created.', ts: '1710000001.0001', thread_ts: '1710000000.0001' },
    ])).toBe([
      '[1710000000.0001] U123: Customer asked about onboarding.',
      '[1710000001.0001 thread:1710000000.0001] B123: Follow-up created.',
    ].join('\n'));
  });
});
