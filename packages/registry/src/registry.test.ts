import { describe, it, expect } from 'vitest';
import { AgentConfigSchema, AgentRegistrySchema } from './index.js';

describe('@reaatech/agent-mesh-registry', () => {
  it('should validate a valid agent config', () => {
    const result = AgentConfigSchema.safeParse({
      agent_id: 'test-agent',
      display_name: 'Test Agent',
      description: 'A test agent',
      endpoint: 'https://test.example.com',
      type: 'mcp',
      is_default: false,
      confidence_threshold: 0.7,
      clarification_required: false,
      examples: ['test query'],
    });
    expect(result.success).toBe(true);
  });

  it('should enforce exactly one default agent', () => {
    const agents = [
      { agent_id: 'a', display_name: 'A', description: '...', endpoint: 'https://a.example.com', type: 'mcp' as const, is_default: true, confidence_threshold: 0, clarification_required: false, examples: ['x'] },
      { agent_id: 'b', display_name: 'B', description: '...', endpoint: 'https://b.example.com', type: 'mcp' as const, is_default: true, confidence_threshold: 0, clarification_required: false, examples: ['y'] },
    ];
    const result = AgentRegistrySchema.safeParse(agents);
    expect(result.success).toBe(false);
  });
});
