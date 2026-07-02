import type { CircuitBreakerState, LeaderState } from '@reaatech/agent-mesh';
import { env } from '@reaatech/agent-mesh';
import { getBreakerStore } from './breaker.store.js';
import { circuitBreaker } from './circuitBreaker.js';

const LEADER_LEASE_MS = env.CB_LEADER_LEASE_MS;
const SYNC_INTERVAL_MS = env.CB_SYNC_INTERVAL_MS;

let currentLeaderState: LeaderState | null = null;
let syncIntervalHandle: ReturnType<typeof setInterval> | null = null;

function getInstanceId(): string {
  return `instance-${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

let cachedInstanceId: string | null = null;
function getOrCreateInstanceId(): string {
  if (!cachedInstanceId) {
    cachedInstanceId = getInstanceId();
  }
  return cachedInstanceId;
}

async function tryAcquireLeadership(): Promise<boolean> {
  try {
    currentLeaderState = await getBreakerStore().acquireLeadership(
      getOrCreateInstanceId(),
      LEADER_LEASE_MS,
    );
    return currentLeaderState.isLeader;
  } catch {
    return false;
  }
}

export function isLeader(): boolean {
  if (!currentLeaderState) {
    return false;
  }
  return currentLeaderState.isLeader && Date.now() < currentLeaderState.leaseExpiresAt;
}

export function getLeaderId(): string | null {
  return currentLeaderState?.leaderId ?? null;
}

export async function persistCircuitBreakerState(state: CircuitBreakerState): Promise<void> {
  await getBreakerStore().persist(state, getOrCreateInstanceId());
}

export async function loadCircuitBreakerState(
  agentId: string,
): Promise<CircuitBreakerState | null> {
  return getBreakerStore().load(agentId);
}

export async function loadAllCircuitBreakerStates(): Promise<Map<string, CircuitBreakerState>> {
  return getBreakerStore().loadAll();
}

async function syncStates(): Promise<void> {
  if (!isLeader()) {
    return;
  }

  try {
    const localStates = Array.from(circuitBreaker.getAllStates().values());

    for (const state of localStates) {
      await persistCircuitBreakerState(state);
    }
  } catch {
    // Best effort sync
  }
}

export async function restoreCircuitBreakerStates(maxRetries = 5): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const states = await loadAllCircuitBreakerStates();

      circuitBreaker.setStates(states.values());

      return;
    } catch (error) {
      lastError = error as Error;
      const backoffMs = Math.min(1000 * 2 ** attempt, 30000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError ?? new Error('Failed to restore circuit breaker states');
}

export async function startCircuitBreakerPersistence(): Promise<void> {
  await tryAcquireLeadership();

  await restoreCircuitBreakerStates();

  if (isLeader()) {
    syncIntervalHandle = setInterval(async () => {
      await tryAcquireLeadership();

      if (isLeader()) {
        await syncStates();
      } else {
        if (syncIntervalHandle) {
          clearInterval(syncIntervalHandle);
          syncIntervalHandle = null;
        }
      }
    }, SYNC_INTERVAL_MS);
  }
}

export function stopCircuitBreakerPersistence(): void {
  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
  }
}

export async function updateCircuitBreakerState(state: CircuitBreakerState): Promise<void> {
  circuitBreaker.setState(state);

  await persistCircuitBreakerState(state);
}

export function getLocalCircuitBreakerState(agentId: string): CircuitBreakerState | undefined {
  return circuitBreaker.getAllStates().get(agentId);
}

export function setLocalCircuitBreakerState(state: CircuitBreakerState): void {
  circuitBreaker.setState(state);
}

export function clearLocalState(): void {
  circuitBreaker.clear();
}

export function resetLeaderState(): void {
  currentLeaderState = null;
}

export function __setInstanceIdForTests(instanceId: string): void {
  cachedInstanceId = instanceId;
}
