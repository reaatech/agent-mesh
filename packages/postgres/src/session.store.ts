import type { SessionRecord, SessionStatus, SessionStore, TurnEntry } from '@reaatech/agent-mesh';
import type { Pool } from 'pg';

const TABLE = 'agent_mesh_sessions';

interface SessionRow {
  session_id: string;
  user_id: string;
  employee_id: string;
  status: SessionStatus;
  active_agent: string;
  turn_history: TurnEntry[];
  workflow_state: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  ttl: Date | null;
}

function mapRow(row: SessionRow): SessionRecord {
  return {
    session_id: row.session_id,
    user_id: row.user_id,
    employee_id: row.employee_id,
    status: row.status,
    active_agent: row.active_agent,
    turn_history: row.turn_history ?? [],
    workflow_state: row.workflow_state ?? {},
    metadata: row.metadata ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ttl: row.ttl ?? new Date(),
  };
}

/** Postgres-backed {@link SessionStore}. Pass an existing `pg` Pool. Run `ensureSchema` first. */
export class PostgresSessionStore implements SessionStore {
  constructor(private readonly pool: Pool) {}

  async create(record: SessionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${TABLE}
        (session_id, user_id, employee_id, status, active_agent, turn_history, workflow_state, metadata, created_at, updated_at, ttl)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11)`,
      [
        record.session_id,
        record.user_id,
        record.employee_id,
        record.status,
        record.active_agent,
        JSON.stringify(record.turn_history),
        JSON.stringify(record.workflow_state),
        record.metadata ? JSON.stringify(record.metadata) : null,
        record.created_at,
        record.updated_at,
        record.ttl,
      ],
    );
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const res = await this.pool.query<SessionRow>(`SELECT * FROM ${TABLE} WHERE session_id = $1`, [
      sessionId,
    ]);
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async getActiveByUser(userId: string): Promise<SessionRecord | null> {
    const res = await this.pool.query<SessionRow>(
      `SELECT * FROM ${TABLE}
       WHERE user_id = $1 AND status = 'active' AND ttl > now()
       ORDER BY updated_at DESC LIMIT 1`,
      [userId],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async appendTurn(
    sessionId: string,
    turn: TurnEntry,
    opts: { maxTurns: number; ttlMs: number },
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<{ turn_history: TurnEntry[] }>(
        `SELECT turn_history FROM ${TABLE} WHERE session_id = $1 FOR UPDATE`,
        [sessionId],
      );
      if (res.rowCount === 0) {
        await client.query('ROLLBACK');
        throw new Error(`Session ${sessionId} not found`);
      }
      const current = (res.rows[0]?.turn_history ?? []).slice(-opts.maxTurns + 1);
      const next = [...current, turn];
      await client.query(
        `UPDATE ${TABLE} SET turn_history = $2::jsonb, updated_at = $3, ttl = $4 WHERE session_id = $1`,
        [
          sessionId,
          JSON.stringify(next),
          new Date().toISOString(),
          new Date(Date.now() + opts.ttlMs),
        ],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateWorkflowState(
    sessionId: string,
    workflowState: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE ${TABLE} SET workflow_state = $2::jsonb, updated_at = $3 WHERE session_id = $1`,
      [sessionId, JSON.stringify(workflowState), new Date().toISOString()],
    );
  }

  async seed(
    sessionId: string,
    data: { turn_history: TurnEntry[]; workflow_state: Record<string, unknown> },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE ${TABLE} SET turn_history = $2::jsonb, workflow_state = $3::jsonb, updated_at = $4 WHERE session_id = $1`,
      [
        sessionId,
        JSON.stringify(data.turn_history),
        JSON.stringify(data.workflow_state),
        new Date().toISOString(),
      ],
    );
  }

  async close(sessionId: string, status: Exclude<SessionStatus, 'active'>): Promise<void> {
    await this.pool.query(
      `UPDATE ${TABLE} SET status = $2, updated_at = $3, ttl = NULL WHERE session_id = $1`,
      [sessionId, status, new Date().toISOString()],
    );
  }
}
