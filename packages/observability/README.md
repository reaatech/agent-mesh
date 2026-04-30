# @reaatech/agent-mesh-observability

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-mesh-observability.svg)](https://www.npmjs.com/package/@reaatech/agent-mesh-observability)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-mesh/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Observability layer for the agent-mesh orchestrator. Provides structured JSON logging with PII redaction, OpenTelemetry tracing and metrics, and structured audit event logging for compliance-critical operations.

## Installation

```bash
npm install @reaatech/agent-mesh-observability
# or
pnpm add @reaatech/agent-mesh-observability
```

## Feature Overview

- **Structured JSON logging** — Winston-powered logger with automatic PII redaction (emails, SSNs, credit cards, phone numbers)
- **Child loggers** — create context-aware loggers with `request_id` and `session_id` propagation
- **OpenTelemetry tracing** — OTLP gRPC trace export with HTTP and Express auto-instrumentation
- **Metrics SDK** — histograms and counters for session lookups, agent dispatch latency, clarification events, and circuit breaker state
- **Audit logging** — structured events for auth, routing, circuit breaker changes, and security events — ready for BigQuery ingestion
- **PII redaction** — recursive redaction of known PII patterns in log metadata

## Quick Start

```typescript
import { logger, createChildLogger } from "@reaatech/agent-mesh-observability";

// Log with structured metadata
logger.info("Agent mesh started", {
  service: "agent-mesh",
  port: 8080,
});

// Create a request-scoped child logger
const requestLogger = createChildLogger({
  request_id: "550e8400-e29b-41d4-a716-446655440000",
  session_id: "660e8400-e29b-41d4-a716-446655440001",
});

requestLogger.info("Processing request");
// → {"timestamp":"...","level":"info","service":"agent-mesh","message":"Processing request","request_id":"...","session_id":"..."}
```

## API Reference

### Logging

#### `logger`

The default Winston logger instance configured with:
- Structured JSON output
- PII redaction (emails, SSNs, credit cards, phone numbers)
- Console transport (stderr for `error`/`warn`, stdout for `info`/`debug`)
- Service name automatically included in every log line

```typescript
logger.info("Ready");
logger.warn("Rate limit approaching", { remaining: 5 });
logger.error("Circuit breaker opened", { agent_id: "serval", err: new Error("timeout") });
```

#### `createChildLogger(context: Record<string, string>): Logger`

Creates a child logger that includes additional context in every log line. Useful for request-scoped or agent-scoped logging.

```typescript
const child = createChildLogger({ request_id: "abc-123" });
child.info("Dispatching to agent");
// → {..., "request_id":"abc-123", "message":"Dispatching to agent"}
```

### Metrics

#### `recordSessionLookupDuration(durationMs: number, hit: boolean): void`

Records a histogram observation for session lookup latency, tagged with cache hit/miss.

```typescript
const start = Date.now();
const session = await getActiveSession(userId);
recordSessionLookupDuration(Date.now() - start, session !== null);
```

#### `recordClarification(agentId: string): void`

Increments the clarification counter for a given agent.

#### `recordAgentDispatchDuration(agentId: string, durationMs: number): void`

Records a histogram observation for agent dispatch latency, tagged by `agent_id`.

#### `recordAgentDispatchError(agentId: string, errorType: string): void`

Increments the agent dispatch error counter, tagged by `agent_id` and `error_type`.

#### `getMeter()` / `getMeterProvider()`

Low-level access to the OpenTelemetry meter and provider for creating custom metrics.

### Tracing

#### `initOtel(): NodeSDK | null`

Initializes the OpenTelemetry SDK with OTLP gRPC trace export, HTTP and Express instrumentations. Returns `null` if no `OTEL_EXPORTER_OTLP_ENDPOINT` is configured.

```typescript
import { initOtel } from "@reaatech/agent-mesh-observability";

initOtel(); // Call at the very start of your application
```

#### `shutdownOtel(): Promise<void>`

Gracefully shuts down the OTel SDK, flushing pending spans.

### Audit Events

#### `AUDIT_EVENTS`

Enum of all audit event types: `AUTH_REQUEST`, `AUTH_SUCCESS`, `AUTH_FAILURE`, `SESSION_CREATED`, `SESSION_CLOSED`, `AGENT_ROUTED`, `AGENT_FALLBACK`, `CLASSIFIER_INVOKED`, `CIRCUIT_BREAKER_OPENED`, `SSRF_ATTEMPT`, `PROMPT_INJECTION`, and more.

#### `logAuditEvent(event: AuditEvent): void`

Logs a structured audit event with standard fields: `event_type`, `timestamp`, `request_id`, `session_id`, `user_id`, `employee_id`, `agent_id`, `outcome`, `details`.

#### Convenience Functions

| Function | Purpose |
|----------|---------|
| `logAuthRequest(requestId, outcome, details?)` | Log authentication success/failure |
| `logAgentRouted(requestId, sessionId, agentId, confidence, isFallback)` | Log routing decision |
| `logCircuitBreakerChange(agentId, newState, details?)` | Log circuit state transitions |
| `logSecurityEvent(eventType, requestId, details?)` | Log SSRF attempts, prompt injection, invalid input |

## Usage Patterns

### Request-Scoped Logging

```typescript
import { logger, createChildLogger } from "@reaatech/agent-mesh-observability";

async function handleRequest(req: Request) {
  const requestId = crypto.randomUUID();
  const log = createChildLogger({ request_id: requestId });

  log.info("Request received");
  await processRequest(req);
  log.info("Request complete", { duration_ms: Date.now() - start });
}
```

### Metric Recording in Services

```typescript
import { recordAgentDispatchDuration, recordAgentDispatchError } from "@reaatech/agent-mesh-observability";

async function dispatchToAgent(agent: AgentConfig) {
  const start = Date.now();
  try {
    const response = await mcpClient.sendMessage(context);
    recordAgentDispatchDuration(agent.agent_id, Date.now() - start);
    return response;
  } catch (error) {
    recordAgentDispatchError(agent.agent_id, error.name);
    throw error;
  }
}
```

## Related Packages

- [`@reaatech/agent-mesh`](https://www.npmjs.com/package/@reaatech/agent-mesh) — Core types and configuration
- [`@reaatech/agent-mesh-gateway`](https://www.npmjs.com/package/@reaatech/agent-mesh-gateway) — Express gateway (uses audit logging and metrics)
- [`@reaatech/agent-mesh-router`](https://www.npmjs.com/package/@reaatech/agent-mesh-router) — MCP agent dispatch (uses dispatch metrics)

## License

[MIT](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
