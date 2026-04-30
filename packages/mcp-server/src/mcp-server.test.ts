import { describe, expect, it } from 'vitest';
import { getActiveConnectionCount } from './index.js';

describe('@reaatech/agent-mesh-mcp-server', () => {
  it('should export connection counter', () => {
    expect(typeof getActiveConnectionCount).toBe('function');
    expect(getActiveConnectionCount()).toBe(0);
  });
});
