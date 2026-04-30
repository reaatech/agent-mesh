import { ValueType } from '@opentelemetry/api';
import { MeterProvider } from '@opentelemetry/sdk-metrics';

export const METRIC_NAMES = {
  SESSION_LOOKUP_DURATION: 'session.lookup.duration_ms',
  CONFIDENCE_CLARIFICATION_COUNT: 'confidence.clarification.count',
  CIRCUIT_BREAKER_STATE: 'circuit_breaker.state',
  AGENT_DISPATCH_DURATION: 'agent.dispatch.duration_ms',
  AGENT_DISPATCH_ERRORS: 'agent.dispatch.errors',
} as const;

export const CIRCUIT_BREAKER_STATES = {
  CLOSED: 0,
  OPEN: 1,
  HALF_OPEN: 2,
} as const;

let _meterProvider: MeterProvider | null = null;

export function getMeterProvider(): MeterProvider {
  if (!_meterProvider) {
    _meterProvider = new MeterProvider();
  }
  return _meterProvider;
}

export function getMeter() {
  return getMeterProvider().getMeter('agent-mesh');
}

export function recordSessionLookupDuration(durationMs: number, hit: boolean): void {
  const meter = getMeter();
  const histogram = meter.createHistogram(METRIC_NAMES.SESSION_LOOKUP_DURATION, {
    description: 'Session lookup latency in milliseconds',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  });
  histogram.record(durationMs, { hit: hit.toString() });
}

export function recordClarification(agentId: string): void {
  const meter = getMeter();
  const counter = meter.createCounter(METRIC_NAMES.CONFIDENCE_CLARIFICATION_COUNT, {
    description: 'Number of clarification questions generated',
  });
  counter.add(1, { agent_id: agentId });
}

export function recordAgentDispatchDuration(agentId: string, durationMs: number): void {
  const meter = getMeter();
  const histogram = meter.createHistogram(METRIC_NAMES.AGENT_DISPATCH_DURATION, {
    description: 'Agent dispatch latency in milliseconds',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  });
  histogram.record(durationMs, { agent_id: agentId });
}

export function recordAgentDispatchError(agentId: string, errorType: string): void {
  const meter = getMeter();
  const counter = meter.createCounter(METRIC_NAMES.AGENT_DISPATCH_ERRORS, {
    description: 'Number of agent dispatch errors',
  });
  counter.add(1, { agent_id: agentId, error_type: errorType });
}
