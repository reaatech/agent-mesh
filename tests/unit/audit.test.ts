import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInfo = vi.fn();

vi.mock('../../src/observability/logger.js', () => ({
  logger: {
    info: mockInfo,
  },
}));

const {
  logAuditEvent,
  logAuthRequest,
  logAgentRouted,
  logCircuitBreakerChange,
  logSecurityEvent,
  AUDIT_EVENTS,
} = await import('../../src/observability/audit.js');

describe('logAuditEvent', () => {
  beforeEach(() => {
    mockInfo.mockClear();
  });

  it('logs with required fields', () => {
    logAuditEvent({
      event_type: AUDIT_EVENTS.AUTH_SUCCESS,
      timestamp: '2026-01-01T00:00:00Z',
    });

    expect(mockInfo).toHaveBeenCalledTimes(1);
    const calls = mockInfo.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const call = calls[0]!;
    expect(call[0]).toContain('auth.success');
    const meta = call[1] as Record<string, unknown>;
    expect(meta.audit).toBe(true);
    expect(meta.event_type).toBe('auth.success');
  });

  it('includes optional fields when provided', () => {
    logAuditEvent({
      event_type: AUDIT_EVENTS.AGENT_ROUTED,
      timestamp: '2026-01-01T00:00:00Z',
      request_id: 'req-123',
      session_id: 'sess-456',
      user_id: 'user-789',
      employee_id: 'emp-012',
      agent_id: 'agent-345',
      outcome: 'success',
      details: { key: 'value' },
    });

    const calls = mockInfo.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const meta = calls[0]![1] as Record<string, unknown>;
    expect(meta.request_id).toBe('req-123');
    expect(meta.session_id).toBe('sess-456');
    expect(meta.user_id).toBe('user-789');
    expect(meta.employee_id).toBe('emp-012');
    expect(meta.agent_id).toBe('agent-345');
    expect(meta.outcome).toBe('success');
    expect(meta.details).toEqual({ key: 'value' });
  });

  it('uses provided timestamp', () => {
    logAuditEvent({
      event_type: AUDIT_EVENTS.AUTH_FAILURE,
      timestamp: '2026-06-15T12:00:00Z',
    });

    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.timestamp).toBe('2026-06-15T12:00:00Z');
  });

  it('does not include undefined optional fields', () => {
    logAuditEvent({
      event_type: AUDIT_EVENTS.SESSION_CREATED,
      timestamp: '2026-01-01T00:00:00Z',
    });

    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta).not.toHaveProperty('request_id');
    expect(meta).not.toHaveProperty('session_id');
    expect(meta).not.toHaveProperty('outcome');
    expect(meta).not.toHaveProperty('failure_reason');
    expect(meta).not.toHaveProperty('details');
  });
});

describe('logAuthRequest', () => {
  beforeEach(() => {
    mockInfo.mockClear();
  });

  it('logs success event', () => {
    logAuthRequest('req-1', 'success');
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.event_type).toBe('auth.success');
    expect(meta.outcome).toBe('success');
  });

  it('logs failure event', () => {
    logAuthRequest('req-2', 'failure');
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.event_type).toBe('auth.failure');
    expect(meta.outcome).toBe('failure');
  });

  it('includes details when provided', () => {
    logAuthRequest('req-3', 'failure', { reason: 'expired key' });
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.details).toEqual({ reason: 'expired key' });
  });
});

describe('logAgentRouted', () => {
  beforeEach(() => {
    mockInfo.mockClear();
  });

  it('logs routed event for non-fallback', () => {
    logAgentRouted('req-1', 'sess-1', 'agent-1', 0.85, false);
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.event_type).toBe('agent.routed');
    expect(meta.agent_id).toBe('agent-1');
  });

  it('logs fallback event', () => {
    logAgentRouted('req-1', undefined, 'default', 0.3, true);
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.event_type).toBe('agent.fallback');
    expect(meta.details).toEqual({ confidence: 0.3, is_fallback: true });
  });

  it('includes session_id when provided', () => {
    logAgentRouted('req-1', 'sess-1', 'agent-1', 0.9, false);
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.session_id).toBe('sess-1');
  });

  it('omits session_id when undefined', () => {
    logAgentRouted('req-1', undefined, 'agent-1', 0.9, false);
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta).not.toHaveProperty('session_id');
  });
});

describe('logCircuitBreakerChange', () => {
  beforeEach(() => {
    mockInfo.mockClear();
  });

  it('logs opened event', () => {
    logCircuitBreakerChange('agent-1', 'open');
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.event_type).toBe('circuit_breaker.opened');
  });

  it('logs closed event', () => {
    logCircuitBreakerChange('agent-1', 'closed');
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.event_type).toBe('circuit_breaker.closed');
  });

  it('logs half_open event', () => {
    logCircuitBreakerChange('agent-1', 'half_open');
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.event_type).toBe('circuit_breaker.half_open');
  });

  it('includes details when provided', () => {
    logCircuitBreakerChange('agent-1', 'open', { failures: 10 });
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.details).toEqual({ failures: 10 });
  });
});

describe('logSecurityEvent', () => {
  beforeEach(() => {
    mockInfo.mockClear();
  });

  it('logs security event with failure outcome', () => {
    logSecurityEvent(AUDIT_EVENTS.SSRF_ATTEMPT, 'req-1');
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.event_type).toBe('security.ssrf_attempt');
    expect(meta.outcome).toBe('failure');
    expect(meta.request_id).toBe('req-1');
  });

  it('includes details when provided', () => {
    logSecurityEvent(AUDIT_EVENTS.PROMPT_INJECTION, 'req-2', { input: 'malicious' });
    const meta = mockInfo.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.details).toEqual({ input: 'malicious' });
  });
});
