import crypto from 'node:crypto';
import { env } from '@reaatech/agent-mesh';
import { logAuthRequest } from '@reaatech/agent-mesh-observability';
import type { NextFunction, Request, Response } from 'express';

const uuidv4 = crypto.randomUUID;

interface CachedKeyValidation {
  valid: boolean;
  timestamp: number;
}

const keyCache = new Map<string, CachedKeyValidation>();
const MAX_KEY_CACHE_SIZE = 10000;
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedExpectedApiKey: { value: string; timestamp: number } | null = null;

function evictStaleKeyCacheEntries(): void {
  if (keyCache.size < MAX_KEY_CACHE_SIZE) {
    return;
  }
  const now = Date.now();
  const keysToDelete: string[] = [];
  for (const [key, entry] of keyCache) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete.slice(0, keyCache.size - MAX_KEY_CACHE_SIZE + 100)) {
    keyCache.delete(key);
  }
}

async function loadExpectedApiKey(): Promise<string> {
  if (cachedExpectedApiKey && Date.now() - cachedExpectedApiKey.timestamp < CACHE_TTL_MS) {
    return cachedExpectedApiKey.value;
  }

  if (env.API_KEY_SECRET_NAME) {
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
    const client = new SecretManagerServiceClient();
    const [version] = await client.accessSecretVersion({
      name: env.API_KEY_SECRET_NAME,
    });
    const secret = version.payload?.data?.toString().trim();

    if (secret) {
      cachedExpectedApiKey = { value: secret, timestamp: Date.now() };
      return secret;
    }
  }

  cachedExpectedApiKey = { value: env.API_KEY, timestamp: Date.now() };
  return env.API_KEY;
}

async function isValidApiKey(key: string): Promise<boolean> {
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    return false;
  }

  evictStaleKeyCacheEntries();

  const cached = keyCache.get(trimmedKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.valid;
  }

  const expectedKey = await loadExpectedApiKey();
  const valid = trimmedKey === expectedKey;
  keyCache.set(trimmedKey, { valid, timestamp: Date.now() });
  return valid;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const requestId = uuidv4();
  const apiKey = String(req.headers['x-api-key'] ?? '');

  if (env.NODE_ENV === 'development' && env.API_KEY === 'dev-key' && apiKey === 'dev-key') {
    logAuthRequest(requestId, 'success', { devMode: true });
    (req as Request & { apiKey: string; requestId: string }).apiKey = apiKey;
    (req as Request & { requestId: string }).requestId = requestId;
    next();
    return;
  }

  if (!apiKey.trim()) {
    logAuthRequest(requestId, 'failure', { reason: 'missing_api_key' });
    res.status(401).json({
      error: 'Authentication required',
      message: 'Missing x-api-key header',
    });
    return;
  }

  try {
    if (!(await isValidApiKey(apiKey))) {
      logAuthRequest(requestId, 'failure', { reason: 'invalid_api_key' });
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid API key',
      });
      return;
    }
  } catch (err) {
    logAuthRequest(requestId, 'failure', {
      reason: 'validation_error',
      err: err instanceof Error ? err.message : 'unknown',
    });
    res.status(503).json({
      error: 'Authentication unavailable',
      message: 'Unable to validate API key at this time',
    });
    return;
  }

  logAuthRequest(requestId, 'success');
  (req as Request & { apiKey: string; requestId: string }).apiKey = apiKey;
  (req as Request & { requestId: string }).requestId = requestId;
  next();
}

export function clearAuthCache(): void {
  keyCache.clear();
  cachedExpectedApiKey = null;
}
