import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    API_KEY: 'test-api-key',
    API_KEY_SECRET_NAME: undefined,
  },
}));

vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: vi.fn(),
}));

const { authMiddleware, clearAuthCache } = await import('../../src/gateway/auth.middleware.js');

function mockReqRes(overrides: Partial<Request> & { headers?: Record<string, string> } = {}) {
  const req = {
    headers: {},
    method: 'POST',
    ...overrides,
  } as unknown as Request & { apiKey?: string };

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthCache();
  });

  afterEach(() => {
    clearAuthCache();
  });

  describe('API key validation', () => {
    it('returns 401 when x-api-key header is missing', async () => {
      const { req, res, next } = mockReqRes({ headers: {} });

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication required',
          message: 'Missing x-api-key header',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when API key is invalid', async () => {
      const { req, res, next } = mockReqRes({ headers: { 'x-api-key': 'invalid-key' } });

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication failed',
          message: 'Invalid API key',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next when API key is valid', async () => {
      const { req, res, next } = mockReqRes({ headers: { 'x-api-key': 'test-api-key' } });

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.apiKey).toBe('test-api-key');
    });

    it('returns 401 for empty API key string', async () => {
      const { req, res, next } = mockReqRes({ headers: { 'x-api-key': '' } });

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for whitespace-only API key', async () => {
      const { req, res, next } = mockReqRes({ headers: { 'x-api-key': '   ' } });

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('development mode bypass', () => {
    it('bypasses validation when NODE_ENV is development and API_KEY is dev-key', async () => {
      vi.resetModules();
      vi.doMock('../../src/config/env.js', () => ({
        env: {
          NODE_ENV: 'development',
          API_KEY: 'dev-key',
          API_KEY_SECRET_NAME: undefined,
        },
      }));

      const { authMiddleware: devAuthMiddleware } =
        await import('../../src/gateway/auth.middleware.js');

      const { req, res, next } = mockReqRes({ headers: { 'x-api-key': 'dev-key' } });

      await devAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      vi.resetModules();
    });
  });

  describe('API key caching', () => {
    it('caches validation results for repeated calls', async () => {
      const { req, res, next } = mockReqRes({ headers: { 'x-api-key': 'test-api-key' } });

      await authMiddleware(req, res, next);
      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('returns 503 when Secret Manager throws', async () => {
      vi.resetModules();
      vi.doMock('../../src/config/env.js', () => ({
        env: {
          NODE_ENV: 'test',
          API_KEY: 'fallback-key',
          API_KEY_SECRET_NAME: 'projects/test/secrets/api-key/versions/latest',
        },
      }));
      vi.doMock('@google-cloud/secret-manager', () => {
        return {
          SecretManagerServiceClient: vi.fn().mockImplementation(() => {
            throw new Error('Secret Manager unavailable');
          }),
        };
      });

      const { authMiddleware: errorMiddleware } =
        await import('../../src/gateway/auth.middleware.js');

      const { req, res, next } = mockReqRes({ headers: { 'x-api-key': 'fallback-key' } });

      await errorMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      vi.resetModules();
    });
  });
});

describe('clearAuthCache', () => {
  it('clears the key cache without throwing', () => {
    expect(() => clearAuthCache()).not.toThrow();
  });

  it('can be called multiple times', () => {
    clearAuthCache();
    clearAuthCache();
    expect(() => clearAuthCache()).not.toThrow();
  });
});
