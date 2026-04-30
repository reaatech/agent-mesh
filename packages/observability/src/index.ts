export { logger, createChildLogger } from './logger.js';
export { initOtel, shutdownOtel } from './otel.js';
export {
  getMeterProvider,
  getMeter,
  recordSessionLookupDuration,
  recordClarification,
  recordAgentDispatchDuration,
  recordAgentDispatchError,
  METRIC_NAMES,
  CIRCUIT_BREAKER_STATES,
} from './metrics.js';
export {
  logAuditEvent,
  logAuthRequest,
  logAgentRouted,
  logCircuitBreakerChange,
  logSecurityEvent,
  AUDIT_EVENTS,
} from './audit.js';
export type { AuditEvent, AuditEventType } from './audit.js';
