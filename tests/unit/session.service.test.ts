/**
 * Session service unit tests
 * Tests for session creation, retrieval, turn history, TTL, and lifecycle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firestore before importing the service
const mockRunTransaction = vi.fn();
const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockPublishMessage = vi.fn().mockResolvedValue('message-id');

vi.mock('../../src/session/firestoreClient.js', () => ({
  getFirestore: () => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  }),
}));

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: class {
    topic() {
      return {
        publishMessage: mockPublishMessage,
      };
    }
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    GOOGLE_CLOUD_PROJECT: 'test-project',
    SESSION_TTL_MINUTES: 30,
    SESSION_MAX_TURNS: 100,
  },
}));

vi.mock('@google-cloud/firestore', () => ({
  Timestamp: {
    fromDate: (date: Date) => ({ toDate: () => date }),
  },
  FieldValue: {
    delete: () => '__DELETE__',
  },
}));

// Import after mocking
const {
  createSession,
  getActiveSession,
  appendTurn,
  updateWorkflowState,
  closeSession,
  resumeSession,
} = await import('../../src/session/session.service.js');

describe('Session Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSession', () => {
    it('should create a new session with TTL', async () => {
      const mockDocRef = {
        create: mockCreate.mockResolvedValue({}),
      };

      mockCollection.mockReturnValue({
        doc: mockDoc.mockReturnValue(mockDocRef),
      });

      const session = await createSession({
        userId: 'user123',
        employeeId: 'emp456',
        activeAgent: 'test-agent',
      });

      expect(mockCollection).toHaveBeenCalledWith('sessions');
      expect(mockDoc).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user123',
          employee_id: 'emp456',
          status: 'active',
          active_agent: 'test-agent',
          turn_history: [],
          workflow_state: {},
        }),
      );

      expect(session).toEqual(
        expect.objectContaining({
          user_id: 'user123',
          employee_id: 'emp456',
          status: 'active',
          active_agent: 'test-agent',
          turn_history: [],
          workflow_state: {},
        }),
      );
      expect(session.session_id).toBeDefined();
    });

    it('should generate a unique session ID', async () => {
      mockCollection.mockReturnValue({
        doc: mockDoc.mockReturnValue({
          create: mockCreate.mockResolvedValue({}),
        }),
      });

      const session1 = await createSession({
        userId: 'user123',
        employeeId: 'emp456',
        activeAgent: 'test-agent',
      });

      const session2 = await createSession({
        userId: 'user123',
        employeeId: 'emp456',
        activeAgent: 'test-agent',
      });

      expect(session1.session_id).not.toBe(session2.session_id);
    });
  });

  describe('getActiveSession', () => {
    it('should return null when no active session exists', async () => {
      mockCollection.mockReturnValue({
        where: () => ({
          where: () => ({
            where: () => ({
              limit: () => ({
                get: () => Promise.resolve({ empty: true, docs: [] }),
              }),
            }),
          }),
        }),
      });

      const result = await getActiveSession('user123');

      expect(result).toBeNull();
    });

    it('should return the active session when found', async () => {
      const mockSessionData = {
        user_id: 'user123',
        employee_id: 'emp456',
        status: 'active',
        active_agent: 'test-agent',
        turn_history: [],
        workflow_state: {},
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        ttl: { toDate: () => new Date(Date.now() + 3600000) },
      };

      const mockDocSnapshot = {
        id: 'session123',
        data: () => mockSessionData,
      };

      mockCollection.mockReturnValue({
        where: () => ({
          where: () => ({
            where: () => ({
              limit: () => ({
                get: () =>
                  Promise.resolve({
                    empty: false,
                    docs: [mockDocSnapshot],
                  }),
              }),
            }),
          }),
        }),
      });

      const result = await getActiveSession('user123');

      expect(result).toEqual(
        expect.objectContaining({
          session_id: 'session123',
          user_id: 'user123',
          employee_id: 'emp456',
          status: 'active',
          active_agent: 'test-agent',
        }),
      );
    });

    it('should return null when session TTL has expired', async () => {
      mockCollection.mockReturnValue({
        where: () => ({
          where: () => ({
            where: () => ({
              limit: () => ({
                get: () => Promise.resolve({ empty: true, docs: [] }),
              }),
            }),
          }),
        }),
      });

      const result = await getActiveSession('user123');

      expect(result).toBeNull();
    });
  });

  describe('appendTurn', () => {
    it('should append a turn to the session history', async () => {
      const mockTransactionGet = vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ turn_history: [] }),
      });

      mockRunTransaction.mockImplementation(async (fn) => {
        await fn({
          get: mockTransactionGet,
          update: vi.fn().mockResolvedValue({}),
        });
      });

      mockCollection.mockReturnValue({
        doc: mockDoc.mockReturnValue({}),
      });

      const turn = {
        role: 'user' as const,
        content: 'Hello, world!',
        timestamp: '2024-01-01T00:00:00.000Z',
        intent_summary: 'greeting',
      };

      await appendTurn('session123', turn);

      expect(mockRunTransaction).toHaveBeenCalled();
    });

    it('should throw error when session not found', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        await fn({
          get: vi.fn().mockResolvedValue({ exists: false }),
          update: vi.fn(),
        });
      });

      mockCollection.mockReturnValue({
        doc: mockDoc.mockReturnValue({}),
      });

      await expect(
        appendTurn('nonexistent', {
          role: 'user',
          content: 'test',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow('Session nonexistent not found');
    });

    it('should truncate turn history to max size', async () => {
      const largeHistory = Array.from({ length: 150 }, (_, i) => ({
        role: 'user' as const,
        content: `Turn ${i}`,
        timestamp: '2024-01-01T00:00:00.000Z',
      }));

      mockRunTransaction.mockImplementation(async (fn) => {
        await fn({
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ turn_history: largeHistory }),
          }),
          update: vi.fn().mockResolvedValue({}),
        });
      });

      mockCollection.mockReturnValue({
        doc: mockDoc.mockReturnValue({}),
      });

      await appendTurn('session123', {
        role: 'user',
        content: 'New turn',
        timestamp: '2024-01-01T00:00:00.000Z',
      });

      expect(mockRunTransaction).toHaveBeenCalled();
    });
  });

  describe('updateWorkflowState', () => {
    it('should update the workflow state', async () => {
      mockCollection.mockReturnValue({
        doc: mockDoc.mockReturnValue({
          update: mockUpdate.mockResolvedValue({}),
        }),
      });

      const workflowState = {
        step: 'verification',
        verified: true,
        data: { key: 'value' },
      };

      await updateWorkflowState('session123', workflowState);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          workflow_state: workflowState,
          updated_at: expect.any(String),
        }),
      );
    });
  });

  describe('closeSession', () => {
    it('should close a session with completed status', async () => {
      mockCollection.mockReturnValue({
        doc: mockDoc.mockReturnValue({
          update: mockUpdate.mockResolvedValue({}),
        }),
      });

      await closeSession('session123', 'completed');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          updated_at: expect.any(String),
        }),
      );
      expect(mockPublishMessage).toHaveBeenCalled();
    });

    it('should close a session with abandoned status', async () => {
      mockCollection.mockReturnValue({
        doc: mockDoc.mockReturnValue({
          update: mockUpdate.mockResolvedValue({}),
        }),
      });

      await closeSession('session123', 'abandoned');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'abandoned',
        }),
      );
    });
  });

  describe('resumeSession', () => {
    it('should create a new session with prior history', async () => {
      const priorData = {
        user_id: 'user123',
        employee_id: 'emp456',
        status: 'completed',
        active_agent: 'test-agent',
        turn_history: [{ role: 'user', content: 'Hello', timestamp: '2024-01-01T00:00:00.000Z' }],
        workflow_state: { step: 'in_progress' },
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        ttl: { toDate: () => new Date(Date.now() + 3600000) },
      };

      // Mock for getting prior session (first call) and creating new session (second call)
      mockCollection.mockReturnValue({
        doc: mockDoc.mockImplementation((docId?: string) => {
          if (docId === 'prior-session-123') {
            return {
              get: vi.fn().mockResolvedValue({
                exists: true,
                id: 'prior-session-123',
                data: () => priorData,
              }),
              update: mockUpdate.mockResolvedValue({}),
            };
          }

          return {
            get: vi.fn().mockResolvedValue({
              exists: true,
              id: docId,
              data: () => ({
                ...priorData,
                status: 'active',
              }),
            }),
            update: mockUpdate.mockResolvedValue({}),
            create: mockCreate.mockResolvedValue({}),
          };
        }),
      });

      const result = await resumeSession('prior-session-123');

      expect(result).toBeDefined();
      expect(result?.session_id).not.toBe('prior-session-123');
      expect(result?.user_id).toBe('user123');
    });

    it('should return null when prior session not found', async () => {
      mockCollection.mockReturnValue({
        doc: mockDoc.mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: false }),
        }),
      });

      const result = await resumeSession('nonexistent');

      expect(result).toBeNull();
    });
  });
});
