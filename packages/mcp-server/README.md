# @reaatech/agent-mesh-mcp-server

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-mesh-mcp-server.svg)](https://www.npmjs.com/package/@reaatech/agent-mesh-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
[![CI](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

MCP server layer that exposes the agent-mesh orchestrator as an MCP-compliant agent. Provides JSON-RPC 2.0 message routing, tool registration (`handle_message`, `get_session_status`, `list_agents`), and SSE transport for legacy client compatibility.

## Installation

```bash
npm install @reaatech/agent-mesh-mcp-server
# or
pnpm add @reaatech/agent-mesh-mcp-server
```

## Feature Overview

- **JSON-RPC 2.0 routing** — standards-compliant method dispatch with error codes per the JSON-RPC spec
- **Three MCP tools** — `handle_message` (route user messages through the orchestrator), `get_session_status` (query session state), `list_agents` (enumerate registered agents)
- **SSE transport** — Server-Sent Events for legacy MCP client compatibility (`GET /mcp/sse`, `POST /mcp/messages`)
- **Express middleware** — drop-in `mcpMiddleware` for existing Express applications
- **Orchestrator passthrough** — delegates to `handleInternalRequest` from the gateway for full request pipeline execution

## Quick Start

```typescript
import express from "express";
import { mcpMiddleware, sseHandler, messageHandler } from "@reaatech/agent-mesh-mcp-server";

const app = express();
app.use(express.json());
app.use(mcpMiddleware); // Handles POST /mcp

app.get("/mcp/sse", sseHandler);
app.post("/mcp/messages", messageHandler);

app.listen(8080);
```

## API Reference

### MCP Middleware

#### `mcpMiddleware`

Express middleware that intercepts `POST /mcp` requests and routes them through the JSON-RPC 2.0 handler. All other requests pass through unchanged.

```typescript
app.use(mcpMiddleware);
```

### JSON-RPC Handler

#### `handleMcpRequest(req, res): Promise<void>`

Processes an MCP JSON-RPC 2.0 request. Validates the message format, dispatches to the appropriate method handler, and returns a JSON-RPC 2.0 response.

**MCP Methods:**

| Method | Description |
|--------|-------------|
| `tools/list` | Returns the list of available tools with their input schemas |
| `tools/call` | Dispatches to the named tool handler |

**Tools Registered:**

| Tool | Description | Required Inputs |
|------|-------------|-----------------|
| `handle_message` | Route a user message through the full orchestrator pipeline | `input` (string), optional: `user_id`, `employee_id`, `display_name`, `session_id`, `locale` |
| `get_session_status` | Retrieve the state of a session by ID | `session_id` (string) |
| `list_agents` | List all registered orchestrator agents with their metadata | (none) |

### SSE Transport

#### `sseHandler(req, res): Promise<void>`

Establishes a Server-Sent Events (`GET /mcp/sse`) connection for legacy MCP clients. Accepts an optional `sessionId` query parameter.

```typescript
app.get("/mcp/sse", sseHandler);
```

#### `messageHandler(req, res): Promise<void>`

Handles incoming MCP messages via `POST /mcp/messages?sessionId=<id>`. If a matching SSE connection exists, the message is forwarded to the client.

```typescript
app.post("/mcp/messages", messageHandler);
```

#### `sendToClient(sessionId, message): boolean`

Sends a message to a connected SSE client. Returns `false` if no connection exists for the given session ID.

#### `closeSseConnection(sessionId): boolean`

Force-closes an SSE connection for a given session.

#### `getActiveConnectionCount(): number`

Returns the number of currently active SSE connections.

## Message Types

### `McpMessage`

```typescript
interface McpMessage {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}
```

### `McpResponse`

```typescript
interface McpResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}
```

**Error Codes (JSON-RPC 2.0 standard):**

| Code | Meaning |
|------|---------|
| `-32700` | Parse error — invalid JSON |
| `-32600` | Invalid Request |
| `-32601` | Method not found |
| `-32602` | Invalid params / Unknown tool |
| `-32603` | Internal error |

## Usage Patterns

### As a Standalone MCP Server

```typescript
import express from "express";
import { mcpMiddleware, sseHandler, messageHandler } from "@reaatech/agent-mesh-mcp-server";

const app = express();
app.use(express.json());
app.use(mcpMiddleware);

app.get("/mcp/sse", sseHandler);
app.post("/mcp/messages", messageHandler);

app.listen(8080);
```

### Integration with the Full Orchestrator

```typescript
import express from "express";
import { authMiddleware, healthCheck, handleRequest } from "@reaatech/agent-mesh-gateway";
import { mcpMiddleware, sseHandler, messageHandler } from "@reaatech/agent-mesh-mcp-server";

const app = express();
app.use(express.json());
app.use(mcpMiddleware);

app.get("/health", healthCheck);

// MCP endpoints (can optionally apply auth)
app.get("/mcp/sse", authMiddleware, sseHandler);
app.post("/mcp/messages", authMiddleware, messageHandler);

// Direct HTTP API
app.post("/v1/request", authMiddleware, handleRequest);

app.listen(8080);
```

### Programmatic Tool Calls

```typescript
import { handleMcpRequest } from "@reaatech/agent-mesh-mcp-server";

// Simulate an MCP tool call
const req = {
  body: {
    jsonrpc: "2.0",
    id: "req-1",
    method: "tools/call",
    params: {
      name: "handle_message",
      arguments: {
        input: "Reset my password",
        employee_id: "emp-123",
      },
    },
  },
} as any;

await handleMcpRequest(req, res);
```

## Related Packages

- [`@reaatech/agent-mesh-gateway`](https://www.npmjs.com/package/@reaatech/agent-mesh-gateway) — Entry handler (delegated to via `handleInternalRequest`)
- [`@reaatech/agent-mesh-registry`](https://www.npmjs.com/package/@reaatech/agent-mesh-registry) — Agent listing (for `list_agents` tool)
- [`@reaatech/agent-mesh-session`](https://www.npmjs.com/package/@reaatech/agent-mesh-session) — Session queries (for `get_session_status` tool)

## License

[MIT](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
