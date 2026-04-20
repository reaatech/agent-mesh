import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CircuitBreakerState } from '../../src/types/domain.js';

const mockDocRef = {
  set: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
};

const mockCollection = vi.fn().mockReturnValue({
  doc: vi.fn().mockReturnValue(mockDocRef),
  get: vi.fn(),
});

const mockRunTransaction = vi.fn();

vi.mock('../../src/session/firestoreClient.js', () => ({
  getFirestore: () => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  }),
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    GOOGLE_CLOUD_PROJECT: 'test-project',
    CB_LEADER_LEASE_MS: 15000,
    CB_SYNC_INTERVAL_MS: 5000,
  },
}));

const {
  persistCircuitBreakerState,
  loadCircuitBreakerState,
  loadAllCircuitBreakerStates,
  restoreCircuitBreakerStates,
  updateCircuitBreakerState,
  getLocalCircuitBreakerState,
  setLocalCircuitBreakerState,
  clearLocalState,
  resetLeaderState,
  isLeader,
  getLeaderId,
  __setInstanceIdForTests,
  startCircuitBreakerPersistence,
  stopCircuitBreakerPersistence,
} = await import('../../src/utils/circuitBreaker.persistence.js');

const sampleState: CircuitBreakerState = {
  agent_id: 'test-agent',
  state: 'CLOSED',
  failure_count: 0,
  success_count: 5,
  last_state_change: Date.now(),
  half_open_calls: 0,
  backoff_multiplier: 1,
};

describe('persistCircuitBreakerState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLocalState();
    resetLeaderState();
    __setInstanceIdForTests('test-instance');
  });

  it('persists state to Firestore', async () => {
    await persistCircuitBreakerState(sampleState);
    expect(mockDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: 'test-agent',
        state: 'CLOSED',
        last_synced: expect.any(Number),
        synced_by: 'test-instance',
      }),
      { merge: true },
    );
  });

  it('retries on retryable errors', async () => {
    mockDocRef.set
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce(undefined);

    await persistCircuitBreakerState(sampleState);
    expect(mockDocRef.set).toHaveBeenCalledTimes(2);
  });

  it('gives up after 3 attempts on retryable error that keeps failing', async () => {
    mockDocRef.set.mockRejectedValue(new Error('quota exceeded or unavailable'));
    await persistCircuitBreakerState(sampleState);
    expect(mockDocRef.set).toHaveBeenCalledTimes(3);
  });

  it('gives up immediately on non-retryable error', async () => {
    mockDocRef.set.mockRejectedValue(new Error('permission denied'));
    await persistCircuitBreakerState(sampleState);
    expect(mockDocRef.set).toHaveBeenCalledTimes(1);
  });
});

describe('loadCircuitBreakerState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns state when document exists', async () => {
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ ...sampleState }),
    });

    const state = await loadCircuitBreakerState('test-agent');
    expect(state).not.toBeNull();
    expect(state?.agent_id).toBe('test-agent');
    expect(state?.state).toBe('CLOSED');
  });

  it('returns null when document does not exist', async () => {
    mockDocRef.get.mockResolvedValue({ exists: false });
    const state = await loadCircuitBreakerState('nonexistent');
    expect(state).toBeNull();
  });

  it('returns null on error', async () => {
    mockDocRef.get.mockRejectedValue(new Error('firestore error'));
    const state = await loadCircuitBreakerState('error-agent');
    expect(state).toBeNull();
  });
});

describe('loadAllCircuitBreakerStates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns map of all states', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      docs: [
        { data: () => ({ ...sampleState, agent_id: 'agent-1' }) },
        { data: () => ({ ...sampleState, agent_id: 'agent-2', state: 'OPEN' }) },
      ],
    });

    mockCollection.mockReturnValue({
      doc: vi.fn().mockReturnValue(mockDocRef),
      get: mockGet,
    });

    const states = await loadAllCircuitBreakerStates();
    expect(states.size).toBe(2);
    expect(states.get('agent-1')?.state).toBe('CLOSED');
    expect(states.get('agent-2')?.state).toBe('OPEN');
  });
});

