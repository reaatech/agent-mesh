/**
 * Circuit breaker persistence layer using Firestore
 * Implements leader election for cross-instance consistency
 */

import { getFirestore } from '../session/firestoreClient.js';
import { env } from '../config/env.js';
import type { CircuitBreakerState, CircuitState } from '../types/domain.js';
import { circuitBreaker } from './circuitBreaker.js';

/** Collection name for circuit breaker state */
const CIRCUIT_BREAKERS_COLLECTION = 'circuit_breakers';

/** Collection name for leader election */
const LEADER_ELECTION_COLLECTION = 'leader_election';

/** Leader election document ID */
const LEADER_DOC_ID = 'circuit_breaker_sync_leader';

/** Leader lease duration in milliseconds */
const LEADER_LEASE_MS = env.CB_LEADER_LEASE_MS;

/** Sync interval for leader */
const SYNC_INTERVAL_MS = env.CB_SYNC_INTERVAL_MS;

/**
 * Leader election state
 */
interface LeaderState {
  isLeader: boolean;
  leaderId: string;
  lastHeartbeat: number;
  leaseExpiresAt: number;
}

/**
 * Current leader state
 */
let currentLeaderState: LeaderState | null = null;

/**
 * Sync interval handle
 */
let syncIntervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Generate a unique instance ID for leader election
 */
