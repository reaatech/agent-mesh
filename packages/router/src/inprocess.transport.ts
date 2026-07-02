import type { AgentConfig, AgentResponse, ContextPacket } from '@reaatech/agent-mesh';

/**
 * A locally-registered agent handler. Receives the same `ContextPacket` the MCP
 * transport would send and returns an `AgentResponse` — but runs **in-process**,
 * with no HTTP hop. The embedding host reads `context.metadata` (e.g. a tenant
 * `orgId`) to resolve its own per-call dependencies.
 */
export type InProcessHandler = (
  context: ContextPacket,
  agent: AgentConfig,
) => Promise<AgentResponse> | AgentResponse;

const handlers = new Map<string, InProcessHandler>();

/** Register an in-process handler for an agent (`type: 'inprocess'`). */
export function registerInProcessAgent(agentId: string, handler: InProcessHandler): void {
  handlers.set(agentId, handler);
}

/** Remove a registered in-process handler. */
export function unregisterInProcessAgent(agentId: string): void {
  handlers.delete(agentId);
}

/** Whether an in-process handler is registered for the agent. */
export function hasInProcessAgent(agentId: string): boolean {
  return handlers.has(agentId);
}

/** Clear all in-process handlers. Primarily for tests. */
export function resetInProcessAgents(): void {
  handlers.clear();
}

/** Dispatch a context packet to the agent's in-process handler. */
export async function dispatchInProcess(
  agent: AgentConfig,
  context: ContextPacket,
): Promise<AgentResponse> {
  const handler = handlers.get(agent.agent_id);
  if (!handler) {
    throw new Error(`No in-process handler registered for agent ${agent.agent_id}`);
  }
  return handler(context, agent);
}
