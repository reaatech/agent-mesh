import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { PostgresBreakerStore } from './breaker.store.js';
import { ensureSchema } from './schema.js';
import { PostgresSessionStore } from './session.store.js';

type QueryResult = { rows: unknown[]; rowCount?: number };
type Responder = (sql: string, params?: unknown[]) => QueryResult;

// Mock pg Pool — records SQL and returns canned rows. Real behaviour (jsonb,
// FOR UPDATE, timestamptz) needs a live Postgres; see the package README.
class MockPool {
  calls: string[] = [];
  constructor(private readonly responder: Responder) {}
  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    this.calls.push(sql);
    return this.responder(sql, params);
  }
  async connect() {
    return {
      query: async (sql: string, params?: unknown[]) => {
        this.calls.push(sql);
        return this.responder(sql, params);
      },
      release() {},
    };
  }
}

describe('ensureSchema', () => {
  it('runs the idempotent DDL', async () => {
    const pool = new MockPool(() => ({ rows: [] }));
    await ensureSchema(pool as unknown as Pool);
    expect(
      pool.calls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS agent_mesh_sessions')),
    ).toBe(true);
  });
});

describe('PostgresSessionStore', () => {
  it('maps a row to a SessionRecord', async () => {
    const ttl = new Date(Date.now() + 60_000);
    const pool = new MockPool((sql) => {
      if (sql.startsWith('SELECT * FROM agent_mesh_sessions WHERE session_id')) {
        return {
          rows: [
            {
              session_id: 's1',
              user_id: 'u1',
              employee_id: 'e1',
              status: 'active',
              active_agent: 'a1',
              turn_history: [
                { role: 'user', content: 'hi', timestamp: '2026-01-01T00:00:00.000Z' },
              ],
              workflow_state: { step: 1 },
              metadata: { orgId: 'org-1' },
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
              ttl,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const store = new PostgresSessionStore(pool as unknown as Pool);
    const rec = await store.get('s1');
    expect(rec?.session_id).toBe('s1');
    expect(rec?.turn_history).toHaveLength(1);
    expect(rec?.metadata).toEqual({ orgId: 'org-1' });
    expect(rec?.ttl).toBe(ttl);
  });
});

describe('PostgresBreakerStore', () => {
  it('loads + number-coerces breaker state', async () => {
    const pool = new MockPool(() => ({
      rows: [
        {
          agent_id: 'a1',
          state: 'HALF_OPEN',
          failure_count: '2',
          success_count: '1',
          last_failure_time: '1700000000000',
          last_state_change: '1700000000001',
          half_open_calls: '0',
          backoff_multiplier: '2',
        },
      ],
    }));
    const store = new PostgresBreakerStore(pool as unknown as Pool);
    const state = await store.load('a1');
    expect(state?.state).toBe('HALF_OPEN');
    expect(state?.failure_count).toBe(2);
    expect(state?.last_failure_time).toBe(1_700_000_000_000);
  });

  it('claims leadership when the lease is expired', async () => {
    const pool = new MockPool((sql) => {
      if (sql.includes('SELECT leader_id')) {
        return { rows: [{ leader_id: 'other', lease_expires_at: '1' }] }; // long-expired
      }
      return { rows: [] };
    });
    const store = new PostgresBreakerStore(pool as unknown as Pool);
    const res = await store.acquireLeadership('inst-1', 30_000);
    expect(res.isLeader).toBe(true);
    expect(res.leaderId).toBe('inst-1');
  });
});
