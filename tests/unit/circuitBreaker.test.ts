/**
 * Circuit Breaker Unit Tests
 * Test state transitions, exponential backoff, and half-open behavior
 * 
 * Note: Tests the circuit breaker logic directly without importing
 * the singleton to avoid env validation during tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the env module before importing circuit breaker
vi.mock('../../src/config/env.js', () => ({
  env: {
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
    CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 30000,
    CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS: 3,
    CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS: 60000,
  },
}));

// Now import the circuit breaker
import { circuitBreaker } from '../../src/utils/circuitBreaker.js';

describe('Circuit Breaker', () => {
  beforeEach(() => {
    circuitBreaker.clear();
  });

  describe('State Transitions', () => {
    it('should start in CLOSED state', () => {
      const state = circuitBreaker.getState('test-agent');
      expect(state.state).toBe('CLOSED');
    });

    it('should transition to OPEN after exceeding failure threshold', () => {
      // Record failures up to threshold (default is 5)
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('test-agent');
      }

      const state = circuitBreaker.getState('test-agent');
      expect(state.state).toBe('OPEN');
    });

    it('should stay CLOSED when failures below threshold', () => {
      // Record fewer failures than threshold
      for (let i = 0; i < 4; i++) {
        circuitBreaker.recordFailure('test-agent');
      }

      const state = circuitBreaker.getState('test-agent');
      expect(state.state).toBe('CLOSED');
    });

    it('should transition to CLOSED after successful HALF_OPEN calls', () => {
      // Force open
      circuitBreaker.forceState('test-agent', 'OPEN');

      // Wait for reset timeout (simulate with fake timers)
      vi.useFakeTimers();
      vi.advanceTimersByTime(31000); // Default reset timeout is 30s

      // Trigger half-open by calling getState
      const state1 = circuitBreaker.getState('test-agent');
      expect(state1.state).toBe('HALF_OPEN');

      // Record successful calls
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordSuccess('test-agent');
      }

      const state2 = circuitBreaker.getState('test-agent');
      expect(state2.state).toBe('CLOSED');

      vi.useRealTimers();
    });

    it('should transition back to OPEN after failed HALF_OPEN call', () => {
      // Force open
      circuitBreaker.forceState('test-agent', 'OPEN');

      vi.useFakeTimers();
      vi.advanceTimersByTime(31000);

      // Trigger half-open
      const state1 = circuitBreaker.getState('test-agent');
      expect(state1.state).toBe('HALF_OPEN');

      // Record failure
      circuitBreaker.recordFailure('test-agent');

      const state2 = circuitBreaker.getState('test-agent');
      expect(state2.state).toBe('OPEN');

      vi.useRealTimers();
    });
  });

  describe('canCall()', () => {
    it('should allow calls when CLOSED', () => {
      expect(circuitBreaker.canCall('test-agent')).toBe(true);
    });

    it('should block calls when OPEN', () => {
      circuitBreaker.forceState('test-agent', 'OPEN');
      expect(circuitBreaker.canCall('test-agent')).toBe(false);
    });

    it('should allow calls when HALF_OPEN', () => {
      circuitBreaker.forceState('test-agent', 'HALF_OPEN');
      expect(circuitBreaker.canCall('test-agent')).toBe(true);
    });
  });

  describe('Exponential Backoff', () => {
    it('should increase backoff multiplier on repeated failures', () => {
      // Force open multiple times to increase backoff
      circuitBreaker.forceState('test-agent', 'OPEN');
      let state = circuitBreaker.getState('test-agent');
      const initialMultiplier = state.backoff_multiplier ?? 1;

      // Simulate recovery and re-failure
      circuitBreaker.forceState('test-agent', 'CLOSED');
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('test-agent');
      }

      state = circuitBreaker.getState('test-agent');
      expect(state.backoff_multiplier).toBeGreaterThan(initialMultiplier);
    });
  });

  describe('forceState()', () => {
    it('should force state to CLOSED', () => {
      circuitBreaker.forceState('test-agent', 'CLOSED');
      const state = circuitBreaker.getState('test-agent');
      expect(state.state).toBe('CLOSED');
      expect(state.failure_count).toBe(0);
    });

    it('should force state to OPEN', () => {
      circuitBreaker.forceState('test-agent', 'OPEN');
      const state = circuitBreaker.getState('test-agent');
      expect(state.state).toBe('OPEN');
    });

    it('should force state to HALF_OPEN', () => {
      circuitBreaker.forceState('test-agent', 'HALF_OPEN');
      const state = circuitBreaker.getState('test-agent');
      expect(state.state).toBe('HALF_OPEN');
    });
  });

  describe('Multiple Agents', () => {
    it('should maintain separate states for different agents', () => {
      circuitBreaker.forceState('agent-1', 'OPEN');
      circuitBreaker.forceState('agent-2', 'CLOSED');

      expect(circuitBreaker.getState('agent-1').state).toBe('OPEN');
      expect(circuitBreaker.getState('agent-2').state).toBe('CLOSED');
    });
  });
});
