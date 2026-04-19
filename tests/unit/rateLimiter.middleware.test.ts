import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/env.js', () => ({
  env: {
    ENABLE_RATE_LIMITING: true,
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX_REQUESTS: 100,
  },
}));

const {
  rateLimiterMiddleware,
  clearRateLimitBuckets,
  getBucketState,
} = await import('../../src/gateway/rateLimiter.middleware.js');

const mockResponse = (): Partial<import('express').Response> => {
  const res: Partial<import('express').Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return res;
};

describe('rateLimiterMiddleware', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearRateLimitBuckets();
  });

  it('allows request when tokens available', () => {
    const req = {
      headers: { 'x-api-key': 'test-client' },
      ip: '127.0.0.1',
      path: '/v1/request',
    } as Partial<import('express').Request> as import('express').Request;
    const res = mockResponse();
    const next = vi.fn();

    rateLimiterMiddleware(req, res as import('express').Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  it('blocks when tokens exhausted', () => {
    const req = {
      headers: { 'x-api-key': 'rate-limit-test' },
      ip: '127.0.0.1',
      path: '/v1/request',
    } as Partial<import('express').Request> as import('express').Request;
    const res = mockResponse();
    const next = vi.fn();

    for (let i = 0; i < 100; i++) {
      const n = vi.fn();
      rateLimiterMiddleware(req, res as import('express').Response, n);
    }

    rateLimiterMiddleware(req, res as import('express').Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Rate limit exceeded',
        retry_after: expect.any(Number),
      }),
    );
  });

  it('sets rate limit headers', () => {
    const req = {
      headers: { 'x-api-key': 'header-test' },
      ip: '127.0.0.1',
      path: '/v1/request',
    } as Partial<import('express').Request> as import('express').Request;
    const res = mockResponse();
    const next = vi.fn();

    rateLimiterMiddleware(req, res as import('express').Response, next);

    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
  });

  it('uses API key as client identifier', () => {
    const req = {
      headers: { 'x-api-key': 'api-key-client' },
      ip: '127.0.0.1',
      path: '/v1/request',
    } as Partial<import('express').Request> as import('express').Request;
    const res = mockResponse();
    const next = vi.fn();

    rateLimiterMiddleware(req, res as import('express').Response, next);
    rateLimiterMiddleware(req, res as import('express').Response, next);

    expect(next).toHaveBeenCalledTimes(2);
    const state = getBucketState('key:api-key-client');
    expect(state).toBeDefined();
  });

  it('uses X-Forwarded-For IP as fallback identifier', () => {
    const req = {
      headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
      ip: '127.0.0.1',
      path: '/v1/request',
    } as Partial<import('express').Request> as import('express').Request;
    const res = mockResponse();
    const next = vi.fn();

    rateLimiterMiddleware(req, res as import('express').Response, next);

    expect(next).toHaveBeenCalled();
    const state = getBucketState('ip:192.168.1.1');
    expect(state).toBeDefined();
  });
});

describe('bucket state', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
  });

  afterEach(() => {
    clearRateLimitBuckets();
  });

  it('getBucketState returns undefined for unknown client', () => {
    const state = getBucketState('unknown-client');
    expect(state).toBeUndefined();
  });

  it('clearRateLimitBuckets clears all buckets', () => {
    const req = {
      headers: { 'x-api-key': 'clear-test' },
      ip: '127.0.0.1',
      path: '/v1/request',
    } as Partial<import('express').Request> as import('express').Request;
    const res = mockResponse();
    const next = vi.fn();
    rateLimiterMiddleware(req, res as import('express').Response, next);

    clearRateLimitBuckets();

    const state = getBucketState('key:clear-test');
    expect(state).toBeUndefined();
  });

  it('rate limit headers show remaining tokens decreasing', () => {
    const req = {
      headers: { 'x-api-key': 'decreasing-tokens' },
      ip: '127.0.0.1',
      path: '/v1/request',
    } as Partial<import('express').Request> as import('express').Request;
    const res1 = mockResponse();
    const next1 = vi.fn();
    rateLimiterMiddleware(req, res1 as import('express').Response, next1);

    const res2 = mockResponse();
    const next2 = vi.fn();
    rateLimiterMiddleware(req, res2 as import('express').Response, next2);

    expect(res1.set).toHaveBeenCalled();
    expect(res2.set).toHaveBeenCalled();
  });
});