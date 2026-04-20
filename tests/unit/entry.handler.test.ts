import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mockClassify = vi.fn();
const mockDispatchToAgent = vi.fn();
const mockGetActiveSession = vi.fn();
const mockCreateSession = vi.fn();
const mockAppendTurn = vi.fn();
const mockUpdateWorkflowState = vi.fn();
const mockCloseSession = vi.fn();
const mockGetSessionById = vi.fn();
const mockResolveSlackProfile = vi.fn();

vi.mock('../../src/classifier/classifier.service.js', () => ({
  classifierService: {
    classify: (...args: unknown[]) => mockClassify(...args),
    isMock: () => true,
  },
}));

vi.mock('../../src/confidence/confidence.gate.js', () => ({
  evaluateConfidenceGate: (output: unknown) => ({
    action: 'route',
    agent_id: (output as { agent_id: string }).agent_id,
    confidence: 0.9,
    reason: 'Test route',
  }),
}));

vi.mock('../../src/router/router.service.js', () => ({
  dispatchToAgent: (...args: unknown[]) => mockDispatchToAgent(...args),
}));

vi.mock('../../src/session/session.service.js', () => ({
  getActiveSession: (...args: unknown[]) => mockGetActiveSession(...args),
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  appendTurn: (...args: unknown[]) => mockAppendTurn(...args),
  updateWorkflowState: (...args: unknown[]) => mockUpdateWorkflowState(...args),
  closeSession: (...args: unknown[]) => mockCloseSession(...args),
  getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
}));

vi.mock('../../src/session/firestoreClient.js', () => ({
  getFirestore: vi.fn(),
}));

vi.mock('../../src/gateway/slackProfile.resolver.js', () => ({
  resolveSlackProfile: (...args: unknown[]) => mockResolveSlackProfile(...args),
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    ENABLE_SESSION_BYPASS: true,
    PORT: 8080,
    GOOGLE_CLOUD_PROJECT: 'test-project',
  },
}));

vi.mock('../../src/registry/registry.loader.js', () => {
  const registry = [
    {
      agent_id: 'default',
      display_name: 'Default',
      description: 'Default agent',
      endpoint: 'https://default.example.com',
      type: 'mcp',
      is_default: true,
      confidence_threshold: 0,
      clarification_required: false,
      examples: [],
    },
    {
      agent_id: 'specialist',
      display_name: 'Specialist',
      description: 'Specialist agent',
      endpoint: 'https://specialist.example.com',
      type: 'mcp',
      is_default: false,
      confidence_threshold: 0.7,
      clarification_required: false,
      examples: [],
    },
  ];
  return {
    registryState: {
      isLoaded: true,
      registry,
      getAgent: (id: string) => registry.find((a) => a.agent_id === id),
      getAgentIds: () => registry.map((a) => a.agent_id),
      defaultAgent: registry.find((a) => a.is_default),
    },
  };
});

vi.mock('../../src/config/constants.js', () => ({
  SERVICE_NAME: 'agent-mesh',
  SERVICE_VERSION: '1.0.0',
  MAX_REQUEST_BODY_SIZE: '1mb',
  HEALTH_CHECK_COLLECTION: 'health_checks',
}));

const { healthCheck, deepHealthCheck, handleRequest, handleInternalRequest } =
  await import('../../src/gateway/entry.handler.js');

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = {
    body,
    headers: {},
    path: '/v1/request',
    apiKey: undefined,
  } as unknown as Request & { apiKey?: string };

  const json = vi.fn().mockReturnThis();
  const res = {
    status: vi.fn().mockReturnThis(),
    json,
  } as unknown as Response;

  return { req, res };
}

describe('healthCheck', () => {
  it('returns healthy status', () => {
    const { req, res } = mockReqRes();
    healthCheck(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'healthy',
        service: 'agent-mesh',
        version: '1.0.0',
      }),
    );
  });
});

