# @reaatech/agent-mesh

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-mesh.svg)](https://www.npmjs.com/package/@reaatech/agent-mesh)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-mesh/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Core domain types, Zod validation schemas, environment configuration, and shared constants for the agent-mesh multi-agent orchestrator. This package is the single source of truth for all protocol shapes used throughout the `@reaatech/agent-mesh-*` ecosystem.

## Installation

```bash
npm install @reaatech/agent-mesh
# or
pnpm add @reaatech/agent-mesh
```

## Feature Overview

- **15+ exported types and Zod schemas** — every domain entity has a matching runtime validation schema
- **Environment configuration** — Zod-validated `env` object with 30+ configurable variables, fail-fast on missing required vars
- **Shared constants** — service metadata, TTLs, size limits, rate-limit headers, SSRF protection patterns, and Pub/Sub collection names
- **Zero runtime dependencies beyond `zod`** — lightweight and tree-shakeable
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import {
  IncomingRequestSchema,
  type IncomingRequest,
  AgentResponseSchema,
  type AgentResponse,
} from "@reaatech/agent-mesh";

// Validate an incoming request at the boundary
const raw = JSON.parse(req.body);
const parsed = IncomingRequestSchema.parse(raw);

// Validate an agent's response before returning to the user
const agentResponse = AgentResponseSchema.parse({
  content: "I've reset your password. Check your email.",
  workflow_complete: true,
});
```

## Exports

### Request / Response Types

| Export | Description |
|--------|-------------|
| `IncomingRequestSchema` / `IncomingRequest` | Validated HTTP request body for `/v1/request` |
| `EmployeeProfileSchema` / `EmployeeProfile` | Resolved user identity from profile systems |
| `AgentResponseSchema` / `AgentResponse` | Validated agent response with `content`, `workflow_complete`, and `workflow_state` |

### Classifier Types

| Export | Description |
|--------|-------------|
| `ClassifierOutputSchema` / `ClassifierOutput` | Structured Gemini classifier output: `agent_id`, `confidence`, `ambiguous`, `detected_language`, `intent_summary`, `entities` |

### Agent Configuration

| Export | Description |
|--------|-------------|
| `AgentConfigSchema` / `AgentConfig` | YAML agent registration schema: `agent_id`, `display_name`, `description`, `endpoint`, `confidence_threshold`, `examples`, etc. |

### Routing Types

| Export | Description |
|--------|-------------|
| `ContextPacketSchema` / `ContextPacket` | Full context bundle passed to agents: `session_id`, `request_id`, `employee_id`, `raw_input`, `intent_summary`, `entities`, `turn_history`, `workflow_state` |
| `ConfidenceDecisionSchema` / `ConfidenceDecision` | Routing decision: `action` (route/clarify/fallback), `agent_id`, `confidence`, `reason`, `clarification_question` |

### Session Types

| Export | Description |
|--------|-------------|
| `SessionRecordSchema` / `SessionRecord` | Firestore session document: `session_id`, `user_id`, `status`, `active_agent`, `turn_history`, `workflow_state`, `ttl` |
| `TurnEntrySchema` / `TurnEntry` | Single conversation turn: `role`, `content`, `timestamp`, `intent_summary` |
| `SessionStatus` | Union type: `active`, `completed`, `abandoned`, `error` |

### Circuit Breaker Types

| Export | Description |
|--------|-------------|
| `CircuitBreakerStateSchema` / `CircuitBreakerState` | Per-agent state: `agent_id`, `state` (CLOSED/OPEN/HALF_OPEN), `failure_count`, `success_count`, `backoff_multiplier` |
| `CircuitState` | Union type: `CLOSED`, `OPEN`, `HALF_OPEN` |

### Health Check Types

| Export | Description |
|--------|-------------|
| `HealthStatusSchema` / `HealthStatus` | Health check response: `status`, `version`, `uptime_ms`, `checks` map |

### Configuration

| Export | Description |
|--------|-------------|
| `env` | Zod-validated environment object with 30+ typed config variables |
| `Env` | TypeScript type inferred from the environment schema |

### Constants

| Export | Description |
|--------|-------------|
| `SERVICE_NAME` / `SERVICE_VERSION` | Service metadata |
| `MAX_YAML_FILE_SIZE` / `MAX_REQUEST_BODY_SIZE` | Size guards |
| `CACHE_TTL` | TTL constants for API key, Slack profile, and clarification caches |
| `RATE_LIMIT_HEADERS` | Standard rate-limit response header names |
| `PRIVATE_IP_RANGES` | Regex patterns blocking localhost and private IPs (SSRF protection) |
| `SUPPORTED_LANGUAGES` / `DEFAULT_LANGUAGE` | 58 ISO 639-1 language codes for i18n |
| `PUBSUB_TOPICS` / `FIRESTORE_COLLECTIONS` | GCP resource naming constants |
| `MCP` | MCP protocol version and method names |
| `CONFIDENCE` / `SESSION` | Threshold boundaries and session defaults |

## Usage Pattern

Every schema export has a matching type export. Use the schema for runtime validation and the type for compile-time checking:

```typescript
import { IncomingRequestSchema, type IncomingRequest } from "@reaatech/agent-mesh";

function handleRequest(raw: unknown): IncomingRequest {
  return IncomingRequestSchema.parse(raw);
}
```

## Related Packages

- [`@reaatech/agent-mesh-registry`](https://www.npmjs.com/package/@reaatech/agent-mesh-registry) — Agent YAML loader and SIGHUP hot-reload
- [`@reaatech/agent-mesh-classifier`](https://www.npmjs.com/package/@reaatech/agent-mesh-classifier) — Gemini intent classification
- [`@reaatech/agent-mesh-session`](https://www.npmjs.com/package/@reaatech/agent-mesh-session) — Firestore session management

## License

[MIT](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
