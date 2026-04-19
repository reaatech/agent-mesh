import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockReloadRegistry = vi.fn().mockResolvedValue({
  success: true,
  agentCount: 3,
  agentIds: ['a', 'b', 'c'],
  defaultAgentId: 'a',
  errors: [],
  warnings: [],
});

vi.mock('../../src/registry/registry.loader.js', () => ({
  reloadRegistry: mockReloadRegistry,
}));

vi.mock('../../src/observability/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    LOG_LEVEL: 'info',
  },
}));

const { setupSighupHandler, triggerReload, isReloadPending, cleanupSighupHandler } = await import(
  '../../src/registry/sighup.js'
);

describe('SIGHUP Handler', () => {
  beforeEach(() => {
    cleanupSighupHandler();
    vi.clearAllMocks();
    mockReloadRegistry.mockResolvedValue({
      success: true,
      agentCount: 3,
      agentIds: ['a', 'b', 'c'],
      defaultAgentId: 'a',
      errors: [],
      warnings: [],
    });
  });

  afterEach(() => {
    cleanupSighupHandler();
  });

  describe('setupSighupHandler', () => {
    it('sets up handler without throwing', () => {
      expect(() => setupSighupHandler(100)).not.toThrow();
    });

    it('sets up handler with default debounce', () => {
      expect(() => setupSighupHandler()).not.toThrow();
    });

    it('registers SIGHUP event listener', () => {
      setupSighupHandler(100);
      const listeners = process.listeners('SIGHUP');
      expect(listeners.length).toBeGreaterThan(0);
    });
  });

  describe('triggerReload', () => {
    it('calls reloadRegistry immediately', async () => {
      await triggerReload();
      expect(mockReloadRegistry).toHaveBeenCalled();
    });

    it('handles failed reload gracefully without throwing', async () => {
      mockReloadRegistry.mockResolvedValueOnce({
        success: false,
        agentCount: 0,
        agentIds: [],
        defaultAgentId: null,
        errors: ['Load failed'],
        warnings: [],
      });

      await expect(triggerReload()).resolves.toBeUndefined();
    });

    it('clears any pending debounce timer', async () => {
      setupSighupHandler(10000);
      await triggerReload();
      expect(mockReloadRegistry).toHaveBeenCalled();
    });
  });

  describe('isReloadPending', () => {
    it('returns false initially', () => {
      expect(isReloadPending()).toBe(false);
    });

    it('returns true after SIGHUP is received', async () => {
      setupSighupHandler(100);
      process.emit('SIGHUP');
      expect(isReloadPending()).toBe(true);
    });
  });

  describe('cleanupSighupHandler', () => {
    it('does not throw when no handler is set', () => {
      expect(() => cleanupSighupHandler()).not.toThrow();
    });

    it('clears debounce timer', () => {
      setupSighupHandler(10000);
      cleanupSighupHandler();
      expect(() => cleanupSighupHandler()).not.toThrow();
    });

    it('handles multiple cleanupSighupHandler calls', () => {
      cleanupSighupHandler();
      cleanupSighupHandler();
      expect(() => cleanupSighupHandler()).not.toThrow();
    });
  });

  describe('debounce behavior', () => {
    it('coalesces multiple SIGHUP signals', async () => {
      vi.useFakeTimers();

      setupSighupHandler(1000);

      process.emit('SIGHUP');
      process.emit('SIGHUP');
      process.emit('SIGHUP');

      expect(isReloadPending()).toBe(true);

      mockReloadRegistry.mockResolvedValueOnce({
        success: true,
        agentCount: 3,
        agentIds: ['a', 'b', 'c'],
        defaultAgentId: 'a',
        errors: [],
        warnings: [],
      });

      await vi.advanceTimersByTimeAsync(1001);

      expect(mockReloadRegistry).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('reload happens after debounce window', async () => {
      vi.useFakeTimers();

      setupSighupHandler(500);

      process.emit('SIGHUP');

      await vi.advanceTimersByTimeAsync(501);

      expect(mockReloadRegistry).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
