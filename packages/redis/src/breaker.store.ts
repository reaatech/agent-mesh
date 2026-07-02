import type { BreakerStore, CircuitBreakerState, LeaderState } from '@reaatech/agent-mesh';
import type { Redis } from 'ioredis';

/**
 * Redis-backed {@link BreakerStore}. Leader election uses a single `SET NX PX`
 * lease key (the same instance renews it; a new instance can only take over once
 * the lease has expired).
 */
export class RedisBreakerStore implements BreakerStore {
  private readonly prefix: string;

  constructor(
    private readonly redis: Redis,
    opts: { keyPrefix?: string } = {},
  ) {
    this.prefix = opts.keyPrefix ?? 'am:';
  }

  private breakerKey(agentId: string): string {
    return `${this.prefix}breaker:${agentId}`;
  }

  private get leaderKey(): string {
    return `${this.prefix}leader`;
  }

  async load(agentId: string): Promise<CircuitBreakerState | null> {
    const raw = await this.redis.get(this.breakerKey(agentId));
    return raw ? (JSON.parse(raw) as CircuitBreakerState) : null;
  }

  async loadAll(): Promise<Map<string, CircuitBreakerState>> {
    const states = new Map<string, CircuitBreakerState>();
    const match = `${this.prefix}breaker:*`;
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', match, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) {
        const values = await this.redis.mget(keys);
        for (const raw of values) {
          if (raw) {
            const state = JSON.parse(raw) as CircuitBreakerState;
            states.set(state.agent_id, state);
          }
        }
      }
    } while (cursor !== '0');
    return states;
  }

  async persist(state: CircuitBreakerState, _instanceId: string): Promise<void> {
    await this.redis.set(this.breakerKey(state.agent_id), JSON.stringify(state));
  }

  async acquireLeadership(instanceId: string, leaseMs: number): Promise<LeaderState> {
    const now = Date.now();
    const leaseExpiresAt = now + leaseMs;

    // Try to claim an unheld lease.
    const claimed = await this.redis.set(this.leaderKey, instanceId, 'PX', leaseMs, 'NX');
    if (claimed === 'OK') {
      return { isLeader: true, leaderId: instanceId, lastHeartbeat: now, leaseExpiresAt };
    }

    // Already held — renew if we are the current holder, else report the holder.
    const current = await this.redis.get(this.leaderKey);
    if (current === instanceId) {
      await this.redis.set(this.leaderKey, instanceId, 'PX', leaseMs);
      return { isLeader: true, leaderId: instanceId, lastHeartbeat: now, leaseExpiresAt };
    }

    const pttl = await this.redis.pttl(this.leaderKey);
    return {
      isLeader: false,
      leaderId: current ?? 'unknown',
      lastHeartbeat: now,
      leaseExpiresAt: pttl > 0 ? now + pttl : now,
    };
  }
}
