import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/constants.js', () => ({
  CACHE_TTL: {
    CLARIFICATION_MS: 1000,
  },
}));

const { ClarificationCache } = await import('../../src/confidence/clarification.cache.js');

describe('ClarificationCache', () => {
  let cache: InstanceType<typeof ClarificationCache>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new ClarificationCache(1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get/set', () => {
    it('stores and retrieves values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('returns null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('returns null for expired entries', () => {
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeNull();
    });

    it('updates lastAccessed on get', () => {
      cache.set('key1', 'value1');
      const entry1 = cache.get('key1');
      expect(entry1).toBe('value1');
      vi.advanceTimersByTime(500);
      const entry2 = cache.get('key1');
      expect(entry2).toBe('value1');
    });

    it('overwrites existing value', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
    });
  });

  describe('delete', () => {
    it('deletes a key', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });

    it('returns false for missing key', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('allows re-adding after delete', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
    });
  });

  describe('clear', () => {
    it('clears all entries when no active requests', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });

    it('defers clear when active requests exist', () => {
      cache.set('key1', 'value1');
      cache.startRequest();
      cache.clear();
      expect(cache.get('key1')).toBe('value1');
      cache.endRequest();
      expect(cache.get('key1')).toBeNull();
    });

    it('multiple active requests delay clear', () => {
      cache.set('key1', 'value1');
      cache.startRequest();
      cache.startRequest();
      cache.clear();
      expect(cache.getStats().pendingClear).toBe(true);
      cache.endRequest();
      expect(cache.getStats().pendingClear).toBe(true);
      cache.endRequest();
      expect(cache.getStats().pendingClear).toBe(false);
    });
  });

  describe('startRequest / endRequest', () => {
    it('tracks active requests', () => {
      cache.startRequest();
      cache.startRequest();
      const stats = cache.getStats();
      expect(stats.activeRequests).toBe(2);
      cache.endRequest();
      expect(cache.getStats().activeRequests).toBe(1);
    });

    it('does not go below zero', () => {
      cache.endRequest();
      expect(cache.getStats().activeRequests).toBe(0);
    });

    it('endRequest triggers deferred clear', () => {
      cache.set('key1', 'value1');
      cache.startRequest();
      cache.clear();
      expect(cache.get('key1')).toBe('value1');
      cache.endRequest();
      expect(cache.get('key1')).toBeNull();
    });

    it('endRequest does not trigger clear if pendingClear is false', () => {
      cache.set('key1', 'value1');
      cache.startRequest();
      cache.clear();
      cache.endRequest();
      cache.startRequest();
      cache.endRequest();
      expect(cache.get('key1')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('reports size, pendingClear, and activeRequests', () => {
      cache.set('k1', 'v1');
      cache.set('k2', 'v2');
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.pendingClear).toBe(false);
      expect(stats.activeRequests).toBe(0);
    });

    it('reports pendingClear when deferred', () => {
      cache.startRequest();
      cache.clear();
      expect(cache.getStats().pendingClear).toBe(true);
    });

    it('reports zero size after clear', () => {
      cache.set('k1', 'v1');
      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('removes expired entries via interval', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      vi.advanceTimersByTime(1500);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });

    it('cleanup handles empty cache', () => {
      vi.advanceTimersByTime(1500);
      expect(cache.getStats().size).toBe(0);
    });

    it('cleanup preserves non-expired entries', () => {
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(500);
      cache.set('key2', 'value2');
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
    });
  });
});
