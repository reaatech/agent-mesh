import { describe, it, expect, vi } from 'vitest';
import type { AgentRegistry } from '../../src/registry/types.js';
import type { ClassifierOutput } from '../../src/types/domain.js';

vi.mock('../../src/config/env.js', () => ({
  env: {
    ENABLE_CLARIFICATION: true,
  },
}));

vi.mock('../../src/observability/metrics.js', () => ({
  recordClarification: vi.fn(),
}));

vi.mock('../../src/classifier/localization.js', () => ({
  getClarificationQuestion: (lang: string) => `Clarification question (${lang})`,
}));

vi.mock('../../src/confidence/clarification.cache.js', () => {
  const map = new Map<string, string>();
  return {
    clarificationCache: {
      get: (key: string) => map.get(key) ?? null,
      set: (key: string, value: string) => { map.set(key, value); },
    },
  };
});

const { evaluateConfidenceGate, generateClarificationQuestion } = await import('../../src/confidence/confidence.gate.js');

const defaultAgent = {
  agent_id: 'default',
  display_name: 'Default Agent',
  description: 'Default',
  endpoint: 'https://default.example.com',
  type: 'mcp' as const,
  is_default: true,
  confidence_threshold: 0,
  clarification_required: false,
  examples: [],
};

const specialistAgent = {
  agent_id: 'specialist',
  display_name: 'Specialist Agent',
  description: 'Specialist',
  endpoint: 'https://specialist.example.com',
  type: 'mcp' as const,
  is_default: false,
  confidence_threshold: 0.7,
  clarification_required: false,
  examples: ['specialist query'],
};

const clarificationAgent = {
  agent_id: 'clarifier',
  display_name: 'Clarifier Agent',
  description: 'Clarifier',
  endpoint: 'https://clarifier.example.com',
  type: 'mcp' as const,
  is_default: false,
  confidence_threshold: 0.5,
  clarification_required: true,
  examples: ['clarify query'],
};

const registry: AgentRegistry = [defaultAgent, specialistAgent, clarificationAgent];

function makeOutput(overrides: Partial<ClassifierOutput> = {}): ClassifierOutput {
  return {
    agent_id: 'specialist',
    confidence: 0.8,
    ambiguous: false,
    detected_language: 'en',
    intent_summary: 'test',
    entities: {},
    ...overrides,
  };
}

describe('evaluateConfidenceGate', () => {
  it('Rule 1: unknown agent_id routes to default', () => {
    const result = evaluateConfidenceGate(makeOutput({ agent_id: 'unknown' }), registry);
    expect(result.action).toBe('route');
    expect(result.agent_id).toBe('default');
    expect(result.reason).toContain('Unknown agent_id');
  });

  it('Rule 1: falls back to matched agent_id when no default found', () => {
    const noDefaultRegistry = [specialistAgent];
    const result = evaluateConfidenceGate(makeOutput({ agent_id: 'unknown' }), noDefaultRegistry);
    expect(result.action).toBe('route');
    expect(result.agent_id).toBe('unknown');
  });

  it('Rule 2: default agent always routes directly', () => {
    const result = evaluateConfidenceGate(makeOutput({ agent_id: 'default', confidence: 0.1 }), registry);
    expect(result.action).toBe('route');
    expect(result.agent_id).toBe('default');
    expect(result.reason).toContain('Default agent');
  });

  it('bypassClassifier routes directly to matched agent', () => {
    const result = evaluateConfidenceGate(makeOutput({ confidence: 0.3 }), registry, true);
    expect(result.action).toBe('route');
    expect(result.agent_id).toBe('specialist');
    expect(result.reason).toContain('Session bypass');
  });

  it('Rule 3: routes when confidence >= threshold and not ambiguous', () => {
    const result = evaluateConfidenceGate(makeOutput({ confidence: 0.7, ambiguous: false }), registry);
    expect(result.action).toBe('route');
    expect(result.agent_id).toBe('specialist');
    expect(result.reason).toContain('Confidence 0.7 >= threshold 0.7');
  });

  it('Rule 3: routes when confidence exceeds threshold', () => {
    const result = evaluateConfidenceGate(makeOutput({ confidence: 0.9 }), registry);
    expect(result.action).toBe('route');
    expect(result.agent_id).toBe('specialist');
  });

  it('does not route when confidence below threshold', () => {
    const result = evaluateConfidenceGate(makeOutput({ confidence: 0.5 }), registry);
    expect(result.action).toBe('fallback');
    expect(result.agent_id).toBe('default');
  });

  it('does not route when ambiguous even with high confidence', () => {
    const result = evaluateConfidenceGate(makeOutput({ confidence: 0.9, ambiguous: true }), registry);
    expect(result.action).toBe('fallback');
  });

  it('Rule 4: clarifies when clarification_required and ENABLE_CLARIFICATION is true', () => {
    const result = evaluateConfidenceGate(
      makeOutput({ agent_id: 'clarifier', confidence: 0.3 }),
      registry,
    );
    expect(result.action).toBe('clarify');
    expect(result.agent_id).toBe('clarifier');
    expect(result.clarification_question).toBeDefined();
  });

  it('Rule 5: falls back to default when below threshold and no clarification required', () => {
    const result = evaluateConfidenceGate(makeOutput({ confidence: 0.1 }), registry);
    expect(result.action).toBe('fallback');
    expect(result.agent_id).toBe('default');
    expect(result.reason).toContain('Below threshold');
  });
});

describe('generateClarificationQuestion', () => {
  it('returns a clarification question', async () => {
    const question = await generateClarificationQuestion(clarificationAgent, 'test input', 'en');
    expect(question).toBeDefined();
    expect(typeof question).toBe('string');
    expect(question.length).toBeGreaterThan(0);
  });

  it('caches the question for subsequent calls', async () => {
    const q1 = await generateClarificationQuestion(clarificationAgent, 'input', 'fr');
    const q2 = await generateClarificationQuestion(clarificationAgent, 'input', 'fr');
    expect(q1).toBe(q2);
  });
});
