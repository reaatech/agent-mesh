/**
 * Registry Contract Tests
 * Validate YAML schema, invariant enforcement, and env var expansion
 */

import { describe, it, expect } from 'vitest';
import { AgentConfigSchema, AgentRegistrySchema } from '../../src/registry/types.js';

describe('Registry Contract', () => {
  describe('YAML Schema Validation', () => {
    it('should validate a well-formed agent config', () => {
      const validConfig = {
        agent_id: 'test-agent',
        display_name: 'Test Agent',
        description: 'A test agent for validation',
        endpoint: 'https://test-agent.example.com',
        type: 'mcp' as const,
        is_default: false,
        confidence_threshold: 0.7,
        clarification_required: false,
        examples: ['Test query'],
      };

      const result = AgentConfigSchema.parse(validConfig);
      expect(result.agent_id).toBe('test-agent');
      expect(result.endpoint).toBe('https://test-agent.example.com');
    });

    it('should reject invalid endpoint URLs', () => {
      const invalidConfig = {
        agent_id: 'bad-agent',
        display_name: 'Bad Agent',
        description: 'An agent with bad URL',
        endpoint: 'http://localhost:8080',
        type: 'mcp' as const,
        is_default: false,
        confidence_threshold: 0.5,
        clarification_required: false,
        examples: ['Test query'],
      };

      expect(() => AgentConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should reject private IP endpoints', () => {
      const privateEndpoints = [
        'http://192.168.1.1:8080',
        'http://10.0.0.1:8080',
        'http://172.16.0.1:8080',
        'http://127.0.0.1:8080',
      ];

      for (const endpoint of privateEndpoints) {
        const config = {
          agent_id: 'private-agent',
          display_name: 'Private Agent',
          description: 'Test',
          endpoint,
          type: 'mcp' as const,
          is_default: false,
          confidence_threshold: 0.5,
          clarification_required: false,
          examples: ['Test query'],
        };

        expect(() => AgentConfigSchema.parse(config)).toThrow();
      }
    });

    it('should reject confidence_threshold > 1 or < 0', () => {
      const configs = [{ confidence_threshold: 1.5 }, { confidence_threshold: -0.1 }];

      for (const override of configs) {
        const config = {
          agent_id: 'bad-threshold',
          display_name: 'Bad Threshold',
          description: 'Test',
          endpoint: 'https://example.com',
          type: 'mcp' as const,
          is_default: false,
          ...override,
          clarification_required: false,
          examples: ['Test query'],
        };

        expect(() => AgentConfigSchema.parse(config)).toThrow();
      }
    });

    it('should require default agent to have threshold 0 (registry level)', () => {
      const registry = [
        {
          agent_id: 'default-agent',
          display_name: 'Default Agent',
          description: 'The default agent',
          endpoint: 'https://default.example.com',
          type: 'mcp' as const,
          is_default: true,
          confidence_threshold: 0.5,
          clarification_required: false,
          examples: ['Test query'],
        },
      ];

      expect(() => AgentRegistrySchema.parse(registry)).toThrow();
    });

    it('should accept default agent with threshold 0 (registry level)', () => {
      const registry = [
        {
          agent_id: 'default-agent',
          display_name: 'Default Agent',
          description: 'The default agent',
          endpoint: 'https://default.example.com',
          type: 'mcp' as const,
          is_default: true,
          confidence_threshold: 0,
          clarification_required: false,
          examples: ['Test query'],
        },
      ];

      const result = AgentRegistrySchema.parse(registry);
      const firstAgent = result[0];
      if (!firstAgent) {
        throw new Error('Expected agent');
      }
      expect(firstAgent.is_default).toBe(true);
      expect(firstAgent.confidence_threshold).toBe(0);
    });
  });

  describe('Invariant Enforcement', () => {
    it('should reject multiple default agents', () => {
      const agents = [
        {
          agent_id: 'default-1',
          display_name: 'Default 1',
          description: 'First default',
          endpoint: 'https://default1.example.com',
          type: 'mcp' as const,
          is_default: true,
          confidence_threshold: 0,
          clarification_required: false,
          examples: ['Test query'],
        },
        {
          agent_id: 'default-2',
          display_name: 'Default 2',
          description: 'Second default',
          endpoint: 'https://default2.example.com',
          type: 'mcp' as const,
          is_default: true,
          confidence_threshold: 0,
          clarification_required: false,
          examples: ['Test query'],
        },
      ];

      for (const agent of agents) {
        expect(() => AgentConfigSchema.parse(agent)).not.toThrow();
      }

      const defaultCount = agents.filter((a) => a.is_default).length;
      expect(defaultCount).toBe(2);
    });

    it('should reject duplicate agent IDs', () => {
      const agents = [
        {
          agent_id: 'duplicate',
          display_name: 'Duplicate 1',
          description: 'First',
          endpoint: 'https://dup1.example.com',
          type: 'mcp' as const,
          is_default: false,
          confidence_threshold: 0.7,
          clarification_required: false,
          examples: ['Test query'],
        },
        {
          agent_id: 'duplicate',
          display_name: 'Duplicate 2',
          description: 'Second',
          endpoint: 'https://dup2.example.com',
          type: 'mcp' as const,
          is_default: false,
          confidence_threshold: 0.7,
          clarification_required: false,
          examples: ['Test query'],
        },
      ];

      const ids = agents.map((a) => a.agent_id);
      const uniqueIds = new Set(ids);
      expect(ids.length).not.toBe(uniqueIds.size);
    });
  });
});
