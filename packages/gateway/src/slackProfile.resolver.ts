import { env } from '@reaatech/agent-mesh';
import type { EmployeeProfile } from '@reaatech/agent-mesh';
import { logger } from '@reaatech/agent-mesh-observability';

export class EmployeeNotFoundError extends Error {
  constructor(message = 'Employee not found') {
    super(message);
    this.name = 'EmployeeNotFoundError';
  }
}

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

const PROFILE_FIELD_KEYS = {
  EMPLOYEE_ID: 'Xf0CKV040ZAL',
};

interface CachedProfile {
  profile: EmployeeProfile;
  timestamp: number;
}

const profileCache = new Map<string, CachedProfile>();
const CACHE_TTL_MS = 10 * 60 * 1000;

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

function cacheProfile(userId: string, profile: EmployeeProfile): void {
  profileCache.set(userId, {
    profile,
    timestamp: Date.now(),
  });
}

function extractProfile(response: SlackProfileResponse, userId: string): EmployeeProfile {
  const profile = response.profile;
  const user = response.user;

  if (!profile && !user) {
    throw new EmployeeNotFoundError('No profile data available');
  }

  const fields = profile?.fields || {};
  const employeeId = fields[PROFILE_FIELD_KEYS.EMPLOYEE_ID]?.value || userId;

  const displayName =
    profile?.display_name ||
    user?.profile?.display_name ||
    profile?.real_name ||
    user?.profile?.real_name ||
    user?.name ||
    'Unknown User';

  const email = profile?.email || user?.profile?.email || '';

  const title = profile?.title || user?.profile?.title || '';

  const department = title ? title.split(' - ')[0] : '';

  return {
    employee_id: employeeId,
    display_name: displayName,
    email: email || `${employeeId}@company.com`,
    department: department || undefined,
    title: title || undefined,
  };
}

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

export async function resolveSlackProfile(slackUserId: string): Promise<EmployeeProfile> {
  const cached = getCachedProfile(slackUserId);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetchSlackProfile(slackUserId);
    const profile = extractProfile(response, slackUserId);

    cacheProfile(slackUserId, profile);

    return profile;
  } catch (error) {
    if (error instanceof EmployeeNotFoundError) {
      throw error;
    }

    logger.error('Error resolving Slack profile', {
      slackUserId,
      error: error instanceof Error ? error.message : 'unknown',
    });

    return {
      employee_id: slackUserId,
      display_name: slackUserId,
      email: `${slackUserId}@company.com`,
    };
  }
}

export async function resolveSlackProfileNoCache(slackUserId: string): Promise<EmployeeProfile> {
  profileCache.delete(slackUserId);

  return resolveSlackProfile(slackUserId);
}

export function clearProfileCache(): void {
  profileCache.clear();
}

export async function preloadProfiles(userIds: string[]): Promise<Map<string, EmployeeProfile>> {
  const results = new Map<string, EmployeeProfile>();

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const profile = await resolveSlackProfile(userId);
        results.set(userId, profile);
      } catch (error) {
        logger.error('Failed to preload Slack profile', {
          userId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }),
  );

  return results;
}
