/**
 * Rate limiting middleware using token bucket algorithm
 * Per-client (keyed by API key or IP) with per-endpoint limits
 */

import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

/**
 * Token bucket state for a client
 */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * In-memory store for token buckets
 */
const buckets = new Map<string, TokenBucket>();
const MAX_BUCKETS = 10000;

function evictStaleBuckets(): void {
  if (buckets.size < MAX_BUCKETS) {
    return;
  }
  const now = Date.now();
  const keysToDelete: string[] = [];
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > 60 * 60 * 1000) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete.slice(0, buckets.size - MAX_BUCKETS + 100)) {
    buckets.delete(key);
  }
}

/**
 * Rate limit configuration per endpoint
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * Default rate limit configuration
 */
const defaultConfig: RateLimitConfig = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
};

/**
 * Per-endpoint rate limit overrides
 */
const endpointConfigs: Record<string, RateLimitConfig> = {
  '/v1/request': {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },
};

/**
 * Get rate limit config for an endpoint
 */
function getConfigForEndpoint(path: string): RateLimitConfig {
  for (const [endpoint, config] of Object.entries(endpointConfigs)) {
    if (path.startsWith(endpoint)) {
      return config;
    }
  }
  return defaultConfig;
}

/**
 * Get client identifier from request (API key or IP)
 */
function getClientId(req: Request): string {
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey) {
    return `key:${apiKey}`;
  }

  const forwarded = req.headers['x-forwarded-for'] as string;
  if (forwarded) {
    // Get first IP in chain
    const firstIp = forwarded.split(',')[0];
    const ip = firstIp ? firstIp.trim() : forwarded.trim();
    return `ip:${ip}`;
  }

  return `ip:${req.ip}`;
}

/**
 * Refill tokens for a bucket based on elapsed time
 */
function refillBucket(bucket: TokenBucket, config: RateLimitConfig): TokenBucket {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const refillRate = config.maxRequests / config.windowMs;
  const tokensToAdd = elapsed * refillRate;

  return {
    tokens: Math.min(config.maxRequests, bucket.tokens + tokensToAdd),
    lastRefill: now,
  };
}

/**
 * Try to consume a token from the bucket
 * Returns true if token was consumed, false if rate limited
 */
function tryConsumeToken(
  clientId: string,
  config: RateLimitConfig,
): { allowed: boolean; bucket: TokenBucket } {
  const now = Date.now();
  let bucket = buckets.get(clientId);

  evictStaleBuckets();

  if (!bucket) {
    bucket = {
      tokens: config.maxRequests,
      lastRefill: now,
    };
  }

  bucket = refillBucket(bucket, config);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(clientId, bucket);
    return { allowed: true, bucket };
  }

  buckets.set(clientId, bucket);
  return { allowed: false, bucket };
}

/**
 * Calculate retry-after seconds from bucket state
 */
function calculateRetryAfter(bucket: TokenBucket, config: RateLimitConfig): number {
  const tokensNeeded = 1 - bucket.tokens;
  const refillRate = config.maxRequests / config.windowMs;
  const secondsNeeded = Math.ceil(tokensNeeded / refillRate / 1000);
  return Math.max(1, secondsNeeded);
}

/**
 * Express middleware for rate limiting
 */
export function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip rate limiting if disabled
  if (!env.ENABLE_RATE_LIMITING) {
    next();
    return;
  }

  const clientId = getClientId(req);
  const config = getConfigForEndpoint(req.path);
  const { allowed, bucket } = tryConsumeToken(clientId, config);

  // Set rate limit headers on all responses
  res.set('X-RateLimit-Limit', config.maxRequests.toString());
  res.set('X-RateLimit-Remaining', Math.floor(bucket.tokens).toString());
  res.set('X-RateLimit-Reset', Math.ceil((bucket.lastRefill + config.windowMs) / 1000).toString());

  if (!allowed) {
    const retryAfter = calculateRetryAfter(bucket, config);
    res.set('Retry-After', retryAfter.toString());

    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please slow down.',
      retry_after: retryAfter,
    });
    return;
  }

  next();
}

/**
 * Clear all rate limit buckets (for testing)
 */
export function clearRateLimitBuckets(): void {
  buckets.clear();
}

/**
 * Get current bucket state for a client (for testing/debugging)
 */
export function getBucketState(clientId: string): TokenBucket | undefined {
  return buckets.get(clientId);
}
