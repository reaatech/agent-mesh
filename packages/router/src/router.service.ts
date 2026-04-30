import crypto from 'crypto';
const uuidv4 = crypto.randomUUID;
import type { AgentConfig } from '@reaatech/agent-mesh-registry';
import type { ContextPacket, AgentResponse, TurnEntry } from '@reaatech/agent-mesh';
import { mcpClientFactory } from './mcp.client.js';
import { circuitBreaker } from '@reaatech/agent-mesh-utils';
import { env } from '@reaatech/agent-mesh';
import { recordAgentDispatchDuration, recordAgentDispatchError } from '@reaatech/agent-mesh-observability';

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
  };

  const client = mcpClientFactory.getClient(agent);

  try {
    const response = await client.sendMessage(context);
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
