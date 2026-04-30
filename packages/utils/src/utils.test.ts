import { describe, it, expect } from 'vitest';
import { circuitBreaker } from './index.js';

describe('@reaatech/agent-mesh-utils', () => {
  it('should export circuitBreaker singleton', () => {
    expect(circuitBreaker).toBeDefined();
    expect(typeof circuitBreaker.canCall).toBe('function');
  });

  it('should default to closed state', () => {
    const state = circuitBreaker.getState('test-agent');
    expect(state.state).toBe('CLOSED');
  });

  it('should allow calls when closed', () => {
    expect(circuitBreaker.canCall('test-agent-2')).toBe(true);
  });
});
