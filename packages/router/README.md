# @reaatech/agent-mesh-router

> Dispatch over **MCP** *or* **in-process** (`type: 'inprocess'`, via
> `registerInProcessAgent`). A `metadata` passthrough carries host context (e.g. a
> tenant `orgId`) into the `ContextPacket`.

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-mesh-router.svg)](https://www.npmjs.com/package/@reaatech/agent-mesh-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
[![CI](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

MCP-based agent dispatch layer for the agent-mesh orchestrator. Builds context packets, routes requests to registered agents via the Model Context Protocol (StreamableHTTP transport), validates responses against Zod schemas, and manages connection pooling with circuit breaker integration.

## Installation

```bash
npm install @reaatech/agent-mesh-router
# or
pnpm add @reaatech/agent-mesh-router
```

## Feature Overview

- **MCP StreamableHTTP transport** — communicates with agents using the standard MCP protocol over HTTP
- **Connection pooling** — up to 5 pooled connections per agent with timeout-based eviction
- **Request timeouts** — configurable timeout per dispatch with `Promise.race`
- **Automatic retries** — configurable retry attempts (default 3) for transient failures
- **Circuit breaker integration** — gates dispatch on per-agent circuit state before sending
- **Response validation** — parses MCP tool results against `AgentResponseSchema`, handling string/JSON/structured formats
- **Metric recording** — emits dispatch duration histograms and error counters per agent

## Quick Start

```typescript
import { dispatchToAgent, buildTurnEntry } from "@reaatech/agent-mesh-router";

const response = await dispatchToAgent(servalAgent, {
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
  employeeId: "emp-123",
  displayName: "John Doe",
  rawInput: "Reset my password",
  intentSummary: "Password reset request",
  entities: { account_type: "okta" },
  detectedLanguage: "en",
  turnHistory: [],
  workflowState: {},
});

console.log(response.content);
// → "I've initiated your password reset. Check your email."
```

## API Reference

### Dispatch

#### `dispatchToAgent(agent, input): Promise<AgentResponse>`

The main entry point. Checks the circuit breaker, builds a `ContextPacket`, dispatches via MCP, records success/failure, and returns a validated `AgentResponse`.

```typescript
async function dispatchToAgent(
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
): Promise<AgentResponse>
```

#### Throws

- `Circuit breaker OPEN for agent <id>` — if the circuit is open
- `MCP request timeout after <ms>ms` — if the dispatch exceeds the timeout
- `Agent response did not match AgentResponseSchema` — if the response can't be validated
- `Failed to dispatch request to agent <id>` — if all retries are exhausted

### Turn Helpers

#### `buildTurnEntry(role, content, intentSummary?): TurnEntry`

Creates a timestamped turn entry for session history.

#### `formatAgentResponse(response): string`

Extracts the `content` string from an `AgentResponse`.

#### `shouldCloseSession(response): boolean`

Returns `true` if `workflow_complete` is `true`.

#### `getUpdatedWorkflowState(current, response): Record<string, unknown>`

Returns the agent's `workflow_state` if provided, otherwise the current state.

### MCP Client

#### `mcpClientFactory` (singleton)

Manages a pool of `McpClient` instances, one per agent ID. Reuses existing clients on subsequent calls.

```typescript
import { mcpClientFactory } from "@reaatech/agent-mesh-router";

// Get or create a client for an agent
const client = mcpClientFactory.getClient(agentConfig);

// Close all pooled connections (graceful shutdown)
await mcpClientFactory.closeAll();

// Remove a specific agent's client
mcpClientFactory.removeClient("serval");
```

#### `McpClient` (class)

| Method | Description |
|--------|-------------|
| `sendMessage(context)` | Sends a `ContextPacket` via MCP and returns a validated `AgentResponse` |
| `close()` | Closes all pooled connections for this agent |
| `isConnected()` | Returns `true` if at least one pooled connection is active |

**Connection pooling behavior:**
- Up to 5 connections per agent
- Expired connections (>5s idle) are evicted
- Automatic retry with `MCP_MAX_RETRIES` attempts
- 50ms backoff when pool is saturated

## Context Packet Shape

The `ContextPacket` built by `dispatchToAgent` and sent to agents:

```typescript
interface ContextPacket {
  session_id: string;           // UUID
  request_id: string;           // UUID (generated per dispatch)
  employee_id: string;
  display_name: string;
  raw_input: string;
  intent_summary: string;
  entities: Record<string, unknown>;
  detected_language: string;
  turn_history: TurnEntry[];
  workflow_state: Record<string, unknown>;
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_REQUEST_TIMEOUT_MS` | `30000` | Dispatch timeout in milliseconds |
| `MCP_MAX_RETRIES` | `3` | Max retry attempts for failed dispatches |
| `ENABLE_CIRCUIT_BREAKER` | `true` | Whether to check circuit breaker before dispatching |

## Usage Patterns

### Full Dispatch Pipeline

```typescript
import { dispatchToAgent, shouldCloseSession, getUpdatedWorkflowState } from "@reaatech/agent-mesh-router";

async function routeRequest(agent: AgentConfig, session: SessionRecord, classification: ClassifierOutput, input: string) {
  const response = await dispatchToAgent(agent, {
    sessionId: session.session_id,
    employeeId: session.employee_id,
    displayName: "User",
    rawInput: input,
    intentSummary: classification.intent_summary,
    entities: classification.entities,
    detectedLanguage: classification.detected_language,
    turnHistory: session.turn_history,
    workflowState: session.workflow_state,
  });

  if (shouldCloseSession(response)) {
    await closeSession(session.session_id, "completed");
  } else {
    const updatedState = getUpdatedWorkflowState(session.workflow_state, response);
    await updateWorkflowState(session.session_id, updatedState);
  }

  return response.content;
}
```

### Graceful Shutdown

```typescript
import { mcpClientFactory } from "@reaatech/agent-mesh-router";

process.on("SIGTERM", async () => {
  await mcpClientFactory.closeAll();
  process.exit(0);
});
```

## Related Packages

- [`@reaatech/agent-mesh`](https://www.npmjs.com/package/@reaatech/agent-mesh) — Core types (ContextPacket, AgentResponse, MCP constants)
- [`@reaatech/agent-mesh-registry`](https://www.npmjs.com/package/@reaatech/agent-mesh-registry) — Agent config types
- [`@reaatech/agent-mesh-utils`](https://www.npmjs.com/package/@reaatech/agent-mesh-utils) — Circuit breaker (used for health gating)
- [`@reaatech/agent-mesh-observability`](https://www.npmjs.com/package/@reaatech/agent-mesh-observability) — Metrics (dispatch duration, errors)

## License

[MIT](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
