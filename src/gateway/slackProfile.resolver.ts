/**
 * Slack profile resolver for extracting employee identity
 * Uses Slack's users.profile.get API to resolve user information
 */

import { env } from '../config/env.js';
import type { EmployeeProfile } from '../types/domain.js';
import { logger } from '../observability/logger.js';

/**
 * Custom error for employee not found
 */
export class EmployeeNotFoundError extends Error {
  constructor(message = 'Employee not found') {
    super(message);
    this.name = 'EmployeeNotFoundError';
  }
}

/**
 * Slack profile API response structure
 */
interface SlackProfileResponse {
  ok: boolean;
  profile?: {
    fields?: Record<string, { value: string; alt?: string }>;
    real_name?: string;
    display_name?: string;
    email?: string;
    title?: string;
  };
  user?: {
    id: string;
    name: string;
    deleted: boolean;
    is_bot: boolean;
    profile: {
      real_name?: string;
      display_name?: string;
      email?: string;
      title?: string;
    };
  };
  error?: string;
}

/**
 * Slack profile field keys (custom fields in Slack)
 */
const PROFILE_FIELD_KEYS = {
  EMPLOYEE_ID: 'Xf0CKV040ZAL', // Custom field key for employee ID
};

/**
 * In-memory cache for Slack profiles
 */
interface CachedProfile {
  profile: EmployeeProfile;
  timestamp: number;
}

const profileCache = new Map<string, CachedProfile>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10-minute TTL

/**
 * Get a cached profile if available and not expired
 */
function getCachedProfile(userId: string): EmployeeProfile | null {
  const cached = profileCache.get(userId);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    profileCache.delete(userId);
    return null;
  }

  return cached.profile;
}

/**
 * Cache a profile
 */
function cacheProfile(userId: string, profile: EmployeeProfile): void {
  profileCache.set(userId, {
    profile,
    timestamp: Date.now(),
  });
}

/**
 * Extract employee profile from Slack API response
 */
function extractProfile(response: SlackProfileResponse, userId: string): EmployeeProfile {
  const profile = response.profile;
  const user = response.user;

  if (!profile && !user) {
    throw new EmployeeNotFoundError('No profile data available');
  }

  // Extract from profile fields (custom fields) or standard fields
  const fields = profile?.fields || {};
  const employeeId =
    fields[PROFILE_FIELD_KEYS.EMPLOYEE_ID]?.value ||
    userId;

  const displayName =
    profile?.display_name ||
    user?.profile?.display_name ||
    profile?.real_name ||
    user?.profile?.real_name ||
    user?.name ||
    'Unknown User';

  const email =
    profile?.email ||
    user?.profile?.email ||
    '';

  const title =
    profile?.title ||
    user?.profile?.title ||
    '';

  // Extract department from title if available
  const department = title ? title.split(' - ')[0] : '';

  return {
    employee_id: employeeId,
    display_name: displayName,
    email: email || `${employeeId}@company.com`, // Fallback email format
    department: department || undefined,
    title: title || undefined,
  };
}

/**
 * Fetch profile from Slack API
 */
async function fetchSlackProfile(slackUserId: string): Promise<SlackProfileResponse> {
  const token = env.SLACK_BOT_TOKEN;

  if (!token) {
    throw new Error('SLACK_BOT_TOKEN not configured');
  }

  const url = 'https://slack.com/api/users.profile.get';
  const params = new URLSearchParams({
    user: slackUserId,
  });

  const response = await fetch(`${url}?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as SlackProfileResponse;

  if (!data.ok) {
    if (data.error === 'user_not_found') {
      throw new EmployeeNotFoundError('Slack user not found');
    }
    throw new Error(`Slack API error: ${data.error}`);
  }

  return data;
}

/**
 * Resolve employee profile from Slack user ID
 * Uses caching with 10-minute TTL
 */
export async function resolveSlackProfile(
  slackUserId: string
): Promise<EmployeeProfile> {
  // Check cache first
  const cached = getCachedProfile(slackUserId);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetchSlackProfile(slackUserId);
    const profile = extractProfile(response, slackUserId);

    // Cache the result
    cacheProfile(slackUserId, profile);

    return profile;
  } catch (error) {
    if (error instanceof EmployeeNotFoundError) {
      throw error;
    }

    // Log error but don't fail - return a minimal profile
    logger.error('Error resolving Slack profile', { slackUserId, error: error instanceof Error ? error.message : 'unknown' });

    // Return a fallback profile
    return {
      employee_id: slackUserId,
      display_name: slackUserId,
      email: `${slackUserId}@company.com`,
    };
  }
}

/**
 * Resolve employee profile from Slack user ID (with cache bypass)
 */
export async function resolveSlackProfileNoCache(
  slackUserId: string
): Promise<EmployeeProfile> {
  // Remove from cache if exists
  profileCache.delete(slackUserId);

  return resolveSlackProfile(slackUserId);
}

/**
 * Clear the profile cache (for testing)
 */
export function clearProfileCache(): void {
  profileCache.clear();
}

/**
 * Preload profiles for multiple users
 */
export async function preloadProfiles(
  userIds: string[]
): Promise<Map<string, EmployeeProfile>> {
  const results = new Map<string, EmployeeProfile>();

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const profile = await resolveSlackProfile(userId);
        results.set(userId, profile);
      } catch (error) {
        logger.error('Failed to preload Slack profile', { userId, error: error instanceof Error ? error.message : 'unknown' });
      }
    })
  );

  return results;
}