describe('deepHealthCheck', () => {
  it('returns healthy with loaded registry', async () => {
    const { req, res } = mockReqRes();

    const { getFirestore } = await import('../../src/session/firestoreClient.js');
    (getFirestore as ReturnType<typeof vi.fn>).mockReturnValue({
      collection: () => ({ limit: () => ({ get: () => Promise.resolve({}) }) }),
    });

    await deepHealthCheck(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        checks: expect.objectContaining({
          registry: expect.objectContaining({ status: 'pass' }),
        }),
      }),
    );
  });

  it('returns degraded when Firestore is unreachable', async () => {
    const { req, res } = mockReqRes();

    const { getFirestore } = await import('../../src/session/firestoreClient.js');
    (getFirestore as ReturnType<typeof vi.fn>).mockReturnValue({
      collection: () => ({ limit: () => ({ get: () => Promise.reject(new Error('down')) }) }),
    });

    await deepHealthCheck(req, res);
    const calls = (res.json as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const call = calls[0]![0] as Record<string, unknown>;
    const checks = call.checks as Record<string, { status: string }>;
    expect(checks?.firestore?.status).toBe('fail');
  });
});

describe('handleRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid request body', async () => {
    const { req, res } = mockReqRes({});
    await handleRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for empty input', async () => {
    const { req, res } = mockReqRes({ input: '' });
    await handleRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 503 when registry not loaded', async () => {
    vi.doMock('../../src/registry/registry.loader.js', () => ({
      registryState: { isLoaded: false, registry: null },
    }));

    const { req, res } = mockReqRes({ input: 'Hello' });
    await handleRequest(req, res);
  });
});

describe('handleInternalRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveSession.mockResolvedValue(null);
    mockClassify.mockResolvedValue({
      agent_id: 'specialist',
      confidence: 0.9,
      ambiguous: false,
      detected_language: 'en',
      intent_summary: 'User wants help',
      entities: {},
    });
    mockCreateSession.mockResolvedValue({
      session_id: 'sess-1',
      user_id: 'emp-1',
      employee_id: 'emp-1',
      status: 'active',
      active_agent: 'specialist',
      turn_history: [],
      workflow_state: {},
    });
    mockDispatchToAgent.mockResolvedValue({
      content: 'Here is your answer',
      workflow_complete: true,
      workflow_state: { step: 'done' },
    });
    mockAppendTurn.mockResolvedValue(undefined);
    mockUpdateWorkflowState.mockResolvedValue(undefined);
    mockCloseSession.mockResolvedValue(undefined);
  });

  it('processes a valid request end-to-end', async () => {
    const result = await handleInternalRequest({
      input: 'Reset my password',
      employee_id: 'emp-1',
      display_name: 'Test User',
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual(
      expect.objectContaining({
        agent_id: 'specialist',
        response: 'Here is your answer',
        workflow_complete: true,
      }),
    );
  });

  it('creates session for authenticated user', async () => {
    await handleInternalRequest({
      input: 'Hello',
      employee_id: 'emp-1',
    });
    expect(mockCreateSession).toHaveBeenCalled();
  });

  it('closes session when workflow_complete is true', async () => {
    await handleInternalRequest({
      input: 'Hello',
      employee_id: 'emp-1',
    });
    expect(mockCloseSession).toHaveBeenCalledWith('sess-1', 'completed');
  });

  it('handles Slack entry point', async () => {
    mockResolveSlackProfile.mockResolvedValue({
      employee_id: 'slack-emp',
      display_name: 'Slack User',
      email: 'slack@example.com',
    });

    await handleInternalRequest({
      input: 'Hello from Slack',
      employee_id: 'emp-1',
      entry_point: 'slack',
      slack_user_id: 'U123',
    });

    expect(mockResolveSlackProfile).toHaveBeenCalledWith('U123');
  });

  it('uses session bypass when active session exists', async () => {
    mockGetActiveSession.mockResolvedValue({
      session_id: 'active-sess',
      active_agent: 'specialist',
      turn_history: [],
      workflow_state: {},
    });

    const result = await handleInternalRequest({
      input: 'Follow-up question',
      employee_id: 'emp-1',
    });

    expect(result.status).toBe(200);
    expect(mockClassify).not.toHaveBeenCalled();
  });
});
