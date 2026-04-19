import { beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();
const leaderDocPath = 'leader_election/circuit_breaker_sync_leader';

function getDoc(path: string): Record<string, unknown> | undefined {
  return docs.get(path);
}

vi.mock('../../src/config/env.js', () => ({
  env: {
    CB_SYNC_INTERVAL_MS: 5000,
    CB_LEADER_LEASE_MS: 15000,
    CB_LEADER_RENEWAL_MS: 5000,
  },
}));

vi.mock('../../src/session/firestoreClient.js', () => ({
  getFirestore: () => ({
    collection: (collectionName: string) => ({
      doc: (docId: string) => ({
        async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
          const path = `${collectionName}/${docId}`;
          const current = docs.get(path) ?? {};
          docs.set(path, options?.merge ? { ...current, ...data } : { ...data });
        },
        async get() {
          const path = `${collectionName}/${docId}`;
          const data = docs.get(path);
          return {
            id: docId,
            exists: Boolean(data),
            data: () => data,
          };
        },
      }),
      async get() {
        const prefix = `${collectionName}/`;
        const matched = Array.from(docs.entries())
          .filter(([path]) => path.startsWith(prefix))
          .map(([path, data]) => ({
            id: path.slice(prefix.length),
            data: () => data,
          }));
        return { docs: matched };
      },
    }),
    async runTransaction<T>(
      handler: (transaction: {
        get: (docRef: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (docRef: { set: (data: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) => Promise<void>;
        update: (docRef: { set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void> }, data: Record<string, unknown>) => Promise<void>;
      }) => Promise<T>,
    ) {
      return handler({
        get: async (docRef) => docRef.get(),
        set: async (docRef, data) => docRef.set(data),
        update: async (docRef, data) => docRef.set(data, { merge: true }),
      });
    },
  }),
}));

const persistence = await import('../../src/utils/circuitBreaker.persistence.js');

describe('Circuit breaker persistence integration', () => {
  beforeEach(() => {
    docs.clear();
    persistence.clearLocalState();
    persistence.resetLeaderState();
    persistence.__setInstanceIdForTests('instance-a');
  });

  it('persists and restores state from Firestore', async () => {
    await persistence.persistCircuitBreakerState({
      agent_id: 'agent-a',
      state: 'OPEN',
      failure_count: 5,
      success_count: 0,
      last_failure_time: 123,
      last_state_change: 456,
      half_open_calls: 0,
      backoff_multiplier: 2,
    });

    persistence.clearLocalState();
    await persistence.restoreCircuitBreakerStates(1);

    expect(persistence.getLocalCircuitBreakerState('agent-a')).toEqual(
      expect.objectContaining({
        agent_id: 'agent-a',
        state: 'OPEN',
        failure_count: 5,
      }),
    );
  });

  it('elects a leader and writes the leader lease', async () => {
    await persistence.startCircuitBreakerPersistence();

    expect(persistence.isLeader()).toBe(true);
    expect(getDoc(leaderDocPath)).toEqual(
      expect.objectContaining({
        leader_id: 'instance-a',
      }),
    );

    persistence.stopCircuitBreakerPersistence();
  });
});
