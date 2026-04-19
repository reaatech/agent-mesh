/**
 * Routing Contract Tests
 * Validate confidence gate decision tree and routing correctness
 */

import { describe, it, expect } from 'vitest';
import type { AgentConfig } from '../../src/registry/types.js';
import type { ClassifierOutput } from '../../src/types/domain.js';

// Simplified confidence gate logic for testing
function evaluateRouting(
  classifierOutput: ClassifierOutput,
  agents: AgentConfig[]
): { action: string; agent_id: string } {
  const defaultAgent = agents.find((a) => a.is_default);
  const matchedAgent = agents.find((a) => a.agent_id === classifierOutput.agent_id);

  // Rule 1: Unknown agent_id → route to default
  if (!matchedAgent) {
    return { action: 'route_to_default', agent_id: defaultAgent!.agent_id };
  }

  // Rule 2: Default agent → always route directly
  if (matchedAgent.is_default) {
    return { action: 'route_direct', agent_id: matchedAgent.agent_id };
  }

  // Rule 3: Confidence ≥ threshold AND not ambiguous → route to matched agent
  if (
    classifierOutput.confidence >= matchedAgent.confidence_threshold &&
    !classifierOutput.ambiguous
  ) {
    return { action: 'route_to_agent', agent_id: matchedAgent.agent_id };
  }

  // Rule 4: clarification_required → generate clarification
  if (matchedAgent.clarification_required) {
    return { action: 'clarify', agent_id: matchedAgent.agent_id };
  }

  // Rule 5: Otherwise → fall back to default
  return { action: 'fallback_to_default', agent_id: defaultAgent!.agent_id };
}

describe('Routing Contract', () => {
  const defaultAgent: AgentConfig = {
    agent_id: 'default',
    display_name: 'Default Agent',
    description: 'Default fallback agent',
    endpoint: 'https://default.example.com',
    type: 'mcp',
    is_default: true,
    confidence_threshold: 0,
    clarification_required: false,
    examples: [],
  };

  const specialistAgent: AgentConfig = {
    agent_id: 'specialist',
    display_name: 'Specialist Agent',
    description: 'Specialized agent for specific tasks',
    endpoint: 'https://specialist.example.com',
    type: 'mcp',
    is_default: false,
    confidence_threshold: 0.7,
    clarification_required: false,
    examples: ['Specialist query'],
  };

  const clarificationAgent: AgentConfig = {
    agent_id: 'clarifier',
    display_name: 'Clarifying Agent',
    description: 'Agent that requires clarification',
    endpoint: 'https://clarifier.example.com',
    type: 'mcp',
    is_default: false,
    confidence_threshold: 0.5,
    clarification_required: true,
    examples: ['Clarify this'],
  };

  const agents = [defaultAgent, specialistAgent, clarificationAgent];

  describe('Decision Tree', () => {
    it('Rule 1: should route to default for unknown agent_id', () => {
      const output: ClassifierOutput = {
        agent_id: 'unknown-agent',
        confidence: 0.9,
        ambiguous: false,
        detected_language: 'en',
        intent_summary: 'Test',
        entities: {},
      };

      const result = evaluateRouting(output, agents);
      expect(result.action).toBe('route_to_default');
      expect(result.agent_id).toBe('default');
    });

    it('Rule 2: should always route directly to default agent', () => {
      const output: ClassifierOutput = {
        agent_id: 'default',
        confidence: 0.1,
        ambiguous: false,
        detected_language: 'en',
        intent_summary: 'Test',
        entities: {},
      };

      const result = evaluateRouting(output, agents);
      expect(result.action).toBe('route_direct');
      expect(result.agent_id).toBe('default');
    });

    it('Rule 3: should route to specialist when confidence >= threshold', () => {
      const output: ClassifierOutput = {
        agent_id: 'specialist',
        confidence: 0.8,
        ambiguous: false,
        detected_language: 'en',
        intent_summary: 'Specialist task',
        entities: {},
      };

      const result = evaluateRouting(output, agents);
      expect(result.action).toBe('route_to_agent');
      expect(result.agent_id).toBe('specialist');
    });

    it('Rule 3: should not route when confidence < threshold', () => {
      const output: ClassifierOutput = {
        agent_id: 'specialist',
        confidence: 0.5,
        ambiguous: false,
        detected_language: 'en',
        intent_summary: 'Uncertain',
        entities: {},
      };

      const result = evaluateRouting(output, agents);
      expect(result.action).toBe('fallback_to_default');
    });

    it('Rule 3: should not route when ambiguous even with high confidence', () => {
      const output: ClassifierOutput = {
        agent_id: 'specialist',
        confidence: 0.9,
        ambiguous: true,
        detected_language: 'en',
        intent_summary: 'Ambiguous',
        entities: {},
      };

      const result = evaluateRouting(output, agents);
      expect(result.action).toBe('fallback_to_default');
    });

    it('Rule 4: should clarify when clarification_required and low confidence', () => {
      const output: ClassifierOutput = {
        agent_id: 'clarifier',
        confidence: 0.3,
        ambiguous: false,
        detected_language: 'en',
        intent_summary: 'Needs clarification',
        entities: {},
      };

      const result = evaluateRouting(output, agents);
      expect(result.action).toBe('clarify');
    });
  });

  describe('Confidence Threshold Enforcement', () => {
    it('should enforce exact threshold boundary', () => {
      const output: ClassifierOutput = {
        agent_id: 'specialist',
        confidence: 0.7, // Exactly at threshold
        ambiguous: false,
        detected_language: 'en',
        intent_summary: 'Boundary test',
        entities: {},
      };

      const result = evaluateRouting(output, agents);
      expect(result.action).toBe('route_to_agent');
    });

    it('should reject just below threshold', () => {
      const output: ClassifierOutput = {
        agent_id: 'specialist',
        confidence: 0.699,
        ambiguous: false,
        detected_language: 'en',
        intent_summary: 'Just below',
        entities: {},
      };

      const result = evaluateRouting(output, agents);
      expect(result.action).toBe('fallback_to_default');
    });
  });
});
