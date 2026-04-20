import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'development',
  },
}));

const { tlsMiddleware, httpsRedirectMiddleware, hstsMiddleware, securityHeadersMiddleware } =
  await import('../../src/gateway/tls.middleware.js');

function mockReqResNext(overrides: Partial<Request> = {}) {
  const req = {
    secure: false,
    headers: {},
    path: '/v1/request',
    originalUrl: '/v1/request',
    get: vi.fn((name: string) => {
      if (name === 'Host') {
        return 'example.com';
      }
      return undefined;
    }),
    method: 'POST',
    ...overrides,
  } as unknown as Request;

  const res = {
    redirect: vi.fn(),
    set: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe('tlsMiddleware', () => {
  it('calls next and sets security headers in development mode', () => {
    const { req, res, next } = mockReqResNext();
    tlsMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.set).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.set).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    expect(res.set).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
  });
});

describe('httpsRedirectMiddleware', () => {
  it('calls next in development mode (no redirect)', () => {
    const { req, res, next } = mockReqResNext();
    httpsRedirectMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

describe('securityHeadersMiddleware', () => {
  it('sets all security headers and calls next', () => {
    const { req, res, next } = mockReqResNext();
    securityHeadersMiddleware(req, res, next);
    expect(res.set).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.set).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.set).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    expect(res.set).toHaveBeenCalledWith(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(res.set).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    expect(res.set).toHaveBeenCalledWith(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
    expect(next).toHaveBeenCalled();
  });
});

describe('hstsMiddleware', () => {
  it('does not set HSTS in development', () => {
    const { req, res, next } = mockReqResNext();
    hstsMiddleware(req, res, next);
    expect(res.set).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
