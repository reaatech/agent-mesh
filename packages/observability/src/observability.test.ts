import { describe, expect, it } from 'vitest';
import { AUDIT_EVENTS, METRIC_NAMES, logger } from './index.js';

describe('@reaatech/agent-mesh-observability', () => {
  it('should export logger', () => {
    expect(logger).toBeDefined();
    expect(logger.level).toBeDefined();
  });

  it('should export metric names', () => {
    expect(METRIC_NAMES.SESSION_LOOKUP_DURATION).toBeDefined();
  });

  it('should export audit events', () => {
    expect(AUDIT_EVENTS.AUTH_SUCCESS).toBeDefined();
  });
});
