import { describe, expect, it } from 'vitest';
import { getFirestore, resetFirestore } from './index.js';

describe('@reaatech/agent-mesh-session', () => {
  it('should export firestore client factory', () => {
    expect(typeof getFirestore).toBe('function');
  });

  it('should export reset function', () => {
    expect(typeof resetFirestore).toBe('function');
  });
});
