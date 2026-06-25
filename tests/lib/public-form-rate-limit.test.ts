import {
  buildPublicFormRateLimitKey,
  checkPublicFormRateLimit,
  resetPublicFormRateLimitForTests,
  setPublicFormDurableLimiterForTests,
} from '@/lib/public-form-rate-limit';

describe('public form rate limiting', () => {
  beforeEach(() => {
    resetPublicFormRateLimitForTests();
    setPublicFormDurableLimiterForTests('contact', 'ip', null);
    setPublicFormDurableLimiterForTests('contact', 'email', null);
    setPublicFormDurableLimiterForTests('waitlist', 'ip', null);
    setPublicFormDurableLimiterForTests('waitlist', 'email', null);
  });

  it('rate limits repeated contact submissions by email in memory fallback', async () => {
    for (let index = 0; index < 3; index += 1) {
      const result = await checkPublicFormRateLimit({
        route: 'contact',
        kind: 'email',
        value: 'lucas@example.com',
        now: 1_000,
      });
      expect(result.allowed).toBe(true);
      expect(result.backend).toBe('memory');
    }

    const denied = await checkPublicFormRateLimit({
      route: 'contact',
      kind: 'email',
      value: 'lucas@example.com',
      now: 1_000,
    });

    expect(denied.allowed).toBe(false);
    expect(denied.limit).toBe(3);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('rate limits repeated waitlist submissions by IP separately from contact', async () => {
    for (let index = 0; index < 20; index += 1) {
      const result = await checkPublicFormRateLimit({
        route: 'waitlist',
        kind: 'ip',
        value: '127.0.0.1',
        now: 5_000,
      });
      expect(result.allowed).toBe(true);
    }

    const denied = await checkPublicFormRateLimit({
      route: 'waitlist',
      kind: 'ip',
      value: '127.0.0.1',
      now: 5_000,
    });
    const contact = await checkPublicFormRateLimit({
      route: 'contact',
      kind: 'ip',
      value: '127.0.0.1',
      now: 5_000,
    });

    expect(denied.allowed).toBe(false);
    expect(denied.limit).toBe(20);
    expect(contact.allowed).toBe(true);
  });

  it('uses durable public form limiter results when configured', async () => {
    const limiter = {
      limit: jest.fn().mockResolvedValue({
        success: false,
        limit: 3,
        remaining: 0,
        reset: 61_000,
      }),
    };
    setPublicFormDurableLimiterForTests('contact', 'email', limiter);

    const result = await checkPublicFormRateLimit({
      route: 'contact',
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
    expect(limiter.limit).toHaveBeenCalledWith(
      buildPublicFormRateLimitKey('contact', 'email', 'lucas@example.com')
    );
  });

  it('falls back gracefully when durable public form rate limiting fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const limiter = {
      limit: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    setPublicFormDurableLimiterForTests('waitlist', 'ip', limiter);

    const result = await checkPublicFormRateLimit({
      route: 'waitlist',
      kind: 'ip',
      value: '127.0.0.1',
      now: 1_000,
    });

    expect(result.allowed).toBe(true);
    expect(result.backend).toBe('memory');
    expect(result.degraded).toBe(true);
    warnSpy.mockRestore();
  });

  it('hashes public form keys instead of exposing raw email or IP values', () => {
    const emailKey = buildPublicFormRateLimitKey('contact', 'email', 'Lucas@Example.com');
    const ipKey = buildPublicFormRateLimitKey('waitlist', 'ip', '127.0.0.1');

    expect(emailKey).toMatch(/^public-form:contact:email:[a-f0-9]{32}$/);
    expect(ipKey).toMatch(/^public-form:waitlist:ip:[a-f0-9]{32}$/);
    expect(emailKey).not.toContain('lucas@example.com');
    expect(ipKey).not.toContain('127.0.0.1');
  });
});
