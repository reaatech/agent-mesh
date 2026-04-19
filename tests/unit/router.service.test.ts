import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentConfig } from '../../src/registry/types.js';

const mockClientSendMessage = vi.fn();
const mockRecordSuccess = vi.fn();
const mockRecordFailure = vi.fn();
const mockRecordDuration = vi.fn();
const mockRecordError = vi.fn();
const mockCanCall = vi.fn();

vi.mock('../../src/config/env.js', () => ({
  env: {
    ENABLE_CIRCUIT_BREAKER: true,
  },
}));

vi.mock('../../src/router/mcp.client.js', () => ({
  mcpClientFactory: {
    getClient: () => ({
      sendMessage: mockClientSendMessage,
    }),
  },
}));

vi.mock('../../src/observability/metrics.js', () => ({
  recordAgentDispatchDuration: mockRecordDuration,
  recordAgentDispatchError: mockRecordError,
}));

vi.mock('../../src/utils/circuitBreaker.js', () => ({
  circuitBreaker: {
    canCall: mockCanCall,
    recordSuccess: mockRecordSuccess,
    recordFailure: mockRecordFailure,
  },
}));

const { dispatchToAgent, buildTurnEntry, formatAgentResponse, shouldCloseSession, getUpdatedWorkflowState } =
  await import('../../src/router/router.service.js');

const mockAgent: AgentConfig = {
  agent_id: 'test-agent',
  display_name: 'Test Agent',
  description: 'Test',
  endpoint: 'https://test.example.com',
  type: 'mcp',
  is_default: false,
  confidence_threshold: 0.7,
  clarification_required: false,
  examples: [],
};

describe('dispatchToAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanCall.mockReturnValue(true);
  });

  it('dispatches and returns agent response', async () => {
    mockClientSendMessage.mockResolvedValue({
      content: 'Here is your answer',
      workflow_complete: true,
      workflow_state: { step: 'done' },
    });

    const result = await dispatchToAgent(mockAgent, {
      sessionId: 'sess-1',
      employeeId: 'emp-1',
      displayName: 'Test User',
      rawInput: 'Hello',
      intentSummary: 'Greeting',
      entities: {},
      detectedLanguage: 'en',
      turnHistory: [],
      workflowState: {},
    });

    expect(result.content).toBe('Here is your answer');
    expect(result.workflow_complete).toBe(true);
    expect(result.workflow_state).toEqual({ step: 'done' });
  });

  it('throws on circuit breaker open', async () => {
    mockCanCall.mockReturnValue(false);

    await expect(
      dispatchToAgent(mockAgent, {
        sessionId: 'sess-1',
        employeeId: 'emp-1',
        displayName: 'Test User',
        rawInput: 'Hello',
        intentSummary: 'Greeting',
        entities: {},
        detectedLanguage: 'en',
        turnHistory: [],
        workflowState: {},
      }),
    ).rejects.toThrow('Circuit breaker OPEN for agent test-agent');
  });

  it('records success and duration on successful dispatch', async () => {
    mockClientSendMessage.mockResolvedValue({
      content: 'Success',
      workflow_complete: false,
    });

    await dispatchToAgent(mockAgent, {
      sessionId: 'sess-1',
      employeeId: 'emp-1',
      displayName: 'Test User',
      rawInput: 'Hello',
      intentSummary: 'Greeting',
      entities: {},
      detectedLanguage: 'en',
      turnHistory: [],
      workflowState: {},
    });

    expect(mockRecordSuccess).toHaveBeenCalledWith('test-agent');
    expect(mockRecordDuration).toHaveBeenCalledWith('test-agent', expect.any(Number));
  });

  it('records failure and error on dispatch failure', async () => {
    mockClientSendMessage.mockRejectedValue(new Error('Agent unavailable'));

    await expect(
      dispatchToAgent(mockAgent, {
        sessionId: 'sess-1',
        employeeId: 'emp-1',
        displayName: 'Test User',
        rawInput: 'Hello',
        intentSummary: 'Greeting',
        entities: {},
        detectedLanguage: 'en',
        turnHistory: [],
        workflowState: {},
      }),
    ).rejects.toThrow('Agent unavailable');

    expect(mockRecordFailure).toHaveBeenCalledWith('test-agent');
    expect(mockRecordError).toHaveBeenCalledWith('test-agent', 'Error');
  });

  it('throws on agent error', async () => {
    mockClientSendMessage.mockRejectedValue(new Error('Agent unavailable'));

    await expect(
      dispatchToAgent(mockAgent, {
        sessionId: 'sess-1',
        employeeId: 'emp-1',
        displayName: 'Test User',
        rawInput: 'Hello',
        intentSummary: 'Greeting',
        entities: {},
        detectedLanguage: 'en',
        turnHistory: [],
        workflowState: {},
      }),
    ).rejects.toThrow('Agent unavailable');
  });
});

