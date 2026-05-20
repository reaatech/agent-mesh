import crypto from 'node:crypto';
import { FieldValue, Timestamp } from '@google-cloud/firestore';
import { PubSub } from '@google-cloud/pubsub';
import type { SessionRecord, SessionStatus, TurnEntry } from '@reaatech/agent-mesh';
import { env, PUBSUB_TOPICS } from '@reaatech/agent-mesh';
import { getFirestore } from './firestoreClient.js';

const uuidv4 = crypto.randomUUID;
const SESSIONS_COLLECTION = 'sessions';

function getSessionTtlMs(): number {
  return env.SESSION_TTL_MINUTES * 60 * 1000;
}

function getSessionMaxTurns(): number {
  return env.SESSION_MAX_TURNS;
}

function mapSessionSnapshot(id: string, data: Record<string, unknown>): SessionRecord {
  const ttlValue = data.ttl as { toDate?: () => Date } | Date | undefined;
  const ttl =
    ttlValue instanceof Date
      ? ttlValue
      : (ttlValue?.toDate?.() ?? new Date(Date.now() + getSessionTtlMs()));

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

async function publishSessionEvent(payload: Record<string, unknown>): Promise<void> {
  try {
    const pubsub = new PubSub({ projectId: env.GOOGLE_CLOUD_PROJECT });
    await pubsub.topic(PUBSUB_TOPICS.SESSION_EVENTS).publishMessage({ json: payload });
  } catch {
    // Best effort only
  }
}

export async function createSession(data: {
  userId: string;
  employeeId: string;
  activeAgent: string;
}): Promise<SessionRecord> {
  const firestore = getFirestore();
  const now = new Date();
  const ttl = new Date(now.getTime() + getSessionTtlMs());

  const session: Omit<SessionRecord, 'session_id'> = {
    user_id: data.userId,
    employee_id: data.employeeId,
    status: 'active',
    active_agent: data.activeAgent,
    turn_history: [],
    workflow_state: {},
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ttl,
  };

  const sessionId = uuidv4();
  await firestore
    .collection(SESSIONS_COLLECTION)
    .doc(sessionId)
    .create({
      ...session,
      ttl: Timestamp.fromDate(ttl),
    });

  return {
    session_id: sessionId,
    ...session,
  };
}

export async function getActiveSession(userId: string): Promise<SessionRecord | null> {
  const firestore = getFirestore();
  const now = new Date();

  const snapshot = await firestore
    .collection(SESSIONS_COLLECTION)
    .where('user_id', '==', userId)
    .where('status', '==', 'active')
    .where('ttl', '>', Timestamp.fromDate(now))
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const docSnapshot = snapshot.docs[0];
  if (!docSnapshot) {
    return null;
  }

  return mapSessionSnapshot(docSnapshot.id, docSnapshot.data() as Record<string, unknown>);
}

export async function getSessionById(sessionId: string): Promise<SessionRecord | null> {
  const firestore = getFirestore();
  const snapshot = await firestore.collection(SESSIONS_COLLECTION).doc(sessionId).get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data();
  if (!data) {
    return null;
  }

  return mapSessionSnapshot(snapshot.id, data as Record<string, unknown>);
}

export async function appendTurn(sessionId: string, turn: TurnEntry): Promise<void> {
  const firestore = getFirestore();
  const docRef = firestore.collection(SESSIONS_COLLECTION).doc(sessionId);

  await firestore.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);
    if (!doc.exists) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const currentHistory = ((doc.data()?.turn_history as TurnEntry[] | undefined) ?? []).slice(
      -getSessionMaxTurns() + 1,
    );
    const refreshedTtl = new Date(Date.now() + getSessionTtlMs());

    transaction.update(docRef, {
      turn_history: [...currentHistory, turn],
      updated_at: new Date().toISOString(),
      ttl: Timestamp.fromDate(refreshedTtl),
    });
  });
}

export async function updateWorkflowState(
  sessionId: string,
  workflowState: Record<string, unknown>,
): Promise<void> {
  const firestore = getFirestore();
  await firestore.collection(SESSIONS_COLLECTION).doc(sessionId).update({
    workflow_state: workflowState,
    updated_at: new Date().toISOString(),
  });
}

export async function closeSession(
  sessionId: string,
  status: Exclude<SessionStatus, 'active'>,
): Promise<void> {
  const firestore = getFirestore();

  await firestore.collection(SESSIONS_COLLECTION).doc(sessionId).update({
    status,
    updated_at: new Date().toISOString(),
    ttl: FieldValue.delete(),
  });

  await publishSessionEvent({
    session_id: sessionId,
    status,
    closed_at: new Date().toISOString(),
  });
}

export async function resumeSession(priorSessionId: string): Promise<SessionRecord | null> {
  const priorSession = await getSessionById(priorSessionId);

  if (!priorSession) {
    return null;
  }

  const newSession = await createSession({
    userId: priorSession.user_id,
    employeeId: priorSession.employee_id,
    activeAgent: priorSession.active_agent,
  });

  const firestore = getFirestore();
  await firestore
    .collection(SESSIONS_COLLECTION)
    .doc(newSession.session_id)
    .update({
      turn_history: priorSession.turn_history.slice(-getSessionMaxTurns()),
      workflow_state: priorSession.workflow_state,
      updated_at: new Date().toISOString(),
    });

  await closeSession(priorSessionId, 'completed');

  return getSessionById(newSession.session_id);
}
