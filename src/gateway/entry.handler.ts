/**
 * Main entry point handler for /v1/request.
 * Orchestrates auth -> profile resolution -> session -> classifier -> confidence -> router.
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';
import { HEALTH_CHECK_COLLECTION, SERVICE_NAME, SERVICE_VERSION } from '../config/constants.js';
import { classifierService } from '../classifier/classifier.service.js';
import { evaluateConfidenceGate } from '../confidence/confidence.gate.js';
import { env } from '../config/env.js';
import { registryState } from '../registry/registry.loader.js';
import { dispatchToAgent } from '../router/router.service.js';
import { getFirestore } from '../session/firestoreClient.js';
import {
  appendTurn,
  closeSession,
  createSession,
  getActiveSession,
  updateWorkflowState,
} from '../session/session.service.js';
import { IncomingRequestSchema, type AgentResponse, type ClassifierOutput } from '../types/domain.js';
import { resolveSlackProfile } from './slackProfile.resolver.js';
import { logAgentRouted } from '../observability/audit.js';

const uuidv4 = crypto.randomUUID;

interface AuthenticatedRequest extends Request {
  apiKey?: string;
}

export function healthCheck(_req: Request, res: Response): void {
  res.json({
    status: 'healthy',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
  });
}

export async function deepHealthCheck(_req: Request, res: Response): Promise<void> {
  const checks: Record<string, { status: 'pass' | 'fail'; message?: string }> = {
    registry: registryState.isLoaded
      ? { status: 'pass', message: `${registryState.getAgentIds().length} agents loaded` }
      : { status: 'fail', message: 'Registry not loaded' },
  };

  try {
    const firestore = getFirestore();
    await firestore.collection(HEALTH_CHECK_COLLECTION).limit(1).get();
    checks.firestore = { status: 'pass', message: 'Firestore reachable' };
  } catch (error) {
    checks.firestore = {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Firestore unavailable',
    };
  }

  const allPassed = Object.values(checks).every((check) => check.status === 'pass');
  res.status(allPassed ? 200 : 503).json({
    status: allPassed ? 'healthy' : 'degraded',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
    checks,
    agents: registryState.getAgentIds(),
    defaultAgent: registryState.defaultAgent?.agent_id ?? null,
  });
}

async function resolveIdentity(parsedRequest: {
  employee_id?: string | undefined;
  display_name?: string | undefined;
  user_id?: string | undefined;
  slack_user_id?: string | undefined;
  entry_point?: string | undefined;
}): Promise<{ userId: string; employeeId: string; displayName: string }> {
  const slackUserId = parsedRequest.slack_user_id;
  if (slackUserId || parsedRequest.entry_point === 'slack') {
    const profile = await resolveSlackProfile(slackUserId ?? parsedRequest.user_id ?? parsedRequest.employee_id ?? 'unknown');
    return {
      userId: parsedRequest.user_id ?? slackUserId ?? profile.employee_id,
      employeeId: parsedRequest.employee_id ?? profile.employee_id,
      displayName: parsedRequest.display_name ?? profile.display_name,
    };
  }

  const userId = parsedRequest.user_id ?? parsedRequest.employee_id ?? 'anonymous';
  return {
    userId,
    employeeId: parsedRequest.employee_id ?? userId,
    displayName: parsedRequest.display_name ?? parsedRequest.employee_id ?? userId,
  };
}

function buildBypassClassification(activeAgent: string, input: string, locale?: string): ClassifierOutput {
  return {
    agent_id: activeAgent,
    confidence: 1,
    ambiguous: false,
    detected_language: locale ?? 'en',
    intent_summary: `Session bypass for active agent ${activeAgent}`,
    entities: {
      raw_input_preview: input.slice(0, 120),
    },
  };
}

function buildTurnEntry(role: 'user' | 'agent', content: string, intentSummary?: string) {
  return {
    role,
    content,
    timestamp: new Date().toISOString(),
    ...(intentSummary ? { intent_summary: intentSummary } : {}),
  };
}

async function orchestrateRequest(parsedRequest: ReturnType<typeof IncomingRequestSchema.parse>) {
  if (!registryState.isLoaded || !registryState.registry) {
    return {
      status: 503,
      body: {
        error: 'Service unavailable',
        message: 'Agent registry not loaded',
      },
    };
  }

  const requestId = uuidv4();
  const startTime = Date.now();
  const identity = await resolveIdentity(parsedRequest);
  const activeSession =
    env.ENABLE_SESSION_BYPASS && identity.userId !== 'anonymous'
      ? await getActiveSession(identity.userId)
      : null;

  let sessionId = parsedRequest.session_id ?? activeSession?.session_id ?? uuidv4();

  if (parsedRequest.session_id && activeSession && activeSession.session_id !== parsedRequest.session_id) {
    sessionId = activeSession.session_id;
  }
  const classification = activeSession
    ? buildBypassClassification(activeSession.active_agent, parsedRequest.input, parsedRequest.locale)
    : await classifierService.classify(parsedRequest.input, registryState.registry, parsedRequest.locale);

  const decision = activeSession
    ? {
        action: 'route' as const,
        agent_id: activeSession.active_agent,
        confidence: 1,
        reason: 'Active session bypass',
      }
    : evaluateConfidenceGate(classification, registryState.registry, false);

  if (decision.action === 'clarify') {
    return {
      status: 200,
      body: {
        request_id: requestId,
        session_id: sessionId,
        action: 'clarification',
        clarification_question: decision.clarification_question,
        suggested_agent: decision.agent_id,
        reason: decision.reason,
        duration_ms: Date.now() - startTime,
      },
    };
  }

  const targetAgent = registryState.getAgent(decision.agent_id);
  if (!targetAgent) {
    return {
      status: 500,
      body: {
        error: 'Agent not found',
        agent_id: decision.agent_id,
      },
    };
  }

  const persistedSession =
    activeSession ??
    (identity.userId !== 'anonymous'
      ? await createSession({
          userId: identity.userId,
          employeeId: identity.employeeId,
          activeAgent: targetAgent.agent_id,
        })
      : null);

  if (persistedSession) {
    await appendTurn(
      persistedSession.session_id,
      buildTurnEntry('user', parsedRequest.input, classification.intent_summary),
    );
  }

  const agentResponse: AgentResponse = await dispatchToAgent(targetAgent, {
    sessionId: persistedSession?.session_id ?? sessionId,
    employeeId: identity.employeeId,
    displayName: identity.displayName,
    rawInput: parsedRequest.input,
    intentSummary: classification.intent_summary,
    entities: classification.entities,
    detectedLanguage: classification.detected_language,
    turnHistory: activeSession?.turn_history ?? [],
    workflowState: activeSession?.workflow_state ?? {},
  });

  if (persistedSession) {
    await appendTurn(persistedSession.session_id, buildTurnEntry('agent', agentResponse.content));
    await updateWorkflowState(
      persistedSession.session_id,
      agentResponse.workflow_state ?? activeSession?.workflow_state ?? {},
    );

    if (agentResponse.workflow_complete) {
      await closeSession(persistedSession.session_id, 'completed');
    }
  }

  logAgentRouted(requestId, persistedSession?.session_id, targetAgent.agent_id, classification.confidence, activeSession !== null);

  return {
    status: 200,
    body: {
      request_id: requestId,
      session_id: persistedSession?.session_id ?? sessionId,
      agent_id: targetAgent.agent_id,
      response: agentResponse.content,
      workflow_complete: agentResponse.workflow_complete,
      classification: {
        intent: classification.intent_summary,
        confidence: classification.confidence,
        language: classification.detected_language,
      },
      routing: {
        action: decision.action,
        reason: decision.reason,
      },
      duration_ms: Date.now() - startTime,
    },
  };
}

export async function handleRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const validationResult = IncomingRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: validationResult.error.errors,
      });
      return;
    }

    const result = await orchestrateRequest(validationResult.data);
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function handleInternalRequest(
  payload: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const parsed = IncomingRequestSchema.parse(payload);
  return orchestrateRequest(parsed);
}
