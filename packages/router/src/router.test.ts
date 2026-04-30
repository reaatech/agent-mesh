import { describe, expect, it } from 'vitest';
import { buildTurnEntry, mcpClientFactory, shouldCloseSession } from './index.js';

describe('@reaatech/agent-mesh-router', () => {
  it('should export client factory', () => {
    expect(mcpClientFactory).toBeDefined();
    expect(typeof mcpClientFactory.getClient).toBe('function');
  });

  it('should build turn entries', () => {
    const turn = buildTurnEntry('user', 'hello');
    expect(turn.role).toBe('user');
    expect(turn.content).toBe('hello');
    expect(turn.timestamp).toBeDefined();
  });

  it('should detect workflow complete', () => {
    expect(shouldCloseSession({ content: 'done', workflow_complete: true })).toBe(true);
    expect(shouldCloseSession({ content: 'cont', workflow_complete: false })).toBe(false);
  });
});
