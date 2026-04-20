/**
 * LRU cache for clarification questions
 * Supports deferred clear on SIGHUP (wait for active requests)
 */

import { CACHE_TTL } from '../config/constants.js';

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

    // Periodic cleanup of expired entries
    setInterval(() => this.cleanup(), this.ttlMs);
  }

  /**
   * Get a cached value
   */
  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Update access time
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: string): void {
    const now = Date.now();
    this.cache.set(key, {
      value,
      expiresAt: now + this.ttlMs,
      lastAccessed: now,
    });
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear the cache
   * If there are active requests, defer the clear until they complete
   */
  clear(): void {
    if (this.activeRequests > 0) {
      this.pendingClear = true;
      return;
    }
    this.doClear();
  }

  /**
   * Mark a request as active (prevents cache clear)
   */
  startRequest(): void {
    this.activeRequests++;
  }

  /**
   * Mark a request as complete
   */
  endRequest(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    // Check if we should perform deferred clear
    if (this.pendingClear && this.activeRequests === 0) {
      this.pendingClear = false;
      this.doClear();
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; pendingClear: boolean; activeRequests: number } {
    return {
      size: this.cache.size,
      pendingClear: this.pendingClear,
      activeRequests: this.activeRequests,
    };
  }

  /**
   * Internal: perform the actual clear
   */
  private doClear(): void {
    this.cache.clear();
    this.pendingClear = false;
  }

  /**
   * Internal: cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton instance
export { ClarificationCache };
export const clarificationCache = new ClarificationCache();
