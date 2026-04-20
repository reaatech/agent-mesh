/**
 * Session middleware unit tests
 * Tests for session lookup, bypass_classifier flag, and error handling
 */

import type { Request, Response, NextFunction } from 'express';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the session service
const mockGetActiveSession = vi.fn();

vi.mock('../../src/session/session.service.js', () => ({
  getActiveSession: mockGetActiveSession,
}));

// Import after mocking
const { sessionMiddleware } = await import('../../src/session/session.middleware.js');

// Mock Express Request and Response
// Using a simple object with only the properties we need, cast to Request
type MockRequest = {
  headers: Record<string, string>;
  sessionContext?: {
    sessionId: string;
    activeAgent: string;
    bypassClassifier: boolean;
    turnHistory: Array<Record<string, unknown>>;
    workflowState: Record<string, unknown>;
  };
};

type RequestWithSessionContext = Request & {
  sessionContext?: MockRequest['sessionContext'];
};

function createMockRequest(overrides: Partial<MockRequest> = {}): RequestWithSessionContext {
  const mock: Omit<MockRequest, 'sessionContext'> & {
    sessionContext?: MockRequest['sessionContext'];
  } = {
    headers: {},
    ...overrides,
  };
  // Don't set sessionContext if undefined - let it remain absent
  if (overrides.sessionContext === undefined) {
    delete (mock as Record<string, unknown>).sessionContext;
  }
  return mock as unknown as RequestWithSessionContext;
}

function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    set: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function createMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe('Session Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('session lookup', () => {
    it('should set bypassClassifier to true when active session found', async () => {
      mockGetActiveSession.mockResolvedValue({
        session_id: 'session123',
        user_id: 'user123',
        status: 'active',
        active_agent: 'test-agent',
        turn_history: [{ role: 'user', content: 'Hello', timestamp: '2024-01-01T00:00:00.000Z' }],
        workflow_state: { step: 'in_progress' },
      });

      const req = createMockRequest({
        headers: { 'x-user-id': 'user123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await sessionMiddleware(req, res, next);

      expect(req.sessionContext).toEqual(
        expect.objectContaining({
          sessionId: 'session123',
          activeAgent: 'test-agent',
          bypassClassifier: true,
          turnHistory: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'Hello' }),
          ]),
          workflowState: { step: 'in_progress' },
        }),
      );
      expect(next).toHaveBeenCalled();
    });

    it('should set bypassClassifier to false when no active session', async () => {
      mockGetActiveSession.mockResolvedValue(null);

      const req = createMockRequest({
        headers: { 'x-user-id': 'user123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await sessionMiddleware(req, res, next);

      expect(req.sessionContext).toEqual(
        expect.objectContaining({
          sessionId: '',
          activeAgent: '',
          bypassClassifier: false,
          turnHistory: [],
          workflowState: {},
        }),
      );
      expect(next).toHaveBeenCalled();
    });

    it('should set bypassClassifier to false when session status is not active', async () => {
      mockGetActiveSession.mockResolvedValue({
        session_id: 'session123',
        user_id: 'user123',
        status: 'completed',
        active_agent: 'test-agent',
        turn_history: [],
        workflow_state: {},
      });

      const req = createMockRequest({
        headers: { 'x-user-id': 'user123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await sessionMiddleware(req, res, next);

      expect(req.sessionContext).toEqual(
        expect.objectContaining({
          bypassClassifier: false,
        }),
      );
    });

    it('should skip session lookup when no user ID header', async () => {
      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      await sessionMiddleware(req, res, next);

      expect(mockGetActiveSession).not.toHaveBeenCalled();
      expect(req.sessionContext).toEqual(
        expect.objectContaining({
          sessionId: '',
          bypassClassifier: false,
        }),
      );
      expect(next).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should fail open on error (continue without session)', async () => {
      mockGetActiveSession.mockRejectedValue(new Error('Firestore connection failed'));

      const req = createMockRequest({
        headers: { 'x-user-id': 'user123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await sessionMiddleware(req, res, next);

      // Should not throw, should continue with empty session context
      expect(req.sessionContext).toEqual(
        expect.objectContaining({
          sessionId: '',
          bypassClassifier: false,
        }),
      );
      expect(next).toHaveBeenCalled();
    });

    it('should handle timeout errors gracefully', async () => {
      mockGetActiveSession.mockRejectedValue(new Error('Deadline exceeded'));

      const req = createMockRequest({
        headers: { 'x-user-id': 'user123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await sessionMiddleware(req, res, next);

      expect(req.sessionContext).toBeDefined();
      expect(req.sessionContext?.bypassClassifier).toBe(false);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('turn history mapping', () => {
    it('should map turn history with intent_summary', async () => {
      mockGetActiveSession.mockResolvedValue({
        session_id: 'session123',
        user_id: 'user123',
        status: 'active',
        active_agent: 'test-agent',
        turn_history: [
          {
            role: 'user',
            content: 'What is my balance?',
            timestamp: '2024-01-01T00:00:00.000Z',
            intent_summary: 'balance_inquiry',
          },
          {
            role: 'agent',
            content: 'Your balance is $100.',
            timestamp: '2024-01-01T00:01:00.000Z',
          },
        ],
        workflow_state: {},
      });

      const req = createMockRequest({
        headers: { 'x-user-id': 'user123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await sessionMiddleware(req, res, next);

      expect(req.sessionContext?.turnHistory).toEqual([
        expect.objectContaining({
          role: 'user',
          content: 'What is my balance?',
          intent_summary: 'balance_inquiry',
        }),
        expect.objectContaining({
          role: 'agent',
          content: 'Your balance is $100.',
        }),
      ]);
    });

    it('should handle empty turn history', async () => {
      mockGetActiveSession.mockResolvedValue({
        session_id: 'session123',
        user_id: 'user123',
        status: 'active',
        active_agent: 'test-agent',
        turn_history: [],
        workflow_state: {},
      });

      const req = createMockRequest({
        headers: { 'x-user-id': 'user123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await sessionMiddleware(req, res, next);

      expect(req.sessionContext?.turnHistory).toEqual([]);
    });
  });

  describe('workflow state preservation', () => {
    it('should preserve workflow state from session', async () => {
      mockGetActiveSession.mockResolvedValue({
        session_id: 'session123',
        user_id: 'user123',
        status: 'active',
        active_agent: 'test-agent',
        turn_history: [],
        workflow_state: {
          step: 'verification',
          attempts: 2,
          data: { key: 'value' },
        },
      });

      const req = createMockRequest({
        headers: { 'x-user-id': 'user123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await sessionMiddleware(req, res, next);

      expect(req.sessionContext?.workflowState).toEqual({
        step: 'verification',
        attempts: 2,
        data: { key: 'value' },
      });
    });

    it('should handle empty workflow state', async () => {
      mockGetActiveSession.mockResolvedValue({
        session_id: 'session123',
        user_id: 'user123',
        status: 'active',
        active_agent: 'test-agent',
        turn_history: [],
        workflow_state: {},
      });

      const req = createMockRequest({
        headers: { 'x-user-id': 'user123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await sessionMiddleware(req, res, next);

      expect(req.sessionContext?.workflowState).toEqual({});
    });
  });
});
