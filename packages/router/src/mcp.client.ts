import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  type AgentResponse,
  AgentResponseSchema,
  type ContextPacket,
  env,
  MCP,
} from '@reaatech/agent-mesh';
import type { AgentConfig } from '@reaatech/agent-mesh-registry';

type McpToolResult = {
  content?: unknown;
  structuredContent?: unknown;
  text?: unknown;
};

interface PooledConnection {
  client: Client;
  transport: StreamableHTTPClientTransport;
  inUse: boolean;
  lastUsed: number;
}

const MAX_POOL_SIZE = 5;
const CONNECTION_TIMEOUT_MS = 5000;

export class McpClient {
  private readonly agent: AgentConfig;
  private connectionPool: PooledConnection[] = [];
  private poolInitialized = false;

  constructor(agent: AgentConfig) {
    this.agent = agent;
  }

  private async getPooledConnection(): Promise<PooledConnection> {
    const now = Date.now();

    for (const conn of this.connectionPool) {
      if (!conn.inUse && now - conn.lastUsed < CONNECTION_TIMEOUT_MS) {
        conn.inUse = true;
        return conn;
      }
    }

    if (this.connectionPool.length < MAX_POOL_SIZE) {
      const transport = new StreamableHTTPClientTransport(new URL(this.agent.endpoint));
      const client = new Client({
        name: 'agent-mesh-orchestrator',
        version: '1.0.0',
      });

      await client.connect(transport as Transport);

      const pooledConn: PooledConnection = {
        client,
        transport,
        inUse: true,
        lastUsed: now,
      };

      this.connectionPool.push(pooledConn);
      this.poolInitialized = true;
      return pooledConn;
    }

    const expiredConnections: PooledConnection[] = [];
    let oldestAvailable: PooledConnection | null = null;

    for (const conn of this.connectionPool) {
      if (!conn.inUse) {
        if (now - conn.lastUsed >= CONNECTION_TIMEOUT_MS) {
          expiredConnections.push(conn);
        } else if (!oldestAvailable || conn.lastUsed < oldestAvailable.lastUsed) {
          oldestAvailable = conn;
        }
      }
    }

    for (const conn of expiredConnections) {
      this.connectionPool.splice(this.connectionPool.indexOf(conn), 1);
      conn.client.close().catch(() => {});
    }

    if (oldestAvailable) {
      oldestAvailable.inUse = true;
      oldestAvailable.lastUsed = now;
      return oldestAvailable;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    return this.getPooledConnection();
  }

  private releaseConnection(conn: PooledConnection): void {
    conn.inUse = false;
    conn.lastUsed = Date.now();
  }

  async sendMessage(context: ContextPacket): Promise<AgentResponse> {
    const maxAttempts = Math.max(1, env.MCP_MAX_RETRIES + 1);
    let lastError: Error | null = null;
    let pooledConn: PooledConnection | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        pooledConn = await this.getPooledConnection();

        const result = (await Promise.race([
          pooledConn.client.callTool({
            name: MCP.HANDLE_MESSAGE_TOOL,
            arguments: {
              session_id: context.session_id,
              request_id: context.request_id,
              employee_id: context.employee_id,
              display_name: context.display_name,
              raw_input: context.raw_input,
              intent_summary: context.intent_summary,
              entities: context.entities,
              detected_language: context.detected_language,
              turn_history: context.turn_history,
              workflow_state: context.workflow_state,
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`MCP request timeout after ${env.MCP_REQUEST_TIMEOUT_MS}ms`)),
              env.MCP_REQUEST_TIMEOUT_MS,
            ),
          ),
        ])) as McpToolResult;

        if (pooledConn) {
          this.releaseConnection(pooledConn);
        }

        return this.parseAgentResponse(result, context.workflow_state);
      } catch (error) {
        if (pooledConn) {
          this.releaseConnection(pooledConn);
          pooledConn = null;
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxAttempts || lastError.message.includes('timeout')) {
          break;
        }
      }
    }

    throw lastError ?? new Error(`Failed to dispatch request to agent ${this.agent.agent_id}`);
  }

  private parseAgentResponse(
    result: McpToolResult,
    currentWorkflowState: Record<string, unknown>,
  ): AgentResponse {
    const candidates: unknown[] = [];

    if (result.structuredContent !== undefined) {
      candidates.push(result.structuredContent);
    }

    if (Array.isArray(result.content)) {
      for (const block of result.content) {
        if (typeof block === 'object' && block !== null && 'text' in block) {
          candidates.push((block as { text?: unknown }).text);
        }
      }
    } else if (result.content !== undefined) {
      candidates.push(result.content);
    }

    if (result.text !== undefined) {
      candidates.push(result.text);
    }

    for (const candidate of candidates) {
      const parsed = this.tryParseCandidate(candidate, currentWorkflowState);
      if (parsed) {
        return parsed;
      }
    }

    throw new Error('Agent response did not match AgentResponseSchema');
  }

  private tryParseCandidate(
    candidate: unknown,
    currentWorkflowState: Record<string, unknown>,
  ): AgentResponse | null {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const structured = AgentResponseSchema.safeParse(candidate);
      if (structured.success) {
        return structured.data;
      }
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) {
        return null;
      }

      try {
        const parsedJson = JSON.parse(trimmed) as unknown;
        const structured = AgentResponseSchema.safeParse(parsedJson);
        if (structured.success) {
          return structured.data;
        }
      } catch {
        return AgentResponseSchema.parse({
          content: trimmed,
          workflow_complete: false,
          workflow_state: currentWorkflowState,
        });
      }
    }

    return null;
  }

  async close(): Promise<void> {
    await Promise.all(
      this.connectionPool.map(async (conn) => {
        try {
          await conn.client.close();
        } catch {
          // Best effort close
        }
      }),
    );
    this.connectionPool = [];
    this.poolInitialized = false;
  }

  isConnected(): boolean {
    return this.poolInitialized && this.connectionPool.some((c) => c.inUse);
  }
}

class McpClientFactory {
  private clients = new Map<string, McpClient>();

  getClient(agent: AgentConfig): McpClient {
    const existing = this.clients.get(agent.agent_id);
    if (existing) {
      return existing;
    }

    const client = new McpClient(agent);
    this.clients.set(agent.agent_id, client);
    return client;
  }

  async closeAll(): Promise<void> {
    await Promise.all(Array.from(this.clients.values()).map((client) => client.close()));
    this.clients.clear();
  }

  removeClient(agentId: string): void {
    const client = this.clients.get(agentId);
    if (!client) {
      return;
    }

    client.close().catch(() => undefined);
    this.clients.delete(agentId);
  }
}

export const mcpClientFactory = new McpClientFactory();
