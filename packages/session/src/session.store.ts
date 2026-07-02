import { FieldValue, Timestamp } from '@google-cloud/firestore';
import type { SessionRecord, SessionStatus, SessionStore, TurnEntry } from '@reaatech/agent-mesh';
import { env } from '@reaatech/agent-mesh';
import { getFirestore } from './firestoreClient.js';

export type { SessionStore } from '@reaatech/agent-mesh';

const SESSIONS_COLLECTION = 'sessions';

function mapSessionSnapshot(id: string, data: Record<string, unknown>): SessionRecord {
  const ttlValue = data.ttl as { toDate?: () => Date } | Date | undefined;
  const ttl =
    ttlValue instanceof Date
      ? ttlValue
      : (ttlValue?.toDate?.() ?? new Date(Date.now() + env.SESSION_TTL_MINUTES * 60 * 1000));

  return {
    session_id: id,
    user_id: String(data.user_id ?? ''),
    employee_id: String(data.employee_id ?? ''),
    status: data.status as SessionStatus,
    active_agent: String(data.active_agent ?? ''),
    turn_history: (data.turn_history as TurnEntry[] | undefined) ?? [],
    workflow_state: (data.workflow_state as Record<string, unknown> | undefined) ?? {},
    created_at: String(data.created_at ?? new Date().toISOString()),
    updated_at: String(data.updated_at ?? new Date().toISOString()),
    ttl,
  };
}

/** Default persistence backend — behaviour-identical to the pre-extraction service. */
export class FirestoreSessionStore implements SessionStore {
  async create(record: SessionRecord): Promise<void> {
    const { session_id, ttl, ...rest } = record;
    await getFirestore()
      .collection(SESSIONS_COLLECTION)
      .doc(session_id)
      .create({ ...rest, ttl: Timestamp.fromDate(ttl) });
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const snapshot = await getFirestore().collection(SESSIONS_COLLECTION).doc(sessionId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data();
    if (!data) {
      return null;
    }
    return mapSessionSnapshot(snapshot.id, data as Record<string, unknown>);
  }

  async getActiveByUser(userId: string): Promise<SessionRecord | null> {
    const snapshot = await getFirestore()
      .collection(SESSIONS_COLLECTION)
      .where('user_id', '==', userId)
      .where('status', '==', 'active')
      .where('ttl', '>', Timestamp.fromDate(new Date()))
      .limit(1)
      .get();

    const docSnapshot = snapshot.docs[0];
    if (snapshot.empty || !docSnapshot) {
      return null;
    }
    return mapSessionSnapshot(docSnapshot.id, docSnapshot.data() as Record<string, unknown>);
  }

  async appendTurn(
    sessionId: string,
    turn: TurnEntry,
    opts: { maxTurns: number; ttlMs: number },
  ): Promise<void> {
    const firestore = getFirestore();
    const docRef = firestore.collection(SESSIONS_COLLECTION).doc(sessionId);

    await firestore.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const currentHistory = ((doc.data()?.turn_history as TurnEntry[] | undefined) ?? []).slice(
        -opts.maxTurns + 1,
      );

      transaction.update(docRef, {
        turn_history: [...currentHistory, turn],
        updated_at: new Date().toISOString(),
        ttl: Timestamp.fromDate(new Date(Date.now() + opts.ttlMs)),
      });
    });
  }

  async updateWorkflowState(
    sessionId: string,
    workflowState: Record<string, unknown>,
  ): Promise<void> {
    await getFirestore().collection(SESSIONS_COLLECTION).doc(sessionId).update({
      workflow_state: workflowState,
      updated_at: new Date().toISOString(),
    });
  }

  async seed(
    sessionId: string,
    data: { turn_history: TurnEntry[]; workflow_state: Record<string, unknown> },
  ): Promise<void> {
    await getFirestore().collection(SESSIONS_COLLECTION).doc(sessionId).update({
      turn_history: data.turn_history,
      workflow_state: data.workflow_state,
      updated_at: new Date().toISOString(),
    });
  }

  async close(sessionId: string, status: Exclude<SessionStatus, 'active'>): Promise<void> {
    await getFirestore().collection(SESSIONS_COLLECTION).doc(sessionId).update({
      status,
      updated_at: new Date().toISOString(),
      ttl: FieldValue.delete(),
    });
  }
}

/** Dependency-free store for tests, local dev, and single-instance embedding. */
export class InMemorySessionStore implements SessionStore {
  private readonly records = new Map<string, SessionRecord>();

  async create(record: SessionRecord): Promise<void> {
    this.records.set(record.session_id, { ...record });
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const record = this.records.get(sessionId);
    return record ? { ...record } : null;
  }

  async getActiveByUser(userId: string): Promise<SessionRecord | null> {
    const now = Date.now();
    for (const record of this.records.values()) {
      if (record.user_id === userId && record.status === 'active' && record.ttl.getTime() > now) {
        return { ...record };
      }
    }
    return null;
  }

  async appendTurn(
    sessionId: string,
    turn: TurnEntry,
    opts: { maxTurns: number; ttlMs: number },
  ): Promise<void> {
    const record = this.records.get(sessionId);
    if (!record) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const currentHistory = record.turn_history.slice(-opts.maxTurns + 1);
    record.turn_history = [...currentHistory, turn];
    record.updated_at = new Date().toISOString();
    record.ttl = new Date(Date.now() + opts.ttlMs);
  }

  async updateWorkflowState(
    sessionId: string,
    workflowState: Record<string, unknown>,
  ): Promise<void> {
    const record = this.records.get(sessionId);
    if (!record) {
      return;
    }
    record.workflow_state = workflowState;
    record.updated_at = new Date().toISOString();
  }

  async seed(
    sessionId: string,
    data: { turn_history: TurnEntry[]; workflow_state: Record<string, unknown> },
  ): Promise<void> {
    const record = this.records.get(sessionId);
    if (!record) {
      return;
    }
    record.turn_history = data.turn_history;
    record.workflow_state = data.workflow_state;
    record.updated_at = new Date().toISOString();
  }

  async close(sessionId: string, status: Exclude<SessionStatus, 'active'>): Promise<void> {
    const record = this.records.get(sessionId);
    if (!record) {
      return;
    }
    record.status = status;
    record.updated_at = new Date().toISOString();
  }
}

let activeStore: SessionStore | null = null;

/** Inject a custom {@link SessionStore}. Overrides the default Firestore backend. */
export function setSessionStore(store: SessionStore): void {
  activeStore = store;
}

/** The active store — the injected one, or a lazily-created Firestore store by default. */
export function getSessionStore(): SessionStore {
  if (!activeStore) {
    activeStore = new FirestoreSessionStore();
  }
  return activeStore;
}

/** Reset to the default (Firestore) store. Primarily for tests. */
export function resetSessionStore(): void {
  activeStore = null;
}
