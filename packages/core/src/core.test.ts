import { describe, expect, it } from 'vitest';
import { IncomingRequestSchema, SERVICE_NAME, SERVICE_VERSION } from './index.js';

describe('@reaatech/agent-mesh', () => {
  it('should export constants', () => {
    expect(SERVICE_NAME).toBe('agent-mesh');
    expect(SERVICE_VERSION).toBe('1.0.0');
  });

  it('should export schemas', () => {
    const result = IncomingRequestSchema.safeParse({ input: 'hello' });
    expect(result.success).toBe(true);
  });
});
