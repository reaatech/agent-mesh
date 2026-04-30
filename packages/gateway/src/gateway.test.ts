import { describe, expect, it } from 'vitest';
import {
  EmployeeNotFoundError,
  clearAuthCache,
  clearProfileCache,
  clearRateLimitBuckets,
} from './index.js';

describe('@reaatech/agent-mesh-gateway', () => {
  it('should export auth cache clear', () => {
    expect(typeof clearAuthCache).toBe('function');
  });

  it('should export rate limit clear', () => {
    expect(typeof clearRateLimitBuckets).toBe('function');
  });

  it('should export profile cache clear', () => {
    expect(typeof clearProfileCache).toBe('function');
  });

  it('should export error class', () => {
    const err = new EmployeeNotFoundError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('EmployeeNotFoundError');
  });
});
