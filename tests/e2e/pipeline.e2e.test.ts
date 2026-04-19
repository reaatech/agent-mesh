/**
 * E2E-style tests for the full request pipeline without binding a local socket.
 * Tests: auth -> session -> classifier -> confidence -> router -> agent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

// Mock all external dependencies
vi.mock('../../src/session/firestoreClient.js', () => ({
  getFirestore: () => ({
    collection: vi.fn().mockReturnValue({
      where: () => ({
        where: () => ({
          where: () => ({
            limit: () => ({
              get: () => Promise.resolve({ empty: true, docs: [] }),
            }),
          }),
        }),
      }),
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      }),
      get: vi.fn().mockResolvedValue({ docs: [] }),
      runTransaction: vi.fn().mockImplementation(async (fn) => {
        await fn({
          get: vi.fn().mockResolvedValue({ exists: false }),
          update: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue({}),
        });
      }),
    }),
  }),
}));

vi.mock('@google-cloud/firestore/build/src/index.js', () => ({
  Timestamp: {
    fromDate: (date: Date) => ({ toDate: () => date }),
  },
  FieldValue: {
    delete: () => '__DELETE__',
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    API_KEY: 'test-api-key',
    GOOGLE_CLOUD_PROJECT: 'test-project',
    GOOGLE_CLOUD_REGION: 'us-central1',
    FIRESTORE_DATABASE: '(default)',
    VERTEX_AI_LOCATION: 'us-central1',
    VERTEX_AI_MODEL: 'gemini-2.0-flash',
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
    CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 30000,
    CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS: 3,
    CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS: 60000,
    SESSION_TTL_MINUTES: 30,
    SESSION_MAX_TURNS: 100,
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 100,
    AGENT_REGISTRY_DIR: './agents',
    MCP_REQUEST_TIMEOUT_MS: 30000,
    MCP_MAX_RETRIES: 3,
    ENABLE_SESSION_BYPASS: true,
    ENABLE_CLARIFICATION: true,
    ENABLE_CIRCUIT_BREAKER: true,
    ENABLE_RATE_LIMITING: false,
    LOG_LEVEL: 'info',
  },
}));

vi.mock('../../src/observability/audit.js', () => ({
  logAuthRequest: vi.fn(),
  logAgentRouted: vi.fn(),
}));

type TestResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

type DispatchOptions = {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
};

const { healthCheck, deepHealthCheck, handleRequest } = await import(
  '../../src/gateway/entry.handler.js'
);
const { authMiddleware } = await import('../../src/gateway/auth.middleware.js');

function createResponse(): Response & {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const res: {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
    set: (name: string, value: string) => typeof res;
    setHeader: (name: string, value: string) => void;
  } = {
    statusCode: 200,
    body: undefined,
    headers,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    set(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
  };

  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
  };
}

function normalizeHeaders(headers?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

async function runAuth(req: Request, res: Response): Promise<boolean> {
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };
  await authMiddleware(req, res, next);
  return nextCalled;
}

async function dispatch({ method, path, headers, body }: DispatchOptions): Promise<TestResponse> {
  const req = {
    method,
    path,
    headers: normalizeHeaders(headers),
    body,
    ip: '127.0.0.1',
  } as unknown as Request;
  const res = createResponse();

  if (!(await runAuth(req, res))) {
    return {
      status: (res as unknown as { statusCode: number }).statusCode,
      body: (res as unknown as { body: unknown }).body,
      headers: res.headers,
    };
  }

  if (method === 'GET' && path === '/health') {
    healthCheck(req, res);
  } else if (method === 'GET' && path === '/health/deep') {
    await deepHealthCheck(req, res);
  } else if (method === 'POST' && path === '/v1/request') {
    await handleRequest(req, res);
  } else {
    res.status(404).json({ error: 'Not found', path });
  }

  return {
    status: (res as unknown as { statusCode: number }).statusCode,
    body: (res as unknown as { body: unknown }).body,
    headers: res.headers,
  };
}

describe('E2E Pipeline Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Health endpoints', () => {
    it('should return healthy status from /health', async () => {
      const response = await dispatch({
        method: 'GET',
        path: '/health',
        headers: { 'x-api-key': 'test-api-key' },
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'healthy',
          service: 'agent-mesh',
          version: '1.0.0',
        }),
      );
    });

    it('should return degraded status when registry not loaded', async () => {
      const response = await dispatch({
        method: 'GET',
        path: '/health/deep',
        headers: { 'x-api-key': 'test-api-key' },
      });

      expect(response.status).toBe(503);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'degraded',
          checks: expect.objectContaining({
            registry: expect.objectContaining({
              status: 'fail',
            }),
          }),
        }),
      );
    });
  });

  describe('Authentication', () => {
    it('should reject requests without API key', async () => {
      const response = await dispatch({
        method: 'GET',
        path: '/health',
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'Authentication required',
        }),
      );
    });

    it('should reject requests with invalid API key', async () => {
      const response = await dispatch({
        method: 'GET',
        path: '/health',
        headers: { 'x-api-key': 'wrong-key' },
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'Authentication failed',
        }),
      );
    });

    it('should accept requests with valid API key', async () => {
      const response = await dispatch({
        method: 'GET',
        path: '/health',
        headers: { 'x-api-key': 'test-api-key' },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Request validation', () => {
    it('should reject requests without input', async () => {
      const response = await dispatch({
        method: 'POST',
        path: '/v1/request',
        headers: { 'x-api-key': 'test-api-key' },
        body: {},
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'Invalid request',
        }),
      );
    });

    it('should reject requests with empty input', async () => {
      const response = await dispatch({
        method: 'POST',
        path: '/v1/request',
        headers: { 'x-api-key': 'test-api-key' },
        body: { input: '' },
      });

      expect(response.status).toBe(400);
    });

    it('should reject requests with too long input', async () => {
      const response = await dispatch({
        method: 'POST',
        path: '/v1/request',
        headers: { 'x-api-key': 'test-api-key' },
        body: { input: 'a'.repeat(10001) },
      });

      expect(response.status).toBe(400);
    });

    it('should reject requests with invalid session_id format', async () => {
      const response = await dispatch({
        method: 'POST',
        path: '/v1/request',
        headers: { 'x-api-key': 'test-api-key' },
        body: {
          input: 'Hello',
          session_id: 'not-a-uuid',
        },
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Service unavailable', () => {
    it('should return 503 when registry not loaded', async () => {
      const response = await dispatch({
        method: 'POST',
        path: '/v1/request',
        headers: { 'x-api-key': 'test-api-key' },
        body: { input: 'Hello' },
      });

      expect(response.status).toBe(503);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'Service unavailable',
          message: 'Agent registry not loaded',
        }),
      );
    });
  });
});
