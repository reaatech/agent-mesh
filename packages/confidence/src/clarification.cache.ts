import { CACHE_TTL } from '@reaatech/agent-mesh';

interface CacheEntry {
  value: string;
  expiresAt: number;
  lastAccessed: number;
}

class ClarificationCache {
  private cache: Map<string, CacheEntry> = new Map();
  private pendingClear = false;
  private activeRequests = 0;
  private ttlMs: number;

  constructor(ttlMs: number = CACHE_TTL.CLARIFICATION_MS) {
    this.ttlMs = ttlMs;

    setInterval(() => this.cleanup(), this.ttlMs);
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    entry.lastAccessed = Date.now();
    return entry.value;
  }

  set(key: string, value: string): void {
    const now = Date.now();
    this.cache.set(key, {
      value,
      expiresAt: now + this.ttlMs,
      lastAccessed: now,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    if (this.activeRequests > 0) {
      this.pendingClear = true;
      return;
    }
    this.doClear();
  }

  startRequest(): void {
    this.activeRequests++;
  }

  endRequest(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    if (this.pendingClear && this.activeRequests === 0) {
      this.pendingClear = false;
      this.doClear();
    }
  }

  getStats(): { size: number; pendingClear: boolean; activeRequests: number } {
    return {
      size: this.cache.size,
      pendingClear: this.pendingClear,
      activeRequests: this.activeRequests,
    };
  }

  private doClear(): void {
    this.cache.clear();
    this.pendingClear = false;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export { ClarificationCache };
export const clarificationCache = new ClarificationCache();