function getInstanceId(): string {
  return `instance-${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Get the instance ID (cached)
 */
let cachedInstanceId: string | null = null;
function getOrCreateInstanceId(): string {
  if (!cachedInstanceId) {
    cachedInstanceId = getInstanceId();
  }
  return cachedInstanceId;
}

/**
 * Try to acquire or renew leadership
 */
async function tryAcquireLeadership(): Promise<boolean> {
  const firestore = getFirestore();
  const instanceId = getOrCreateInstanceId();
  const now = Date.now();
  const leaseExpiresAt = now + LEADER_LEASE_MS;

  const leaderRef = firestore.collection(LEADER_ELECTION_COLLECTION).doc(LEADER_DOC_ID);

  try {
    await firestore.runTransaction(async (transaction) => {
      const doc = await transaction.get(leaderRef);

      if (!doc.exists) {
        // No leader exists, claim leadership
        transaction.set(leaderRef, {
          leader_id: instanceId,
          last_heartbeat: now,
          lease_expires_at: leaseExpiresAt,
          acquired_at: now,
        });
        currentLeaderState = {
          isLeader: true,
          leaderId: instanceId,
          lastHeartbeat: now,
          leaseExpiresAt,
        };
        return;
      }

      const data = doc.data();
      if (!data) {
        // Document exists but no data, claim leadership
        transaction.set(leaderRef, {
          leader_id: instanceId,
          last_heartbeat: now,
          lease_expires_at: leaseExpiresAt,
          acquired_at: now,
        });
        currentLeaderState = {
          isLeader: true,
          leaderId: instanceId,
          lastHeartbeat: now,
          leaseExpiresAt,
        };
        return;
      }

      // Check if current leader's lease has expired
      const currentLeaseExpiresAt = data.lease_expires_at as number;
      const currentLeaderId = data.leader_id as string;

      if (now > currentLeaseExpiresAt || currentLeaderId === instanceId) {
        // Lease expired or we're the current leader, renew/claim
        transaction.update(leaderRef, {
          leader_id: instanceId,
          last_heartbeat: now,
          lease_expires_at: leaseExpiresAt,
        });
        currentLeaderState = {
          isLeader: true,
          leaderId: instanceId,
          lastHeartbeat: now,
          leaseExpiresAt,
        };
      } else {
        // Another instance is the leader
        currentLeaderState = {
          isLeader: false,
          leaderId: currentLeaderId,
          lastHeartbeat: data.last_heartbeat as number,
          leaseExpiresAt: currentLeaseExpiresAt,
        };
      }
    });

    return currentLeaderState?.isLeader ?? false;
  } catch (_error) {
    return false;
  }
}

/**
 * Check if this instance is the leader
 */
export function isLeader(): boolean {
  if (!currentLeaderState) {
    return false;
  }
  return currentLeaderState.isLeader && Date.now() < currentLeaderState.leaseExpiresAt;
}

/**
 * Get the current leader ID
 */
export function getLeaderId(): string | null {
  return currentLeaderState?.leaderId ?? null;
}

/**
 * Save circuit breaker state to Firestore
 */
export async function persistCircuitBreakerState(state: CircuitBreakerState): Promise<void> {
  const firestore = getFirestore();
  const docRef = firestore.collection(CIRCUIT_BREAKERS_COLLECTION).doc(state.agent_id);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await docRef.set(
        {
          ...state,
          last_synced: Date.now(),
          synced_by: getOrCreateInstanceId(),
        },
        { merge: true },
      );
      return;
    } catch (_error) {
      const message = _error instanceof Error ? _error.message.toLowerCase() : '';
      const retryable =
        message.includes('quota') ||
        message.includes('deadline') ||
        message.includes('unavailable');

      if (!retryable || attempt === 2) {
        return;
      }

      const backoffMs = 250 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

/**
 * Load circuit breaker state from Firestore
 */
export async function loadCircuitBreakerState(
  agentId: string,
): Promise<CircuitBreakerState | null> {
  const firestore = getFirestore();
  const docRef = firestore.collection(CIRCUIT_BREAKERS_COLLECTION).doc(agentId);

  try {
    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data) {
      return null;
    }

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
  } catch {
    return null;
  }
}

/**
 * Load all circuit breaker states from Firestore
 */
export async function loadAllCircuitBreakerStates(): Promise<Map<string, CircuitBreakerState>> {
  const firestore = getFirestore();
  const snapshot = await firestore.collection(CIRCUIT_BREAKERS_COLLECTION).get();

  const states = new Map<string, CircuitBreakerState>();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data) {
      continue;
    }

    const state: CircuitBreakerState = {
      agent_id: data.agent_id as string,
      state: data.state as CircuitState,
      failure_count: data.failure_count as number,
      success_count: data.success_count as number,
      last_failure_time: data.last_failure_time as number | undefined,
      last_state_change: data.last_state_change as number,
      half_open_calls: data.half_open_calls as number,
      backoff_multiplier: data.backoff_multiplier as number,
    };

    states.set(state.agent_id, state);
  }

  return states;
}

/**
 * Sync local state with persisted state (leader only)
 */
async function syncStates(): Promise<void> {
  if (!isLeader()) {
    return;
  }

  try {
    const localStates = Array.from(circuitBreaker.getAllStates().values());

    // Persist each state
    for (const state of localStates) {
      await persistCircuitBreakerState(state);
    }
  } catch {
    // Best effort sync
  }
}

/**
 * Restore circuit breaker states from Firestore at startup
 * Uses retries with exponential backoff
 */
export async function restoreCircuitBreakerStates(maxRetries = 5): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const states = await loadAllCircuitBreakerStates();

      circuitBreaker.setStates(states.values());

      return;
    } catch (error) {
      lastError = error as Error;
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError ?? new Error('Failed to restore circuit breaker states');
}

/**
 * Start the leader election and sync process
 */
export async function startCircuitBreakerPersistence(): Promise<void> {
  // Initial leadership attempt
  await tryAcquireLeadership();

  // Restore states from Firestore
  await restoreCircuitBreakerStates();

  // Start periodic sync if leader
  if (isLeader()) {
    syncIntervalHandle = setInterval(async () => {
      // Try to renew leadership
      await tryAcquireLeadership();

      if (isLeader()) {
        await syncStates();
      } else {
        // Lost leadership, stop syncing
        if (syncIntervalHandle) {
          clearInterval(syncIntervalHandle);
          syncIntervalHandle = null;
        }
      }
    }, SYNC_INTERVAL_MS);
  }
}

/**
 * Stop the persistence sync process
 */
export function stopCircuitBreakerPersistence(): void {
  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
  }
}

/**
 * Update local state and persist to Firestore
 */
export async function updateCircuitBreakerState(state: CircuitBreakerState): Promise<void> {
  circuitBreaker.setState(state);

  await persistCircuitBreakerState(state);
}

/**
 * Get local circuit breaker state
 */
export function getLocalCircuitBreakerState(agentId: string): CircuitBreakerState | undefined {
  return circuitBreaker.getAllStates().get(agentId);
}

/**
 * Set local circuit breaker state (without persistence)
 */
export function setLocalCircuitBreakerState(state: CircuitBreakerState): void {
  circuitBreaker.setState(state);
}

/**
 * Clear all local state (for testing)
 */
export function clearLocalState(): void {
  circuitBreaker.clear();
}

/**
 * Reset leader state (for testing)
 */
export function resetLeaderState(): void {
  currentLeaderState = null;
}

export function __setInstanceIdForTests(instanceId: string): void {
  cachedInstanceId = instanceId;
}
