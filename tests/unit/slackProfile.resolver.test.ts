import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/env.js', () => ({
  env: {
    SLACK_BOT_TOKEN: 'xoxb-test-token',
  },
}));

const {
  resolveSlackProfile,
  resolveSlackProfileNoCache,
  clearProfileCache,
  preloadProfiles,
  EmployeeNotFoundError,
} = await import('../../src/gateway/slackProfile.resolver.js');

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function slackResponse(profile: Record<string, unknown> = {}, ok = true, error?: string) {
  return {
    ok,
    profile: {
      display_name: 'Test User',
      real_name: 'Test Real',
      email: 'test@example.com',
      title: 'Engineering',
      ...profile,
    },
    ...(error ? { error } : {}),
  };
}

describe('resolveSlackProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProfileCache();
  });

  afterEach(() => {
    clearProfileCache();
  });

  it('resolves profile from Slack API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse()),
    });

    const profile = await resolveSlackProfile('U123');
    expect(profile.employee_id).toBe('U123');
    expect(profile.display_name).toBe('Test User');
    expect(profile.email).toBe('test@example.com');
  });

  it('caches the profile', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse()),
    });

    const p1 = await resolveSlackProfile('U123');
    const p2 = await resolveSlackProfile('U123');
    expect(p1).toEqual(p2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses cached profile within TTL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse({ display_name: 'Fresh' })),
    });

    await resolveSlackProfile('U_CACHE');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse({ display_name: 'Stale' })),
    });

    const profile = await resolveSlackProfile('U_CACHE');
    expect(profile.display_name).toBe('Fresh');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws EmployeeNotFoundError for user_not_found', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: false, error: 'user_not_found' }),
    });

    await expect(resolveSlackProfile('U_MISSING')).rejects.toThrow(EmployeeNotFoundError);
  });

  it('throws EmployeeNotFoundError for user_not_found via error field', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: false, error: 'user_not_found' }),
    });

    await expect(resolveSlackProfile('U_MISSING2')).rejects.toThrow(EmployeeNotFoundError);
  });

  it('returns fallback profile on unknown Slack API error', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: false, error: 'unknown_error' }),
    });

    const profile = await resolveSlackProfile('U_ERR');
    expect(profile.employee_id).toBe('U_ERR');
    expect(profile.display_name).toBe('U_ERR');
    expect(profile.email).toBe('U_ERR@company.com');
  });

  it('returns fallback profile on Slack API error response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: false, error: 'not_authed' }),
    });

    const profile = await resolveSlackProfile('U123');
    expect(profile.employee_id).toBe('U123');
    expect(profile.display_name).toBe('U123');
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(resolveSlackProfile('U123')).resolves.toEqual(
      expect.objectContaining({
        employee_id: 'U123',
        display_name: 'U123',
      }),
    );
  });

  it('returns fallback profile on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const profile = await resolveSlackProfile('U_NETERR');
    expect(profile.employee_id).toBe('U_NETERR');
    expect(profile.display_name).toBe('U_NETERR');
    expect(profile.email).toContain('@company.com');
  });

  it('extracts title from profile', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse({ title: 'Software Engineer' })),
    });

    const profile = await resolveSlackProfile('U_TITLE');
    expect(profile.title).toBe('Software Engineer');
  });

  it('extracts department from title', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse({ title: 'Engineering - Backend' })),
    });

    const profile = await resolveSlackProfile('U_DEPT');
    expect(profile.department).toBe('Engineering');
  });

  it('uses user_id as employee_id fallback', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse({})),
    });

    const profile = await resolveSlackProfile('U_FALLBACK');
    expect(profile.employee_id).toBe('U_FALLBACK');
  });
});

describe('resolveSlackProfileNoCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProfileCache();
  });

  afterEach(() => {
    clearProfileCache();
  });

  it('bypasses cache and fetches fresh', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse({ display_name: 'Fresh' })),
    });

    await resolveSlackProfile('U_FRESH');

    const profile = await resolveSlackProfileNoCache('U_FRESH');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(profile.display_name).toBe('Fresh');
  });

  it('removes existing cache entry', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse({ display_name: 'First' })),
    });

    await resolveSlackProfile('U_NOCACHE');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse({ display_name: 'Second' })),
    });

    const profile = await resolveSlackProfileNoCache('U_NOCACHE');
    expect(profile.display_name).toBe('Second');
  });
});

describe('preloadProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProfileCache();
  });

  afterEach(() => {
    clearProfileCache();
  });

  it('preloads profiles for multiple users', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse()),
    });

    const results = await preloadProfiles(['U1', 'U2', 'U3']);
    expect(results.size).toBe(3);
    expect(results.has('U1')).toBe(true);
    expect(results.has('U2')).toBe(true);
    expect(results.has('U3')).toBe(true);
  });

  it('handles partial failures with fallback profiles', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('U_BAD')) {
        return Promise.reject(new Error('fail'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(slackResponse()),
      });
    });

    const results = await preloadProfiles(['U_OK', 'U_BAD']);
    expect(results.has('U_OK')).toBe(true);
    expect(results.has('U_BAD')).toBe(true);
    const badProfile = results.get('U_BAD');
    expect(badProfile?.employee_id).toBe('U_BAD');
  });

  it('returns empty map for empty input', async () => {
    const results = await preloadProfiles([]);
    expect(results.size).toBe(0);
  });
});

describe('EmployeeNotFoundError', () => {
  it('has correct name and message', () => {
    const error = new EmployeeNotFoundError('Test message');
    expect(error.name).toBe('EmployeeNotFoundError');
    expect(error.message).toBe('Test message');
  });

  it('has default message', () => {
    const error = new EmployeeNotFoundError();
    expect(error.message).toBe('Employee not found');
  });
});

describe('clearProfileCache', () => {
  it('clears the cache', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse()),
    });

    await resolveSlackProfile('U_CACHE1');
    clearProfileCache();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slackResponse({ display_name: 'New' })),
    });

    const profile = await resolveSlackProfile('U_CACHE1');
    expect(profile.display_name).toBe('New');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
