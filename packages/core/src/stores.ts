import type { CircuitBreakerState, SessionRecord, SessionStatus, TurnEntry } from './domain.js';

/**
 * Persistence seam for multi-turn sessions. The built-in Firestore implementation
 * is the default; alternative backends (Postgres, Redis, in-memory) implement this
 * interface and are injected via the session package's `setSessionStore`.
 *
 * Policy (TTL, max-turns) is passed in by the caller so each backend owns only the
 * atomic read-modify-write, not the business rules.
 */
export interface SessionStore {
  create(record: SessionRecord): Promise<void>;
  get(sessionId: string): Promise<SessionRecord | null>;
  /** Active, non-expired session for a user, if any. */
  getActiveByUser(userId: string): Promise<SessionRecord | null>;
  /** Append a turn atomically, trimming to `maxTurns` and refreshing TTL by `ttlMs`. */
  appendTurn(
    sessionId: string,
    turn: TurnEntry,
    opts: { maxTurns: number; ttlMs: number },
  ): Promise<void>;
  updateWorkflowState(sessionId: string, workflowState: Record<string, unknown>): Promise<void>;
  /** Seed an existing session's history/state (used when resuming a prior session). */
  seed(
    sessionId: string,
    data: { turn_history: TurnEntry[]; workflow_state: Record<string, unknown> },
  ): Promise<void>;
  close(sessionId: string, status: Exclude<SessionStatus, 'active'>): Promise<void>;
}

/** Result of a leadership-acquisition attempt (used by circuit-breaker sync). */
export interface LeaderState {
  isLeader: boolean;
  leaderId: string;
  lastHeartbeat: number;
  leaseExpiresAt: number;
}

/**
 * Persistence seam for circuit-breaker state + leader election. The built-in
 * Firestore implementation is the default; alternative backends implement this
 * interface and are injected via the utils package's `setBreakerStore`.
 */
export interface BreakerStore {
  load(agentId: string): Promise<CircuitBreakerState | null>;
  loadAll(): Promise<Map<string, CircuitBreakerState>>;
  persist(state: CircuitBreakerState, instanceId: string): Promise<void>;
  /** Attempt to acquire/renew the sync leadership lease for `instanceId`. */
  acquireLeadership(instanceId: string, leaseMs: number): Promise<LeaderState>;
}
