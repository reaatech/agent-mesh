import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/observability/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const { sseHandler, messageHandler, sendToClient, closeSseConnection, getActiveConnectionCount } =
  await import('../../src/mcp-server/orchestrator.mcp.js');

const trackedSessionIds = new Set<string>();

beforeEach(() => {
  for (const sessionId of trackedSessionIds) {
    closeSseConnection(sessionId);
  }
  trackedSessionIds.clear();
});

function createMockReqRes(query: Record<string, string> = {}, body: unknown = {}) {
  const listeners: Record<string, () => void> = {};

  const req = {
    query,
    body,
    on: vi.fn((event: string, handler: () => void) => {
      listeners[event] = handler;
    }),
    triggerClose: () => {
      listeners['close']?.();
    },
  } as unknown as Request & { triggerClose: () => void };

  const written: string[] = [];
  const headers: Record<string, string> = {};

  const res = {
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    write: vi.fn((data: string) => {
      written.push(data);
    }),
    end: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { _written: string[]; _headers: Record<string, string> };

  Object.defineProperty(res, '_written', { get: () => written });
  Object.defineProperty(res, '_headers', { get: () => headers });

  return { req, res };
}

describe('sseHandler', () => {
  it('establishes SSE connection with headers', async () => {
    const sessionId = 'sess-headers';
    trackedSessionIds.add(sessionId);
    const { req, res } = createMockReqRes({ sessionId });
    await sseHandler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
  });

  it('sends initial connected event with sessionId', async () => {
    const sessionId = 'sess-connected';
    trackedSessionIds.add(sessionId);
    const { req, res } = createMockReqRes({ sessionId });
    await sseHandler(req, res);

    expect(res.write).toHaveBeenCalledTimes(1);
    const writeCalls = (res.write as unknown as { mock: { calls: string[][] } }).mock.calls;
    const written = writeCalls[0]![0] as string;
    expect(written).toContain('connected');
  });

  it('uses query sessionId when provided', async () => {
    trackedSessionIds.add('my-session');
    const { req, res } = createMockReqRes({ sessionId: 'my-session' });
    await sseHandler(req, res);

    const writeCalls = (res.write as unknown as { mock: { calls: string[][] } }).mock.calls;
    const written = writeCalls[0]![0] as string;
    expect(written).toContain('my-session');
  });

  it('removes connection on client close', async () => {
    const sessionId = 'sess-close-on-client';
    trackedSessionIds.add(sessionId);
    const { req, res } = createMockReqRes({ sessionId });
    await sseHandler(req, res);
    expect(getActiveConnectionCount()).toBe(1);

    req.triggerClose();
    expect(getActiveConnectionCount()).toBe(0);
  });
});

describe('sendToClient', () => {
  it('returns false when no connection exists', () => {
    expect(sendToClient('nonexistent', { test: true })).toBe(false);
  });

  it('sends message to connected client', async () => {
    trackedSessionIds.add('sess-1');
    const { req, res } = createMockReqRes({ sessionId: 'sess-1' });
    await sseHandler(req, res);

    const result = sendToClient('sess-1', { type: 'response', data: 'hello' });
    expect(result).toBe(true);
    expect(res.write).toHaveBeenCalledTimes(2);
  });
});

describe('messageHandler', () => {
  it('returns 400 when sessionId is missing', async () => {
    const { req, res } = createMockReqRes({}, { type: 'message' });
    await messageHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('delivers message to SSE client', async () => {
    trackedSessionIds.add('sess-1');
    const { req: sseReq, res: sseRes } = createMockReqRes({ sessionId: 'sess-1' });
    await sseHandler(sseReq, sseRes);

    const { req, res } = createMockReqRes({ sessionId: 'sess-1' }, { payload: 'data' });
    await messageHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        delivered: true,
        sessionId: 'sess-1',
      }),
    );
  });

  it('returns delivered: false when no SSE connection', async () => {
    const { req, res } = createMockReqRes({ sessionId: 'no-conn' }, { payload: 'data' });
    await messageHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        delivered: false,
      }),
    );
  });
});

describe('closeSseConnection', () => {
  it('returns false for nonexistent connection', () => {
    expect(closeSseConnection('nonexistent')).toBe(false);
  });

  it('closes and removes existing connection', async () => {
    trackedSessionIds.add('sess-close');
    const { req, res } = createMockReqRes({ sessionId: 'sess-close' });
    await sseHandler(req, res);

    expect(closeSseConnection('sess-close')).toBe(true);
    expect(res.end).toHaveBeenCalled();
    expect(getActiveConnectionCount()).toBe(0);
  });
});
