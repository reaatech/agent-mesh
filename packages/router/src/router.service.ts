import crypto from 'node:crypto';

const uuidv4 = crypto.randomUUID;

import type { AgentResponse, ContextPacket, TurnEntry } from '@reaatech/agent-mesh';
import { env } from '@reaatech/agent-mesh';
import {
  recordAgentDispatchDuration,
  recordAgentDispatchError,
} from '@reaatech/agent-mesh-observability';
import type { AgentConfig } from '@reaatech/agent-mesh-registry';
import { circuitBreaker } from '@reaatech/agent-mesh-utils';
import { dispatchInProcess } from './inprocess.transport.js';
import { mcpClientFactory } from './mcp.client.js';

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
    metadata?: Record<string, unknown>;
  },
): Promise<AgentResponse> {
  const start = Date.now();

  if (env.ENABLE_CIRCUIT_BREAKER) {
    if (!circuitBreaker.canCall(agent.agent_id)) {
      throw new Error(`Circuit breaker OPEN for agent ${agent.agent_id}`);
    }
  }

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
    metadata: input.metadata,
  };

  try {
    // Route by transport: in-process handler (no HTTP hop) vs pooled MCP client.
    const response =
      agent.type === 'inprocess'
        ? await dispatchInProcess(agent, context)
        : await mcpClientFactory.getClient(agent).sendMessage(context);
    if (env.ENABLE_CIRCUIT_BREAKER) {
      circuitBreaker.recordSuccess(agent.agent_id);
    }
    recordAgentDispatchDuration(agent.agent_id, Date.now() - start);

    return response;
  } catch (error) {
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

export function formatAgentResponse(response: AgentResponse): string {
  return response.content;
}

export function shouldCloseSession(response: AgentResponse): boolean {
  return response.workflow_complete === true;
}

export function getUpdatedWorkflowState(
  current: Record<string, unknown>,
  response: AgentResponse,
): Record<string, unknown> {
  return response.workflow_state ?? current;
}