describe('buildTurnEntry', () => {
  it('builds a user turn entry', () => {
    const entry = buildTurnEntry('user', 'Hello');
    expect(entry.role).toBe('user');
    expect(entry.content).toBe('Hello');
    expect(entry.timestamp).toBeDefined();
    expect(entry.intent_summary).toBeUndefined();
  });

  it('builds an agent turn entry', () => {
    const entry = buildTurnEntry('agent', 'Response text');
    expect(entry.role).toBe('agent');
    expect(entry.content).toBe('Response text');
  });

  it('builds a turn entry with intent_summary', () => {
    const entry = buildTurnEntry('user', 'Hello', 'Greeting');
    expect(entry.intent_summary).toBe('Greeting');
  });

  it('generates ISO timestamp', () => {
    const before = Date.now();
    const entry = buildTurnEntry('user', 'test');
    const after = Date.now();
    expect(new Date(entry.timestamp).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(entry.timestamp).getTime()).toBeLessThanOrEqual(after);
  });
});

describe('formatAgentResponse', () => {
  it('returns the content string', () => {
    expect(formatAgentResponse({ content: 'hello', workflow_complete: true })).toBe('hello');
  });

  it('returns full content string', () => {
    const response = { content: 'This is a longer response text', workflow_complete: false };
    expect(formatAgentResponse(response)).toBe('This is a longer response text');
  });
});

describe('shouldCloseSession', () => {
  it('returns true when workflow_complete is true', () => {
    expect(shouldCloseSession({ content: 'done', workflow_complete: true })).toBe(true);
  });

  it('returns false when workflow_complete is false', () => {
    expect(shouldCloseSession({ content: 'more', workflow_complete: false })).toBe(false);
  });

  it('returns true even with empty content when workflow_complete is true', () => {
    expect(shouldCloseSession({ content: '', workflow_complete: true })).toBe(true);
  });
});

describe('getUpdatedWorkflowState', () => {
  it('returns response workflow_state when present', () => {
    const current = { step: 'old' };
    const result = getUpdatedWorkflowState(current, {
      content: 'ok',
      workflow_complete: false,
      workflow_state: { step: 'new' },
    });
    expect(result).toEqual({ step: 'new' });
  });

  it('returns current state when response has no workflow_state', () => {
    const current = { step: 'old' };
    const result = getUpdatedWorkflowState(current, {
      content: 'ok',
      workflow_complete: false,
    });
    expect(result).toEqual({ step: 'old' });
  });

  it('returns current state when response workflow_state is undefined', () => {
    const current = { step: 'current' };
    const result = getUpdatedWorkflowState(current, {
      content: 'ok',
      workflow_complete: false,
      workflow_state: undefined,
    });
    expect(result).toEqual({ step: 'current' });
  });

  it('merges nested workflow state correctly', () => {
    const current = { step1: 'a', step2: 'b' };
    const result = getUpdatedWorkflowState(current, {
      content: 'ok',
      workflow_complete: false,
      workflow_state: { step2: 'updated', step3: 'new' },
    });
    expect(result).toEqual({ step2: 'updated', step3: 'new' });
  });
});
