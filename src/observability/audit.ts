/**
 * Audit logging for compliance-critical events
 * Structured format suitable for BigQuery ingestion
 */

import { logger } from './logger.js';

/** Audit event types */
export const AUDIT_EVENTS = {
  // Authentication & Authorization
  AUTH_REQUEST: 'auth.request',
  AUTH_SUCCESS: 'auth.success',
  AUTH_FAILURE: 'auth.failure',
  AUTH_RATE_LIMITED: 'auth.rate_limited',

  // Session Management
  SESSION_CREATED: 'session.created',
  SESSION_CLOSED: 'session.closed',
  SESSION_RESUMED: 'session.resumed',

  // Agent Routing
  AGENT_ROUTED: 'agent.routed',
  AGENT_DISPATCHED: 'agent.dispatched',
  AGENT_FAILED: 'agent.failed',
  AGENT_FALLBACK: 'agent.fallback',

  // Classification
  CLASSIFIER_INVOKED: 'classifier.invoked',
  CLASSIFIER_ERROR: 'classifier.error',
  CLARIFICATION_REQUESTED: 'clarification.requested',

  // Circuit Breaker
  CIRCUIT_BREAKER_OPENED: 'circuit_breaker.opened',
  CIRCUIT_BREAKER_CLOSED: 'circuit_breaker.closed',
  CIRCUIT_BREAKER_HALF_OPEN: 'circuit_breaker.half_open',

  // Security
  SSRF_ATTEMPT: 'security.ssrf_attempt',
  PROMPT_INJECTION: 'security.prompt_injection',
  INVALID_INPUT: 'security.invalid_input',

  // System
  REGISTRY_LOADED: 'system.registry_loaded',
  REGISTRY_RELOAD_FAILED: 'system.registry_reload_failed',
  HEALTH_CHECK_FAILED: 'system.health_check_failed',
} as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];

/** Audit event structure */
export interface AuditEvent {
  /** Event type */
  event_type: AuditEventType;
  /** Timestamp in ISO-8601 */
  timestamp: string;
  /** Request ID for tracing */
  request_id?: string;
  /** Session ID if applicable */
  session_id?: string;
  /** User ID if applicable */
  user_id?: string;
  /** Employee ID if applicable */
  employee_id?: string;
  /** Agent ID if applicable */
  agent_id?: string;
  /** Additional context */
  details?: Record<string, unknown>;
  /** Outcome: success, failure, skipped */
  outcome?: 'success' | 'failure' | 'skipped';
  /** Reason for failure if applicable */
  failure_reason?: string;
}

/**
 * Log an audit event
 * Events are written with 'info' level and include audit marker
 */
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

/**
 * Log authentication request
 */
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

/**
 * Log agent routing decision
 */
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

/**
 * Log circuit breaker state change
 */
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

/**
 * Log security event
 */
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
