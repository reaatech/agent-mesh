import { describe, it, expect } from 'vitest';
import { SERVICE_NAME, SERVICE_VERSION, IncomingRequestSchema } from './index.js';

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
