import { env } from '@reaatech/agent-mesh';
import type { CircuitBreakerState, CircuitState } from '@reaatech/agent-mesh';

class CircuitBreaker {
  private readonly state = new Map<string, CircuitBreakerState>();
  private readonly failureThreshold = env.CIRCUIT_BREAKER_FAILURE_THRESHOLD;
  private readonly resetTimeoutMs = env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS;
  private readonly halfOpenMaxCalls = env.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS;
  private readonly halfOpenTimeoutMs = env.CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS;

  getState(agentId: string): CircuitBreakerState {
    let current = this.state.get(agentId);
    if (!current) {
      current = this.createInitialState(agentId);
      this.state.set(agentId, current);
    }

    if (current.state === 'OPEN') {
      const elapsed = Date.now() - current.last_state_change;
      const backoffTime = this.resetTimeoutMs * (current.backoff_multiplier ?? 1);
      if (elapsed >= backoffTime) {
        current = this.transitionToHalfOpen(agentId, current);
      }
    }

    if (current.state === 'HALF_OPEN') {
      const elapsed = Date.now() - current.last_state_change;
      if (elapsed >= this.halfOpenTimeoutMs) {
        current = this.transitionToOpen(agentId, current);
      }
    }

    this.state.set(agentId, current);
    return current;
  }

  recordSuccess(agentId: string): void {
    const current = this.getState(agentId);

    if (current.state === 'HALF_OPEN') {
      current.success_count += 1;
      current.half_open_calls += 1;

      if (current.success_count >= this.halfOpenMaxCalls) {
        this.state.set(agentId, this.transitionToClosed(agentId, current));
        return;
      }
    } else {
      current.failure_count = 0;
      current.success_count += 1;
    }

    this.state.set(agentId, current);
  }

  recordFailure(agentId: string): void {
    const current = this.getState(agentId);
    current.failure_count += 1;
    current.last_failure_time = Date.now();

    if (current.state === 'HALF_OPEN' || current.failure_count >= this.failureThreshold) {
      this.state.set(agentId, this.transitionToOpen(agentId, current));
      return;
    }

    this.state.set(agentId, current);
  }

  canCall(agentId: string): boolean {
    const current = this.getState(agentId);
    if (current.state !== 'HALF_OPEN') {
      return current.state !== 'OPEN';
    }

    return current.half_open_calls < this.halfOpenMaxCalls;
  }

  forceState(agentId: string, newState: CircuitState): void {
    const current = this.getState(agentId);
    current.state = newState;
    current.last_state_change = Date.now();

    if (newState === 'CLOSED') {
      current.failure_count = 0;
      current.success_count = 0;
      current.half_open_calls = 0;
      current.backoff_multiplier = 1;
    }

    if (newState === 'HALF_OPEN') {
      current.failure_count = 0;
      current.success_count = 0;
      current.half_open_calls = 0;
    }

    this.state.set(agentId, current);
  }

  getAllStates(): Map<string, CircuitBreakerState> {
    return new Map(this.state);
  }

  setState(state: CircuitBreakerState): void {
    this.state.set(state.agent_id, { ...state });
  }

  setStates(states: Iterable<CircuitBreakerState>): void {
    for (const state of states) {
      this.setState(state);
    }
  }

  clear(): void {
    this.state.clear();
  }

  private createInitialState(agentId: string): CircuitBreakerState {
    return {
      agent_id: agentId,
      state: 'CLOSED',
      failure_count: 0,
      success_count: 0,
      last_state_change: Date.now(),
      half_open_calls: 0,
      backoff_multiplier: 1,
    };
  }

  private transitionToOpen(agentId: string, state: CircuitBreakerState): CircuitBreakerState {
    return {
      ...state,
      agent_id: agentId,
      state: 'OPEN',
      last_state_change: Date.now(),
      half_open_calls: 0,
      success_count: 0,
      backoff_multiplier: Math.min((state.backoff_multiplier ?? 1) * 2, 32),
    };
  }

  private transitionToHalfOpen(agentId: string, state: CircuitBreakerState): CircuitBreakerState {
    return {
      ...state,
      agent_id: agentId,
      state: 'HALF_OPEN',
      last_state_change: Date.now(),
      failure_count: 0,
      success_count: 0,
      half_open_calls: 0,
    };
  }

  private transitionToClosed(agentId: string, state: CircuitBreakerState): CircuitBreakerState {
    return {
      ...state,
      agent_id: agentId,
      state: 'CLOSED',
      last_state_change: Date.now(),
      failure_count: 0,
      success_count: 0,
      half_open_calls: 0,
      backoff_multiplier: 1,
    };
  }
}

export const circuitBreaker = new CircuitBreaker();
