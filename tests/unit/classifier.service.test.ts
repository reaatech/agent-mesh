import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentRegistry } from '../../src/registry/types.js';

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    GOOGLE_CLOUD_PROJECT: 'test-project',
    VERTEX_AI_LOCATION: 'us-central1',
    VERTEX_AI_MODEL: 'gemini-2.0-flash',
  },
}));

vi.mock('../../src/classifier/localization.js', () => ({
  detectLanguage: () => 'en',
}));

const { ClassifierService, isRateLimitError } =
  await import('../../src/classifier/classifier.service.js');

const defaultAgent = {
  agent_id: 'default',
  display_name: 'Default Agent',
  description: 'Handles general requests',
  endpoint: 'https://default.example.com',
  type: 'mcp' as const,
  is_default: true,
  confidence_threshold: 0,
  clarification_required: false,
  examples: [],
};

const passwordAgent = {
  agent_id: 'password-reset',
  display_name: 'Password Reset',
  description: 'Handles password resets and account recovery',
  endpoint: 'https://password.example.com',
  type: 'mcp' as const,
  is_default: false,
  confidence_threshold: 0.7,
  clarification_required: false,
  examples: ['Reset my password', 'I forgot my password', 'Change my password'],
};

const registry: AgentRegistry = [defaultAgent, passwordAgent];

describe('ClassifierService', () => {
  let service: InstanceType<typeof ClassifierService>;

  beforeEach(() => {
    service = new ClassifierService();
  });

  it('uses mock classifier in test environment', () => {
    expect(service.isMock()).toBe(true);
  });

  it('classifies matching input to the correct agent', async () => {
    const result = await service.classify('Reset my password please', registry);
    expect(result.agent_id).toBe('password-reset');
    expect(result.confidence).toBe(0.8);
    expect(result.ambiguous).toBe(false);
    expect(result.detected_language).toBe('en');
  });

  it('classifies matching input for forgot password', async () => {
    const result = await service.classify('I forgot my password', registry);
    expect(result.agent_id).toBe('password-reset');
  });

  it('falls back to default agent for non-matching input', async () => {
    const result = await service.classify('What is the weather today?', registry);
    expect(result.agent_id).toBe('default');
    expect(result.confidence).toBe(0.5);
  });

  it('falls back to default agent for empty input', async () => {
    const result = await service.classify('', registry);
    expect(result.agent_id).toBe('default');
  });

  it('throws when no default agent found and no match', async () => {
    const noDefaultRegistry: AgentRegistry = [passwordAgent];
    await expect(service.classify('random text', noDefaultRegistry)).rejects.toThrow(
      'No default agent found in registry',
    );
  });

  it('includes intent_summary in response', async () => {
    const result = await service.classify('Reset my password', registry);
    expect(result.intent_summary).toBeDefined();
    expect(typeof result.intent_summary).toBe('string');
    expect(result.intent_summary.length).toBeGreaterThan(0);
  });

  it('includes entities in response', async () => {
    const result = await service.classify('Hello', registry);
    expect(result.entities).toBeDefined();
    expect(typeof result.entities).toBe('object');
  });
});

describe('isRateLimitError', () => {
  it('returns true for rate limit error message', () => {
    expect(isRateLimitError(new Error('rate limit exceeded'))).toBe(true);
    expect(isRateLimitError(new Error('Rate Limit Error'))).toBe(true);
  });

  it('returns true for quota error message', () => {
    expect(isRateLimitError(new Error('quota exceeded'))).toBe(true);
    expect(isRateLimitError(new Error('QUOTA'))).toBe(true);
  });

  it('returns true for 429 error message', () => {
    expect(isRateLimitError(new Error('error 429'))).toBe(true);
    expect(isRateLimitError(new Error('429 Too Many Requests'))).toBe(true);
  });

  it('returns true for resource exhausted message', () => {
    expect(isRateLimitError(new Error('resource exhausted'))).toBe(true);
    expect(isRateLimitError(new Error('RESOURCE EXHAUSTED'))).toBe(true);
  });

  it('returns false for non-rate-limit errors', () => {
    expect(isRateLimitError(new Error('connection timeout'))).toBe(false);
    expect(isRateLimitError(new Error('invalid request'))).toBe(false);
    expect(isRateLimitError(new Error('authentication failed'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isRateLimitError('string error')).toBe(false);
    expect(isRateLimitError({ message: 'error' })).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});
