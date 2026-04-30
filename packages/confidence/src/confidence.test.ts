import { describe, expect, it } from 'vitest';
import { clarificationCache } from './index.js';

describe('@reaatech/agent-mesh-confidence', () => {
  it('should export clarification cache', () => {
    expect(clarificationCache).toBeDefined();
  });

  it('should cache and retrieve values', () => {
    clarificationCache.set('test-key', 'test-value');
    expect(clarificationCache.get('test-key')).toBe('test-value');
    clarificationCache.delete('test-key');
  });

  it('should report stats', () => {
    const stats = clarificationCache.getStats();
    expect(stats.size).toBeGreaterThanOrEqual(0);
  });
});
