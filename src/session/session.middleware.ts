/**
 * Session middleware for Express.
 * Looks up active sessions, records lookup latency, and sets bypass metadata.
 */

import type { NextFunction, Request, Response } from 'express';
import { recordSessionLookupDuration } from '../observability/metrics.js';
import { getActiveSession } from './session.service.js';

type SessionContext = {
  sessionId: string;
  activeAgent: string;
  bypassClassifier: boolean;
  turnHistory: Array<{
    role: string;
    content: string;
    timestamp: string;
    intent_summary?: string;
  }>;
  workflowState: Record<string, unknown>;
};

type SessionRequest = Request & {
  sessionContext?: SessionContext;
};

function withSessionContext(req: Request): SessionRequest {
  return req as SessionRequest;
}

function emptySessionContext(): SessionContext {
  return {
    sessionId: '',
    activeAgent: '',
    bypassClassifier: false,
    turnHistory: [],
    workflowState: {},
  };
}

export async function sessionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const start = Date.now();
  const sessionRequest = withSessionContext(req);

  try {
    const userId = String(req.headers['x-user-id'] ?? '');

    if (!userId) {
      sessionRequest.sessionContext = emptySessionContext();
      recordSessionLookupDuration(Date.now() - start, false);
      next();
      return;
    }

    const session = await getActiveSession(userId);
    if (!session || session.status !== 'active') {
      sessionRequest.sessionContext = emptySessionContext();
      recordSessionLookupDuration(Date.now() - start, false);
      next();
      return;
    }

    sessionRequest.sessionContext = {
      sessionId: session.session_id,
      activeAgent: session.active_agent,
      bypassClassifier: true,
      turnHistory: session.turn_history.map((turn) => ({
        role: turn.role,
        content: turn.content,
        timestamp: turn.timestamp,
        ...(turn.intent_summary ? { intent_summary: turn.intent_summary } : {}),
      })),
      workflowState: session.workflow_state,
    };
    recordSessionLookupDuration(Date.now() - start, true);
    next();
  } catch {
    sessionRequest.sessionContext = emptySessionContext();
    recordSessionLookupDuration(Date.now() - start, false);
    next();
  }
}
