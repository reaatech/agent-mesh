import crypto from 'node:crypto';
import { PubSub } from '@google-cloud/pubsub';
import type { SessionRecord, SessionStatus, TurnEntry } from '@reaatech/agent-mesh';
import { env, PUBSUB_TOPICS } from '@reaatech/agent-mesh';
import { getSessionStore } from './session.store.js';

const uuidv4 = crypto.randomUUID;

function getSessionTtlMs(): number {
  return env.SESSION_TTL_MINUTES * 60 * 1000;
}

function getSessionMaxTurns(): number {
  return env.SESSION_MAX_TURNS;
}

async function publishSessionEvent(payload: Record<string, unknown>): Promise<void> {
  // Best-effort event publish; skipped under test (no GCP credentials), mirroring
  // the classifier's Gemini guard. Prod behaviour is unchanged.
  if (env.NODE_ENV === 'test') {
    return;
  }
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
  const now = new Date();
  const record: SessionRecord = {
    session_id: uuidv4(),
    user_id: data.userId,
    employee_id: data.employeeId,
    status: 'active',
    active_agent: data.activeAgent,
    turn_history: [],
    workflow_state: {},
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ttl: new Date(now.getTime() + getSessionTtlMs()),
  };

  await getSessionStore().create(record);
  return record;
}

export async function getActiveSession(userId: string): Promise<SessionRecord | null> {
  return getSessionStore().getActiveByUser(userId);
}

export async function getSessionById(sessionId: string): Promise<SessionRecord | null> {
  return getSessionStore().get(sessionId);
}

export async function appendTurn(sessionId: string, turn: TurnEntry): Promise<void> {
  return getSessionStore().appendTurn(sessionId, turn, {
    maxTurns: getSessionMaxTurns(),
    ttlMs: getSessionTtlMs(),
  });
}

export async function updateWorkflowState(
  sessionId: string,
  workflowState: Record<string, unknown>,
): Promise<void> {
  return getSessionStore().updateWorkflowState(sessionId, workflowState);
}

export async function closeSession(
  sessionId: string,
  status: Exclude<SessionStatus, 'active'>,
): Promise<void> {
  await getSessionStore().close(sessionId, status);

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

  await getSessionStore().seed(newSession.session_id, {
    turn_history: priorSession.turn_history.slice(-getSessionMaxTurns()),
    workflow_state: priorSession.workflow_state,
  });

  await closeSession(priorSessionId, 'completed');

  return getSessionById(newSession.session_id);
}
