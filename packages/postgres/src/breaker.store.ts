import type {
  BreakerStore,
  CircuitBreakerState,
  CircuitState,
  LeaderState,
} from '@reaatech/agent-mesh';
import type { Pool } from 'pg';

const BREAKERS = 'agent_mesh_circuit_breakers';
const LEADER = 'agent_mesh_leader';
const LEADER_ID = 'circuit_breaker_sync_leader';

interface BreakerRow {
  agent_id: string;
  state: CircuitState;
  failure_count: number;
  success_count: number;
  last_failure_time: string | null;
  last_state_change: string;
  half_open_calls: number;
  backoff_multiplier: number;
}

function mapRow(row: BreakerRow): CircuitBreakerState {
  return {
    agent_id: row.agent_id,
    state: row.state,
    failure_count: Number(row.failure_count),
    success_count: Number(row.success_count),
    last_failure_time: row.last_failure_time == null ? undefined : Number(row.last_failure_time),
    last_state_change: Number(row.last_state_change),
    half_open_calls: Number(row.half_open_calls),
    backoff_multiplier: Number(row.backoff_multiplier),
  };
}

/**
 * Postgres-backed {@link BreakerStore}. Leader election uses a single-row lease
 * table with `SELECT … FOR UPDATE` (a new instance can take over only once the
 * lease has expired). Run `ensureSchema` first.
 */
export class PostgresBreakerStore implements BreakerStore {
  constructor(private readonly pool: Pool) {}

  async load(agentId: string): Promise<CircuitBreakerState | null> {
    const res = await this.pool.query<BreakerRow>(`SELECT * FROM ${BREAKERS} WHERE agent_id = $1`, [
      agentId,
    ]);
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async loadAll(): Promise<Map<string, CircuitBreakerState>> {
    const res = await this.pool.query<BreakerRow>(`SELECT * FROM ${BREAKERS}`);
    const states = new Map<string, CircuitBreakerState>();
    for (const row of res.rows) {
      const state = mapRow(row);
      states.set(state.agent_id, state);
    }
    return states;
  }

  async persist(state: CircuitBreakerState, _instanceId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${BREAKERS}
        (agent_id, state, failure_count, success_count, last_failure_time, last_state_change, half_open_calls, backoff_multiplier)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (agent_id) DO UPDATE SET
        state = EXCLUDED.state,
        failure_count = EXCLUDED.failure_count,
        success_count = EXCLUDED.success_count,
        last_failure_time = EXCLUDED.last_failure_time,
        last_state_change = EXCLUDED.last_state_change,
        half_open_calls = EXCLUDED.half_open_calls,
        backoff_multiplier = EXCLUDED.backoff_multiplier`,
      [
        state.agent_id,
        state.state,
        state.failure_count,
        state.success_count,
        state.last_failure_time ?? null,
        state.last_state_change,
        state.half_open_calls,
        state.backoff_multiplier,
      ],
    );
  }

  async acquireLeadership(instanceId: string, leaseMs: number): Promise<LeaderState> {
    const now = Date.now();
    const leaseExpiresAt = now + leaseMs;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO ${LEADER} (id, leader_id, last_heartbeat, lease_expires_at)
         VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
        [LEADER_ID, instanceId, now, leaseExpiresAt],
      );
      const res = await client.query<{ leader_id: string; lease_expires_at: string }>(
        `SELECT leader_id, lease_expires_at FROM ${LEADER} WHERE id = $1 FOR UPDATE`,
        [LEADER_ID],
      );
      const row = res.rows[0];
      const currentLease = row ? Number(row.lease_expires_at) : 0;

      let result: LeaderState;
      if (!row || row.leader_id === instanceId || now > currentLease) {
        await client.query(
          `UPDATE ${LEADER} SET leader_id = $2, last_heartbeat = $3, lease_expires_at = $4 WHERE id = $1`,
          [LEADER_ID, instanceId, now, leaseExpiresAt],
        );
        result = { isLeader: true, leaderId: instanceId, lastHeartbeat: now, leaseExpiresAt };
      } else {
        result = {
          isLeader: false,
          leaderId: row.leader_id,
          lastHeartbeat: now,
          leaseExpiresAt: currentLease,
        };
      }
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
