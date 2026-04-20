/**
 * MCP server for exposing the orchestrator as an agent.
 */

import type { NextFunction, Request, Response } from 'express';
import { logger } from '../observability/logger.js';
import { handleInternalRequest } from '../gateway/entry.handler.js';
import { registryState } from '../registry/registry.loader.js';
import { getSessionById } from '../session/session.service.js';

export interface McpMessage {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

function toToolContent(payload: unknown): Array<{ type: 'text'; text: string }> {
  return [
    {
      type: 'text',
      text: JSON.stringify(payload),
    },
  ];
}

async function processMcpMethod(message: McpMessage): Promise<McpResponse> {
  const { id, method, params } = message;

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'handle_message',
            description: 'Route a user message through the orchestrator',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
                user_id: { type: 'string' },
                employee_id: { type: 'string' },
                display_name: { type: 'string' },
                session_id: { type: 'string' },
                locale: { type: 'string' },
              },
              required: ['input'],
            },
          },
          {
            name: 'get_session_status',
            description: 'Get session state for a session ID',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string' },
              },
              required: ['session_id'],
            },
          },
          {
            name: 'list_agents',
            description: 'List all registered orchestrator agents',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      },
    };
  }

  if (method !== 'tools/call') {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }

  const toolParams = (params ?? {}) as Record<string, unknown>;
  const name = String(toolParams.name ?? '');
  const args = (toolParams.arguments ?? {}) as Record<string, unknown>;

  switch (name) {
    case 'handle_message': {
      const result = await handleInternalRequest({
        input: args.raw_input ?? args.input,
        session_id: args.session_id,
        employee_id: args.employee_id,
        display_name: args.display_name,
        locale: args.detected_language ?? args.locale,
        user_id: args.user_id ?? args.employee_id,
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: toToolContent(result.body),
          structuredContent: result.body,
        },
      };
    }

    case 'get_session_status': {
      const sessionId = String(args.session_id ?? '');
      const session = sessionId ? await getSessionById(sessionId) : null;

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: toToolContent(session ?? { session_id: sessionId, status: 'not_found' }),
          structuredContent: session ?? { session_id: sessionId, status: 'not_found' },
        },
      };
    }

    case 'list_agents': {
      const agents =
        registryState.registry?.map((agent) => ({
          agent_id: agent.agent_id,
          display_name: agent.display_name,
          is_default: agent.is_default,
          confidence_threshold: agent.confidence_threshold,
        })) ?? [];

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: toToolContent({ agents }),
          structuredContent: { agents },
        },
      };
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Unknown tool: ${name}` },
      };
  }
}

export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const message = req.body as McpMessage;

  if (!message || typeof message.method !== 'string') {
    res.status(400).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request' },
    });
    return;
  }

  try {
    res.json(await processMcpMethod(message));
  } catch (error) {
    logger.error(`MCP request failed: ${String(error)}`);
    res.status(500).json({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32603, message: 'Internal error' },
    });
  }
}

export function mcpMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/mcp' && req.method === 'POST') {
    handleMcpRequest(req, res).catch((error) => {
      logger.error(`MCP middleware error: ${String(error)}`);
      res.status(500).json({ error: 'Internal server error' });
    });
    return;
  }

  next();
}
