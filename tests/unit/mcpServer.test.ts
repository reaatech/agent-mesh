import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mockHandleInternalRequest = vi.fn();
const mockGetSessionById = vi.fn();

vi.mock('../../src/observability/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../src/gateway/entry.handler.js', () => ({
  handleInternalRequest: (...args: unknown[]) => mockHandleInternalRequest(...args),
}));

vi.mock('../../src/registry/registry.loader.js', () => ({
  registryState: {
    registry: [
      { agent_id: 'default', display_name: 'Default', is_default: true, confidence_threshold: 0 },
    ],
    isLoaded: true,
    getAgentIds: () => ['default'],
  },
}));

vi.mock('../../src/session/session.service.js', () => ({
  getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
}));

const { handleMcpRequest, mcpMiddleware } = await import('../../src/mcp-server/mcpServer.js');

function mockReqRes(body: Record<string, unknown> = {}, path = '/mcp', method = 'POST') {
  const req = {
    body,
    path,
    method,
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
}

describe('handleMcpRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid request (no method)', async () => {
    const { req, res } = mockReqRes({ jsonrpc: '2.0', id: '1' });
    await handleMcpRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: -32600 }),
      }),
    );
  });

  it('returns tools/list', async () => {
    const { req, res } = mockReqRes({
      jsonrpc: '2.0',
      id: '1',
      method: 'tools/list',
    });
    await handleMcpRequest(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          tools: expect.arrayContaining([expect.objectContaining({ name: 'handle_message' })]),
        }),
      }),
    );
  });

  it('returns error for unknown method', async () => {
    const { req, res } = mockReqRes({
      jsonrpc: '2.0',
      id: '2',
      method: 'unknown/method',
    });
    await handleMcpRequest(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: -32601 }),
      }),
    );
  });

  it('handles handle_message tool call', async () => {
    mockHandleInternalRequest.mockResolvedValue({
      status: 200,
      body: { request_id: 'r1', response: 'hello' },
    });

    const { req, res } = mockReqRes({
      jsonrpc: '2.0',
      id: '3',
      method: 'tools/call',
      params: {
        name: 'handle_message',
        arguments: { input: 'Hello' },
      },
    });
    await handleMcpRequest(req, res);
    expect(mockHandleInternalRequest).toHaveBeenCalledWith({
      input: 'Hello',
      session_id: undefined,
      employee_id: undefined,
      display_name: undefined,
      locale: undefined,
      user_id: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          structuredContent: { request_id: 'r1', response: 'hello' },
        }),
      }),
    );
  });

  it('handles get_session_status tool call', async () => {
    mockGetSessionById.mockResolvedValue({ session_id: 's1', status: 'active' });

    const { req, res } = mockReqRes({
      jsonrpc: '2.0',
      id: '4',
      method: 'tools/call',
      params: {
        name: 'get_session_status',
        arguments: { session_id: 's1' },
      },
    });
    await handleMcpRequest(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          structuredContent: { session_id: 's1', status: 'active' },
        }),
      }),
    );
  });

  it('returns not_found for missing session', async () => {
    mockGetSessionById.mockResolvedValue(null);

    const { req, res } = mockReqRes({
      jsonrpc: '2.0',
      id: '5',
      method: 'tools/call',
      params: {
        name: 'get_session_status',
        arguments: { session_id: 'missing' },
      },
    });
    await handleMcpRequest(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          structuredContent: { session_id: 'missing', status: 'not_found' },
        }),
      }),
    );
  });

  it('handles list_agents tool call', async () => {
    const { req, res } = mockReqRes({
      jsonrpc: '2.0',
      id: '6',
      method: 'tools/call',
      params: {
        name: 'list_agents',
        arguments: {},
      },
    });
    await handleMcpRequest(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          structuredContent: expect.objectContaining({
            agents: expect.arrayContaining([expect.objectContaining({ agent_id: 'default' })]),
          }),
        }),
      }),
    );
  });

  it('returns error for unknown tool', async () => {
    const { req, res } = mockReqRes({
      jsonrpc: '2.0',
      id: '7',
      method: 'tools/call',
      params: {
        name: 'nonexistent_tool',
        arguments: {},
      },
    });
    await handleMcpRequest(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: -32602 }),
      }),
    );
  });

  it('returns 500 when handler throws', async () => {
    mockHandleInternalRequest.mockRejectedValue(new Error('boom'));

    const { req, res } = mockReqRes({
      jsonrpc: '2.0',
      id: '8',
      method: 'tools/call',
      params: {
        name: 'handle_message',
        arguments: { input: 'Hello' },
      },
    });
    await handleMcpRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: -32603 }),
      }),
    );
  });
});

describe('mcpMiddleware', () => {
  it('handles /mcp POST requests', async () => {
    const { req, res } = mockReqRes(
      { jsonrpc: '2.0', id: '1', method: 'tools/list' },
      '/mcp',
      'POST',
    );
    const next = vi.fn();
    await mcpMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next for non-/mcp paths', async () => {
    const { req, res } = mockReqRes({}, '/v1/request', 'POST');
    const next = vi.fn();
    await mcpMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next for non-POST on /mcp', async () => {
    const { req, res } = mockReqRes({}, '/mcp', 'GET');
    const next = vi.fn();
    await mcpMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
