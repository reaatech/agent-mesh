import type { SessionRecord, SessionStatus, SessionStore, TurnEntry } from '@reaatech/agent-mesh';
import type { Redis } from 'ioredis';

/** Redis-backed {@link SessionStore}. Pass an existing ioredis client. */
export class RedisSessionStore implements SessionStore {
  private readonly prefix: string;

  constructor(
    private readonly redis: Redis,
    opts: { keyPrefix?: string } = {},
  ) {
    this.prefix = opts.keyPrefix ?? 'am:';
  }

  private sessionKey(id: string): string {
    return `${this.prefix}session:${id}`;
  }

  private userActiveKey(userId: string): string {
    return `${this.prefix}user:${userId}:active`;
  }

  private static serialize(record: SessionRecord): string {
    return JSON.stringify({ ...record, ttl: record.ttl.toISOString() });
  }

  private static deserialize(raw: string): SessionRecord {
    const obj = JSON.parse(raw) as Omit<SessionRecord, 'ttl'> & { ttl: string };
    return { ...obj, ttl: new Date(obj.ttl) };
  }

  private ttlMs(record: SessionRecord): number {
    return Math.max(0, record.ttl.getTime() - Date.now());
  }

  async create(record: SessionRecord): Promise<void> {
    const ttlMs = this.ttlMs(record);
    const value = RedisSessionStore.serialize(record);
    if (ttlMs > 0) {
      await this.redis.set(this.sessionKey(record.session_id), value, 'PX', ttlMs);
      await this.redis.set(this.userActiveKey(record.user_id), record.session_id, 'PX', ttlMs);
    } else {
      await this.redis.set(this.sessionKey(record.session_id), value);
      await this.redis.set(this.userActiveKey(record.user_id), record.session_id);
    }
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const raw = await this.redis.get(this.sessionKey(sessionId));
    return raw ? RedisSessionStore.deserialize(raw) : null;
  }

  async getActiveByUser(userId: string): Promise<SessionRecord | null> {
    const id = await this.redis.get(this.userActiveKey(userId));
    if (!id) {
      return null;
    }
    const record = await this.get(id);
    return record && record.status === 'active' ? record : null;
  }

  async appendTurn(
    sessionId: string,
    turn: TurnEntry,
    opts: { maxTurns: number; ttlMs: number },
  ): Promise<void> {
    const record = await this.get(sessionId);
    if (!record) {
      throw new Error(`Session ${sessionId} not found`);
    }
    record.turn_history = [...record.turn_history.slice(-opts.maxTurns + 1), turn];
    record.updated_at = new Date().toISOString();
    record.ttl = new Date(Date.now() + opts.ttlMs);
    await this.redis.set(
      this.sessionKey(sessionId),
      RedisSessionStore.serialize(record),
      'PX',
      opts.ttlMs,
    );
    await this.redis.set(this.userActiveKey(record.user_id), sessionId, 'PX', opts.ttlMs);
  }

  async updateWorkflowState(
    sessionId: string,
    workflowState: Record<string, unknown>,
  ): Promise<void> {
    const record = await this.get(sessionId);
    if (!record) {
      return;
    }
    record.workflow_state = workflowState;
    record.updated_at = new Date().toISOString();
    await this.redis.set(
      this.sessionKey(sessionId),
      RedisSessionStore.serialize(record),
      'KEEPTTL',
    );
  }

  async seed(
    sessionId: string,
    data: { turn_history: TurnEntry[]; workflow_state: Record<string, unknown> },
  ): Promise<void> {
    const record = await this.get(sessionId);
    if (!record) {
      return;
    }
    record.turn_history = data.turn_history;
    record.workflow_state = data.workflow_state;
    record.updated_at = new Date().toISOString();
    await this.redis.set(
      this.sessionKey(sessionId),
      RedisSessionStore.serialize(record),
      'KEEPTTL',
    );
  }

  async close(sessionId: string, status: Exclude<SessionStatus, 'active'>): Promise<void> {
    const record = await this.get(sessionId);
    if (!record) {
      return;
    }
    record.status = status;
    record.updated_at = new Date().toISOString();
    // Persist the closed record (drop TTL), and clear the user's active pointer.
    await this.redis.set(this.sessionKey(sessionId), RedisSessionStore.serialize(record));
    await this.redis.del(this.userActiveKey(record.user_id));
  }
}
