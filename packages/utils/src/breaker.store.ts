import type {
  BreakerStore,
  CircuitBreakerState,
  CircuitState,
  LeaderState,
} from '@reaatech/agent-mesh';
import { getFirestore } from '@reaatech/agent-mesh-session';

export type { BreakerStore } from '@reaatech/agent-mesh';

const CIRCUIT_BREAKERS_COLLECTION = 'circuit_breakers';
const LEADER_ELECTION_COLLECTION = 'leader_election';
const LEADER_DOC_ID = 'circuit_breaker_sync_leader';

function mapBreakerData(data: Record<string, unknown>): CircuitBreakerState {
  return {
    agent_id: data.agent_id as string,
    state: data.state as CircuitState,
    failure_count: data.failure_count as number,
    success_count: data.success_count as number,
    last_failure_time: data.last_failure_time as number | undefined,
    last_state_change: data.last_state_change as number,
    half_open_calls: data.half_open_calls as number,
    backoff_multiplier: data.backoff_multiplier as number,
  };
}

/** Default persistence backend — behaviour-identical to the pre-extraction module. */
export class FirestoreBreakerStore implements BreakerStore {
  async load(agentId: string): Promise<CircuitBreakerState | null> {
    try {
      const doc = await getFirestore().collection(CIRCUIT_BREAKERS_COLLECTION).doc(agentId).get();
      const data = doc.exists ? doc.data() : null;
      return data ? mapBreakerData(data) : null;
    } catch {
      return null;
    }
  }

  async loadAll(): Promise<Map<string, CircuitBreakerState>> {
    const snapshot = await getFirestore().collection(CIRCUIT_BREAKERS_COLLECTION).get();
    const states = new Map<string, CircuitBreakerState>();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!data) {
        continue;
      }
      const state = mapBreakerData(data);
      states.set(state.agent_id, state);
    }
    return states;
  }

  async persist(state: CircuitBreakerState, instanceId: string): Promise<void> {
    const docRef = getFirestore().collection(CIRCUIT_BREAKERS_COLLECTION).doc(state.agent_id);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await docRef.set(
          { ...state, last_synced: Date.now(), synced_by: instanceId },
          { merge: true },
        );
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        const retryable =
          message.includes('quota') ||
          message.includes('deadline') ||
          message.includes('unavailable');

        if (!retryable || attempt === 2) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  }

  async acquireLeadership(instanceId: string, leaseMs: number): Promise<LeaderState> {
    const firestore = getFirestore();
    const now = Date.now();
    const leaseExpiresAt = now + leaseMs;
    const leaderRef = firestore.collection(LEADER_ELECTION_COLLECTION).doc(LEADER_DOC_ID);

    let result: LeaderState | null = null;

    await firestore.runTransaction(async (transaction) => {
      const doc = await transaction.get(leaderRef);
      const data = doc.exists ? doc.data() : null;

      if (!data) {
        transaction.set(leaderRef, {
          leader_id: instanceId,
          last_heartbeat: now,
          lease_expires_at: leaseExpiresAt,
          acquired_at: now,
        });
        result = { isLeader: true, leaderId: instanceId, lastHeartbeat: now, leaseExpiresAt };
        return;
      }

      const currentLeaseExpiresAt = data.lease_expires_at as number;
      const currentLeaderId = data.leader_id as string;

      if (now > currentLeaseExpiresAt || currentLeaderId === instanceId) {
        transaction.update(leaderRef, {
          leader_id: instanceId,
          last_heartbeat: now,
          lease_expires_at: leaseExpiresAt,
        });
        result = { isLeader: true, leaderId: instanceId, lastHeartbeat: now, leaseExpiresAt };
      } else {
        result = {
          isLeader: false,
          leaderId: currentLeaderId,
          lastHeartbeat: data.last_heartbeat as number,
          leaseExpiresAt: currentLeaseExpiresAt,
        };
      }
    });

    if (!result) {
      throw new Error('Leadership acquisition produced no result');
    }
    return result;
  }
}

/**
 * Dependency-free store for tests, local dev, and single-instance embedding.
 * A single instance is always the leader (no cross-instance coordination).
 */
export class InMemoryBreakerStore implements BreakerStore {
  private readonly states = new Map<string, CircuitBreakerState>();

  async load(agentId: string): Promise<CircuitBreakerState | null> {
    const state = this.states.get(agentId);
    return state ? { ...state } : null;
  }

  async loadAll(): Promise<Map<string, CircuitBreakerState>> {
    return new Map(Array.from(this.states, ([id, state]) => [id, { ...state }]));
  }

  async persist(state: CircuitBreakerState, _instanceId: string): Promise<void> {
    this.states.set(state.agent_id, { ...state });
  }

  async acquireLeadership(instanceId: string, leaseMs: number): Promise<LeaderState> {
    const now = Date.now();
    return {
      isLeader: true,
      leaderId: instanceId,
      lastHeartbeat: now,
      leaseExpiresAt: now + leaseMs,
    };
  }
}

let activeStore: BreakerStore | null = null;

/** Inject a custom {@link BreakerStore}. Overrides the default Firestore backend. */
export function setBreakerStore(store: BreakerStore): void {
  activeStore = store;
}

/** The active store — the injected one, or a lazily-created Firestore store by default. */
export function getBreakerStore(): BreakerStore {
  if (!activeStore) {
    activeStore = new FirestoreBreakerStore();
  }
  return activeStore;
}

/** Reset to the default (Firestore) store. Primarily for tests. */
export function resetBreakerStore(): void {
  activeStore = null;
}
