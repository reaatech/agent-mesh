import type { Pool } from 'pg';

/**
 * DDL for the Postgres-backed session + circuit-breaker stores. Idempotent —
 * safe to run on boot. Table names are fixed; wrap in your own schema/search_path
 * if you need isolation.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_mesh_sessions (
  session_id     text PRIMARY KEY,
  user_id        text NOT NULL,
  employee_id    text NOT NULL DEFAULT '',
  status         text NOT NULL,
  active_agent   text NOT NULL DEFAULT '',
  turn_history   jsonb NOT NULL DEFAULT '[]'::jsonb,
  workflow_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata       jsonb,
  created_at     text NOT NULL,
  updated_at     text NOT NULL,
  ttl            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_agent_mesh_sessions_user_active
  ON agent_mesh_sessions (user_id, status, ttl);

CREATE TABLE IF NOT EXISTS agent_mesh_circuit_breakers (
  agent_id          text PRIMARY KEY,
  state             text NOT NULL,
  failure_count     integer NOT NULL DEFAULT 0,
  success_count     integer NOT NULL DEFAULT 0,
  last_failure_time bigint,
  last_state_change bigint NOT NULL,
  half_open_calls   integer NOT NULL DEFAULT 0,
  backoff_multiplier double precision NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS agent_mesh_leader (
  id               text PRIMARY KEY,
  leader_id        text NOT NULL,
  last_heartbeat   bigint NOT NULL,
  lease_expires_at bigint NOT NULL
);
`;

/** Run the idempotent DDL. Call once on boot before using the stores. */
export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
