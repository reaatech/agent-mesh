import { afterEach, describe, expect, it } from 'vitest';
import { getFirestore, resetFirestore } from './index.js';
import {
  appendTurn,
  closeSession,
  createSession,
  getActiveSession,
  getSessionById,
  resumeSession,
} from './session.service.js';
import { InMemorySessionStore, resetSessionStore, setSessionStore } from './session.store.js';

describe('@reaatech/agent-mesh-session', () => {
  it('should export firestore client factory', () => {
    expect(typeof getFirestore).toBe('function');
  });

  it('should export reset function', () => {
    expect(typeof resetFirestore).toBe('function');
  });
});

describe('SessionStore (injected InMemory backend)', () => {
  afterEach(() => resetSessionStore());

  it('drives the full session lifecycle through the service functions', async () => {
    setSessionStore(new InMemorySessionStore());

    const created = await createSession({
      userId: 'user-1',
      employeeId: 'emp-1',
      activeAgent: 'agent-a',
    });
    expect(created.status).toBe('active');

    const active = await getActiveSession('user-1');
    expect(active?.session_id).toBe(created.session_id);

    await appendTurn(created.session_id, {
      role: 'user',
      content: 'hello',
      timestamp: new Date().toISOString(),
    });
    const withTurn = await getSessionById(created.session_id);
    expect(withTurn?.turn_history).toHaveLength(1);

    const resumed = await resumeSession(created.session_id);
    expect(resumed?.session_id).not.toBe(created.session_id);
    expect(resumed?.turn_history).toHaveLength(1);

    // prior session is closed → no longer the active one
    const priorClosed = await getSessionById(created.session_id);
    expect(priorClosed?.status).toBe('completed');
    await closeSession(resumed?.session_id ?? '', 'completed');
    expect(await getActiveSession('user-1')).toBeNull();
  });
});
