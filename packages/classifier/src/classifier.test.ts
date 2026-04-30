import { describe, expect, it } from 'vitest';
import { classifierService, detectLanguage, isRateLimitError } from './index.js';

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
});
