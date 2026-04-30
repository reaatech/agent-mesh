import { logger } from './logger.js';

export const AUDIT_EVENTS = {
  AUTH_REQUEST: 'auth.request',
  AUTH_SUCCESS: 'auth.success',
  AUTH_FAILURE: 'auth.failure',
  AUTH_RATE_LIMITED: 'auth.rate_limited',

  SESSION_CREATED: 'session.created',
  SESSION_CLOSED: 'session.closed',
  SESSION_RESUMED: 'session.resumed',

  AGENT_ROUTED: 'agent.routed',
  AGENT_DISPATCHED: 'agent.dispatched',
  AGENT_FAILED: 'agent.failed',
  AGENT_FALLBACK: 'agent.fallback',

  CLASSIFIER_INVOKED: 'classifier.invoked',
  CLASSIFIER_ERROR: 'classifier.error',
  CLARIFICATION_REQUESTED: 'clarification.requested',

  CIRCUIT_BREAKER_OPENED: 'circuit_breaker.opened',
  CIRCUIT_BREAKER_CLOSED: 'circuit_breaker.closed',
  CIRCUIT_BREAKER_HALF_OPEN: 'circuit_breaker.half_open',

  SSRF_ATTEMPT: 'security.ssrf_attempt',
  PROMPT_INJECTION: 'security.prompt_injection',
  INVALID_INPUT: 'security.invalid_input',

  REGISTRY_LOADED: 'system.registry_loaded',
  REGISTRY_RELOAD_FAILED: 'system.registry_reload_failed',
  HEALTH_CHECK_FAILED: 'system.health_check_failed',
} as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];

export interface AuditEvent {
  event_type: AuditEventType;
  timestamp: string;
  request_id?: string;
  session_id?: string;
  user_id?: string;
  employee_id?: string;
  agent_id?: string;
  details?: Record<string, unknown>;
  outcome?: 'success' | 'failure' | 'skipped';
  failure_reason?: string;
}

export function logAuditEvent(event: AuditEvent): void {
  const auditEntry: Record<string, unknown> = {
    audit: true,
    event_type: event.event_type,
    timestamp: event.timestamp || new Date().toISOString(),
  };

  if (event.request_id !== undefined) {
    auditEntry.request_id = event.request_id;
  }
  if (event.session_id !== undefined) {
    auditEntry.session_id = event.session_id;
  }
  if (event.user_id !== undefined) {
    auditEntry.user_id = event.user_id;
  }
  if (event.employee_id !== undefined) {
    auditEntry.employee_id = event.employee_id;
  }
  if (event.agent_id !== undefined) {
    auditEntry.agent_id = event.agent_id;
  }
  if (event.outcome !== undefined) {
    auditEntry.outcome = event.outcome;
  }
  if (event.failure_reason !== undefined) {
    auditEntry.failure_reason = event.failure_reason;
  }
  if (event.details !== undefined) {
    auditEntry.details = event.details;
  }

  logger.info(`Audit: ${event.event_type}`, auditEntry);
}

export function logAuthRequest(
  requestId: string,
  outcome: 'success' | 'failure',
  details?: Record<string, unknown>,
): void {
  const event: AuditEvent = {
    event_type: outcome === 'success' ? AUDIT_EVENTS.AUTH_SUCCESS : AUDIT_EVENTS.AUTH_FAILURE,
    timestamp: new Date().toISOString(),
    request_id: requestId,
    outcome,
  };
  if (details !== undefined) {
    event.details = details;
  }
  logAuditEvent(event);
}

export function logAgentRouted(
  requestId: string,
  sessionId: string | undefined,
  agentId: string,
  confidence: number,
  isFallback: boolean,
): void {
  const event: AuditEvent = {
    event_type: isFallback ? AUDIT_EVENTS.AGENT_FALLBACK : AUDIT_EVENTS.AGENT_ROUTED,
    timestamp: new Date().toISOString(),
    request_id: requestId,
    agent_id: agentId,
    outcome: 'success',
    details: { confidence, is_fallback: isFallback },
  };
  if (sessionId !== undefined) {
    event.session_id = sessionId;
  }
  logAuditEvent(event);
}

export function logCircuitBreakerChange(
  agentId: string,
  newState: 'open' | 'closed' | 'half_open',
  details?: Record<string, unknown>,
): void {
  const eventType =
    newState === 'open'
      ? AUDIT_EVENTS.CIRCUIT_BREAKER_OPENED
      : newState === 'closed'
        ? AUDIT_EVENTS.CIRCUIT_BREAKER_CLOSED
        : AUDIT_EVENTS.CIRCUIT_BREAKER_HALF_OPEN;

  const event: AuditEvent = {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    agent_id: agentId,
    outcome: 'success',
  };
  if (details !== undefined) {
    event.details = details;
  }
  logAuditEvent(event);
}

export function logSecurityEvent(
  eventType: AuditEventType,
  requestId: string,
  details?: Record<string, unknown>,
): void {
  const event: AuditEvent = {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    request_id: requestId,
    outcome: 'failure',
  };
  if (details !== undefined) {
    event.details = details;
  }
  logAuditEvent(event);
}