describe('restoreCircuitBreakerStates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLocalState();
  });

  it('restores states from Firestore', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      docs: [{ data: () => ({ ...sampleState, agent_id: 'agent-1' }) }],
    });

    mockCollection.mockReturnValue({
      doc: vi.fn().mockReturnValue(mockDocRef),
      get: mockGet,
    });

    await restoreCircuitBreakerStates(1);
    const local = getLocalCircuitBreakerState('agent-1');
    expect(local).toBeDefined();
    expect(local?.agent_id).toBe('agent-1');
  });

  it('retries on failure', async () => {
    const mockGet = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue({ docs: [] });

    mockCollection.mockReturnValue({
      doc: vi.fn().mockReturnValue(mockDocRef),
      get: mockGet,
    });

    await restoreCircuitBreakerStates(3);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries', async () => {
    const mockGet = vi.fn().mockRejectedValue(new Error('persistent'));

    mockCollection.mockReturnValue({
      doc: vi.fn().mockReturnValue(mockDocRef),
      get: mockGet,
    });

    await expect(restoreCircuitBreakerStates(2)).rejects.toThrow('persistent');
  });
});

describe('updateCircuitBreakerState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLocalState();
  });

  it('updates local state and persists', async () => {
    await updateCircuitBreakerState(sampleState);
    expect(getLocalCircuitBreakerState('test-agent')).toEqual(sampleState);
    expect(mockDocRef.set).toHaveBeenCalled();
  });
});

describe('local state management', () => {
  beforeEach(() => {
    clearLocalState();
  });

  it('setLocalCircuitBreakerState sets without persistence', () => {
    setLocalCircuitBreakerState(sampleState);
    expect(getLocalCircuitBreakerState('test-agent')).toEqual(sampleState);
  });

  it('clearLocalState removes all entries', () => {
    setLocalCircuitBreakerState(sampleState);
    clearLocalState();
    expect(getLocalCircuitBreakerState('test-agent')).toBeUndefined();
  });

  it('getLocalCircuitBreakerState returns undefined for missing', () => {
    expect(getLocalCircuitBreakerState('missing')).toBeUndefined();
  });
});

describe('leader election', () => {
  beforeEach(() => {
    resetLeaderState();
    clearLocalState();
    vi.clearAllMocks();
    __setInstanceIdForTests('test-leader-instance');
  });

  it('isLeader returns false when no leader state', () => {
    expect(isLeader()).toBe(false);
  });

  it('getLeaderId returns null when no leader state', () => {
    expect(getLeaderId()).toBeNull();
  });

  it('startCircuitBreakerPersistence becomes leader when no existing leader', async () => {
    mockRunTransaction.mockImplementation(async (callback) => {
      const mockDoc = {
        exists: false,
        data: () => null,
      };
      return callback({
        get: vi.fn().mockResolvedValue(mockDoc),
        set: vi.fn(),
        update: vi.fn(),
      });
    });

    mockDocRef.get.mockResolvedValue({ exists: false, docs: [] });
    mockCollection.mockReturnValue({
      doc: vi.fn().mockReturnValue(mockDocRef),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    });

    await startCircuitBreakerPersistence();

    expect(isLeader()).toBe(true);
    expect(getLeaderId()).toBe('test-leader-instance');

    stopCircuitBreakerPersistence();
  });

  it('stopCircuitBreakerPersistence clears sync interval', () => {
    stopCircuitBreakerPersistence();
    expect(isLeader()).toBe(false);
  });
});

describe('startCircuitBreakerPersistence', () => {
  beforeEach(() => {
    resetLeaderState();
    clearLocalState();
    vi.clearAllMocks();
    __setInstanceIdForTests('start-test-instance');
  });

  afterEach(() => {
    stopCircuitBreakerPersistence();
  });

  it('initializes without throwing', async () => {
    mockRunTransaction.mockImplementation(async (callback) => {
      const mockDoc = {
        exists: false,
        data: () => null,
      };
      return callback({
        get: vi.fn().mockResolvedValue(mockDoc),
        set: vi.fn(),
        update: vi.fn(),
      });
    });

    mockDocRef.get.mockResolvedValue({ exists: false, docs: [] });
    mockCollection.mockReturnValue({
      doc: vi.fn().mockReturnValue(mockDocRef),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    });

    await expect(startCircuitBreakerPersistence()).resolves.not.toThrow();
  });
});

describe('stopCircuitBreakerPersistence', () => {
  it('clears sync interval handle', () => {
    stopCircuitBreakerPersistence();
    stopCircuitBreakerPersistence();
  });
});
