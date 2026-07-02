import type { CircuitBreakerState, SessionRecord } from '@reaatech/agent-mesh';
import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { RedisBreakerStore } from './breaker.store.js';
import { RedisSessionStore } from './session.store.js';

// Minimal in-memory ioredis fake — enough to exercise the adapters' logic
// (real cross-instance behaviour needs a live server; see package README).
class FakeRedis {
  store = new Map<string, string>();
  // biome-ignore lint/suspicious/noExplicitAny: variadic SET modifiers (PX/NX/KEEPTTL)
  async set(key: string, value: string, ...args: any[]): Promise<'OK' | null> {
    if (args.includes('NX') && this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    return 'OK';
  }
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
  async mget(keys: string[]): Promise<(string | null)[]> {
    return keys.map((k) => this.store.get(k) ?? null);
  }
  async pttl(key: string): Promise<number> {
    return this.store.has(key) ? 100_000 : -2;
  }
  async scan(_cursor: string, _m: string, match: string): Promise<[string, string[]]> {
    const prefix = match.replace('*', '');
    return ['0', [...this.store.keys()].filter((k) => k.startsWith(prefix))];
  }
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const now = new Date();
  return {
    session_id: 's1',
    user_id: 'u1',
    employee_id: 'e1',
    status: 'active',
    active_agent: 'a1',
    turn_history: [],
    workflow_state: {},
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ttl: new Date(now.getTime() + 60_000),
    ...overrides,
  };
}

describe('RedisSessionStore', () => {
  it('round-trips a session lifecycle', async () => {
    const store = new RedisSessionStore(new FakeRedis() as unknown as Redis);
    await store.create(makeSession());

    const active = await store.getActiveByUser('u1');
    expect(active?.session_id).toBe('s1');
    expect(active?.ttl).toBeInstanceOf(Date);

    await store.appendTurn(
      's1',
      { role: 'user', content: 'hi', timestamp: new Date().toISOString() },
      {
        maxTurns: 10,
        ttlMs: 60_000,
      },
    );
    expect((await store.get('s1'))?.turn_history).toHaveLength(1);

    await store.close('s1', 'completed');
    expect((await store.get('s1'))?.status).toBe('completed');
    expect(await store.getActiveByUser('u1')).toBeNull();
  });
});

describe('RedisBreakerStore', () => {
  it('persists/loads state and elects a single leader', async () => {
    const redis = new FakeRedis() as unknown as Redis;
    const store = new RedisBreakerStore(redis);
    const state: CircuitBreakerState = {
      agent_id: 'a1',
      state: 'OPEN',
      failure_count: 3,
      success_count: 0,
      last_state_change: Date.now(),
      half_open_calls: 0,
      backoff_multiplier: 1,
    };
    await store.persist(state, 'inst-1');
    expect((await store.load('a1'))?.state).toBe('OPEN');
    expect((await store.loadAll()).size).toBe(1);

    const first = await store.acquireLeadership('inst-1', 30_000);
    expect(first.isLeader).toBe(true);
    const second = await store.acquireLeadership('inst-2', 30_000);
    expect(second.isLeader).toBe(false);
    expect(second.leaderId).toBe('inst-1');
  });
});
