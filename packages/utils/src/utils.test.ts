import type { CircuitBreakerState } from '@reaatech/agent-mesh';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryBreakerStore, resetBreakerStore, setBreakerStore } from './breaker.store.js';
import { circuitBreaker, loadCircuitBreakerState, persistCircuitBreakerState } from './index.js';

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

describe('BreakerStore (injected InMemory backend)', () => {
  afterEach(() => resetBreakerStore());

  it('persists and loads breaker state through the module functions', async () => {
    setBreakerStore(new InMemoryBreakerStore());

    const state: CircuitBreakerState = {
      agent_id: 'agent-x',
      state: 'OPEN',
      failure_count: 5,
      success_count: 0,
      last_state_change: Date.now(),
      half_open_calls: 0,
      backoff_multiplier: 2,
    };

    expect(await loadCircuitBreakerState('agent-x')).toBeNull();
    await persistCircuitBreakerState(state);
    const loaded = await loadCircuitBreakerState('agent-x');
    expect(loaded?.state).toBe('OPEN');
    expect(loaded?.failure_count).toBe(5);
  });
});
