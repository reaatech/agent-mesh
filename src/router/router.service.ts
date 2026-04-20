/**
 * Router service for dispatching requests to agents via MCP
 * Handles circuit breaker checks, request building, and response validation
 */

import crypto from 'crypto';
const uuidv4 = crypto.randomUUID;
import type { AgentConfig } from '../registry/types.js';
import type { ContextPacket, AgentResponse, TurnEntry } from '../types/domain.js';
import { mcpClientFactory } from './mcp.client.js';
import { circuitBreaker } from '../utils/circuitBreaker.js';
import { env } from '../config/env.js';
import { recordAgentDispatchDuration, recordAgentDispatchError } from '../observability/metrics.js';

/**
 * Dispatch a request to an agent
 * Checks circuit breaker, builds context packet, and validates response
 */
export async function dispatchToAgent(
  agent: AgentConfig,
  input: {
    sessionId: string;
    employeeId: string;
    displayName: string;
    rawInput: string;
    intentSummary: string;
    entities: Record<string, unknown>;
    detectedLanguage: string;
    turnHistory: TurnEntry[];
    workflowState: Record<string, unknown>;
  },
): Promise<AgentResponse> {
  const start = Date.now();

  // Check circuit breaker
  if (env.ENABLE_CIRCUIT_BREAKER) {
    if (!circuitBreaker.canCall(agent.agent_id)) {
      throw new Error(`Circuit breaker OPEN for agent ${agent.agent_id}`);
    }
  }

  // Build context packet
  const context: ContextPacket = {
    session_id: input.sessionId,
    request_id: uuidv4(),
    employee_id: input.employeeId,
    display_name: input.displayName,
    raw_input: input.rawInput,
    intent_summary: input.intentSummary,
    entities: input.entities,
    detected_language: input.detectedLanguage,
    turn_history: input.turnHistory,
    workflow_state: input.workflowState,
  };

  // Get MCP client and send request
  const client = mcpClientFactory.getClient(agent);

  try {
    const response = await client.sendMessage(context);
    // Record success for circuit breaker
    if (env.ENABLE_CIRCUIT_BREAKER) {
      circuitBreaker.recordSuccess(agent.agent_id);
    }
    recordAgentDispatchDuration(agent.agent_id, Date.now() - start);

    return response;
  } catch (error) {
    // Record failure for circuit breaker
    if (env.ENABLE_CIRCUIT_BREAKER) {
      circuitBreaker.recordFailure(agent.agent_id);
    }

    recordAgentDispatchError(
      agent.agent_id,
      error instanceof Error ? error.name || 'dispatch_error' : 'dispatch_error',
    );

    throw error;
  }
}

/**
 * Build a turn entry for the session history
 */
export function buildTurnEntry(
  role: 'user' | 'agent',
  content: string,
  intentSummary?: string,
): TurnEntry {
  return {
    role,
    content,
    timestamp: new Date().toISOString(),
    intent_summary: intentSummary,
  };
}

/**
 * Format an agent response for display to the user
 */
export function formatAgentResponse(response: AgentResponse): string {
  return response.content;
}

/**
 * Check if a session should be closed based on agent response
 */
export function shouldCloseSession(response: AgentResponse): boolean {
  return response.workflow_complete === true;
}

/**
 * Get the updated workflow state from agent response
 */
export function getUpdatedWorkflowState(
  current: Record<string, unknown>,
  response: AgentResponse,
): Record<string, unknown> {
  return response.workflow_state ?? current;
}
