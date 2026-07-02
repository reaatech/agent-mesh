import type { AgentRegistry } from '@reaatech/agent-mesh-registry';
import { describe, expect, it } from 'vitest';
import type { ClassifierProvider } from './index.js';
import { classifierService, createClassifier, detectLanguage, isRateLimitError } from './index.js';

describe('@reaatech/agent-mesh-classifier', () => {
  it('should export classifier singleton', () => {
    expect(classifierService).toBeDefined();
    expect(typeof classifierService.classify).toBe('function');
  });

  it('should detect English', () => {
    expect(detectLanguage('Hello world')).toBe('en');
  });

  it('should detect non-rate-limit errors', () => {
    expect(isRateLimitError(new Error('some error'))).toBe(false);
  });

  it('routes through an injected ClassifierProvider', async () => {
    const stub: ClassifierProvider = {
      classify: () => ({
        agent_id: 'stub-agent',
        confidence: 0.99,
        ambiguous: false,
        detected_language: 'en',
        intent_summary: 'from stub',
        entities: {},
      }),
    };
    const svc = createClassifier(stub);
    const out = await svc.classify('anything', [] as unknown as AgentRegistry);
    expect(out.agent_id).toBe('stub-agent');
    expect(out.confidence).toBe(0.99);
    expect(svc.isMock()).toBe(false);
  });

  it('falls back to the mock (default agent) when no provider is injected', async () => {
    const registry = [
      { agent_id: 'default-agent', display_name: 'Default', is_default: true, examples: ['hello'] },
    ] as unknown as AgentRegistry;
    const out = await createClassifier().classify('some unmatched text', registry);
    expect(out.agent_id).toBe('default-agent');
  });
});
