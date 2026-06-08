import {
  buildLeadRateLimitKey,
  checkAgencyLeadRateLimit,
  isLikelySpamLead,
  resetAgencyLeadRateLimitForTests,
  setAgencyLeadDurableLimiterForTests,
} from '@/lib/agency-lead-rate-limit';

describe('agency lead rate limiting and spam protection', () => {
  beforeEach(() => {
    resetAgencyLeadRateLimitForTests();
    setAgencyLeadDurableLimiterForTests('email', null);
    setAgencyLeadDurableLimiterForTests('ip', null);
  });

  it('allows valid leads through the in-memory fallback', async () => {
    const result = await checkAgencyLeadRateLimit({
      kind: 'email',
      value: 'lucas@example.com',
      now: 1_000,
    });

    expect(result.allowed).toBe(true);
    expect(result.backend).toBe('memory');
    expect(result.degraded).toBe(false);
    expect(result.remaining).toBe(2);
  });

  it('rate limits repeated email submissions', async () => {
    for (let index = 0; index < 3; index += 1) {
      const result = await checkAgencyLeadRateLimit({
        kind: 'email',
        value: 'lucas@example.com',
        now: 1_000,
      });
      expect(result.allowed).toBe(true);
    }

    const denied = await checkAgencyLeadRateLimit({
      kind: 'email',
      value: 'lucas@example.com',
      now: 1_000,
    });

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);

    const later = await checkAgencyLeadRateLimit({
      kind: 'email',
      value: 'lucas@example.com',
      now: 1_000 + (60 * 60 * 1000) + 1,
    });
    expect(later.allowed).toBe(true);
  });

  it('rate limits repeated IP submissions separately from email submissions', async () => {
    for (let index = 0; index < 8; index += 1) {
      const result = await checkAgencyLeadRateLimit({
        kind: 'ip',
        value: '127.0.0.1',
        now: 5_000,
      });
      expect(result.allowed).toBe(true);
    }

    const denied = await checkAgencyLeadRateLimit({
      kind: 'ip',
      value: '127.0.0.1',
      now: 5_000,
    });

    expect(denied.allowed).toBe(false);
    expect(denied.limit).toBe(8);
  });

  it('uses durable limiter results when configured', async () => {
    const limiter = {
      limit: jest.fn().mockResolvedValue({
        success: false,
        limit: 3,
        remaining: 0,
        reset: 61_000,
      }),
    };
    setAgencyLeadDurableLimiterForTests('email', limiter);

    const result = await checkAgencyLeadRateLimit({
      kind: 'email',
      value: 'lucas@example.com',
      now: 1_000,
    });

    expect(result).toEqual(expect.objectContaining({
      allowed: false,
      backend: 'upstash',
      degraded: false,
      retryAfterSeconds: 60,
    }));
    expect(limiter.limit).toHaveBeenCalledWith(buildLeadRateLimitKey('email', 'lucas@example.com'));
  });

  it('falls back gracefully when durable rate limiting fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const limiter = {
      limit: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    setAgencyLeadDurableLimiterForTests('ip', limiter);

    const result = await checkAgencyLeadRateLimit({
      kind: 'ip',
      value: '127.0.0.1',
      now: 1_000,
    });

    expect(result.allowed).toBe(true);
    expect(result.backend).toBe('memory');
    expect(result.degraded).toBe(true);
    warnSpy.mockRestore();
  });

  it('hashes lead rate limit keys instead of exposing raw email or IP values', () => {
    const emailKey = buildLeadRateLimitKey('email', 'Lucas@Example.com');
    const ipKey = buildLeadRateLimitKey('ip', '127.0.0.1');

    expect(emailKey).toMatch(/^agency-lead:email:[a-f0-9]{32}$/);
    expect(ipKey).toMatch(/^agency-lead:ip:[a-f0-9]{32}$/);
    expect(emailKey).not.toContain('lucas@example.com');
    expect(ipKey).not.toContain('127.0.0.1');
  });

  it('flags deterministic likely-spam signals without external services', () => {
    expect(isLikelySpamLead({ email: 'lead@example.com', referralCode: 'filled' }))
      .toEqual({ isSpam: true, reason: 'honeypot' });
    expect(isLikelySpamLead({
      email: 'lead@example.com',
      message: 'https://a.test https://b.test https://c.test https://d.test',
    })).toEqual({ isSpam: true, reason: 'too_many_links' });
    expect(isLikelySpamLead({
      email: 'lead@example.com',
      message: '<a href="https://spam.test">spam</a>',
    })).toEqual({ isSpam: true, reason: 'markup_link_spam' });
    expect(isLikelySpamLead({
      email: 'lead@example.com',
      message: 'aaaaaaaaaaaaaaaaaaaaaaaaa',
    })).toEqual({ isSpam: true, reason: 'repeated_characters' });
    expect(isLikelySpamLead({
      email: 'lead@example.com',
      message: 'We need help turning product calls into customer updates.',
    })).toEqual({ isSpam: false, reason: null });
  });
});
