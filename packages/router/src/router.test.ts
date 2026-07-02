import type { AgentConfig } from '@reaatech/agent-mesh-registry';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTurnEntry,
  dispatchToAgent,
  mcpClientFactory,
  registerInProcessAgent,
  resetInProcessAgents,
  shouldCloseSession,
} from './index.js';

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

describe('in-process transport', () => {
  afterEach(() => resetInProcessAgents());

  it('dispatches to a registered in-process handler (no HTTP) with metadata', async () => {
    const agent = {
      agent_id: 'local-agent',
      display_name: 'Local',
      description: 'in-process test agent',
      type: 'inprocess',
      is_default: false,
      confidence_threshold: 0,
      clarification_required: false,
      examples: ['hi'],
    } as AgentConfig;

    registerInProcessAgent('local-agent', (ctx) => ({
      content: `handled ${ctx.raw_input} for org ${ctx.metadata?.orgId}`,
      workflow_complete: true,
    }));

    const res = await dispatchToAgent(agent, {
      sessionId: '00000000-0000-0000-0000-000000000000',
      employeeId: 'emp-1',
      displayName: 'User',
      rawInput: 'ping',
      intentSummary: 'ping',
      entities: {},
      detectedLanguage: 'en',
      turnHistory: [],
      workflowState: {},
      metadata: { orgId: 'org-123' },
    });

    expect(res.content).toBe('handled ping for org org-123');
    expect(res.workflow_complete).toBe(true);
  });
});
