---
agent_id: "agent-mesh"
display_name: "Agent Mesh"
version: "1.0.0"
description: "Multi-agent orchestration mesh for complex workflows"
type: "orchestrator"
confidence_threshold: 0.9
---

# agent-mesh — Agent Development Guide

## What this is

This document defines the agent interaction model, skill definitions, and development
patterns for building AI agents that integrate with the `agent-mesh` orchestrator. It
complements `ARCHITECTURE.md` (which covers the orchestrator's internal design) by
focusing specifically on how to build, configure, and deploy agents that participate
in the multi-agent system.

**Target audience:** Engineers building MCP-compliant AI agents for enterprise
orchestration platforms, platform teams integrating agents into multi-agent systems,
and SREs deploying agent infrastructure at scale.

---

## Monorepo Structure

agent-mesh is organized as a pnpm monorepo with 10 packages published under the
`@reaatech` scope, plus a reference deployment example.

| Package | npm Name | Purpose |
|---------|----------|---------|
| `packages/core` | [`@reaatech/agent-mesh`](https://www.npmjs.com/package/@reaatech/agent-mesh) | Core domain types, Zod schemas, env config, constants |
| `packages/registry` | [`@reaatech/agent-mesh-registry`](https://www.npmjs.com/package/@reaatech/agent-mesh-registry) | Agent YAML loader, SIGHUP hot-reload |
| `packages/session` | [`@reaatech/agent-mesh-session`](https://www.npmjs.com/package/@reaatech/agent-mesh-session) | Firestore-backed multi-turn session management |
| `packages/classifier` | [`@reaatech/agent-mesh-classifier`](https://www.npmjs.com/package/@reaatech/agent-mesh-classifier) | Gemini Flash intent classification |
| `packages/confidence` | [`@reaatech/agent-mesh-confidence`](https://www.npmjs.com/package/@reaatech/agent-mesh-confidence) | Confidence-gated routing decision tree |
| `packages/router` | [`@reaatech/agent-mesh-router`](https://www.npmjs.com/package/@reaatech/agent-mesh-router) | MCP-based agent dispatch |
| `packages/gateway` | [`@reaatech/agent-mesh-gateway`](https://www.npmjs.com/package/@reaatech/agent-mesh-gateway) | Express middleware and request handler |
| `packages/mcp-server` | [`@reaatech/agent-mesh-mcp-server`](https://www.npmjs.com/package/@reaatech/agent-mesh-mcp-server) | MCP server exposing orchestrator |
| `packages/utils` | [`@reaatech/agent-mesh-utils`](https://www.npmjs.com/package/@reaatech/agent-mesh-utils) | Circuit breaker with Firestore persistence |
| `packages/observability` | [`@reaatech/agent-mesh-observability`](https://www.npmjs.com/package/@reaatech/agent-mesh-observability) | Logging, metrics, tracing, audit |

**Toolchain:** pnpm workspaces + Turbo + Changesets + tsup + Biome + Vitest.

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   AI Client     │────▶│  Orchestrator    │────▶│  Agent Registry │
│  (Claude, etc) │     │  (agent-mesh)    │     │  (YAML configs) │
└─────────────────┘     │                  │     └─────────────────┘
                        │  ┌────────────┐  │              │
                        │  │ Rate       │  │              │
                        │  │ Limiter    │  │              │
                        │  └────────────┘  │              │
                        │  ┌────────────┐  │              ▼
                        │  │ Session    │  │     ┌─────────────────┐
                        │  │ Manager    │  │     │  Agent Pool     │
                        │  └────────────┘  │     │  (MCP servers)   │
                        │  ┌────────────┐  │     └─────────────────┘
                        │  │ Classifier │  │              ▲
                        │  │ (Gemini)   │  │              │
                        │  └────────────┘  │              │
                        │  ┌────────────┐  │              │
                        │  │ Confidence │  │              │
                        │  │ Gate       │  │              │
                        │  └────────────┘  │              │
                        │  ┌────────────┐  │              │
                        │  │ Circuit    │  │              │
                        │  │ Breaker    │  │──────────────┘
                        │  └────────────┘  │
                        └──────────────────┘
```

### Key Components

| Component | Package | Purpose |
|-----------|---------|---------|
| **Agent Registry** | `@reaatech/agent-mesh-registry` | YAML agent definitions with SIGHUP hot-reload |
| **Rate Limiter** | `@reaatech/agent-mesh-gateway` | Token bucket per-client rate limiting |
| **Session Manager** | `@reaatech/agent-mesh-session` | Firestore-backed multi-turn state |
| **Classifier** | `@reaatech/agent-mesh-classifier` | Gemini Flash intent classification |
| **Confidence Gate** | `@reaatech/agent-mesh-confidence` | Route/clarify/fallback decision tree |
| **Circuit Breaker** | `@reaatech/agent-mesh-utils` | Per-agent resilience pattern |
| **MCP Router** | `@reaatech/agent-mesh-router` | Agent dispatch via MCP protocol |
| **Gateway** | `@reaatech/agent-mesh-gateway` | Express middleware, entry handler, auth |
| **MCP Server** | `@reaatech/agent-mesh-mcp-server` | Exposes orchestrator as MCP-compliant agent |
| **Observability** | `@reaatech/agent-mesh-observability` | Winston logging, OTel tracing/metrics, audit |

---

## Agent Configuration

Agents participating in the orchestrator must be registered via YAML configuration
files. The registry is loaded at startup and reloaded on `SIGHUP` without restart.

### agent.yaml Schema

```yaml
# agents/my-agent.yaml — Agent registration for orchestrator
agent_id: "my-agent"
display_name: "My Agent"

description: >-
  Detailed description of agent capabilities. This text is injected
  verbatim into the Gemini classifier prompt, so be specific about
  what this agent handles and what it doesn't.

endpoint: "${MY_AGENT_ENDPOINT:-http://localhost:8081}"
type: mcp
is_default: false
confidence_threshold: 0.7
clarification_required: false

# Shown to users when the orchestrator asks for clarification
clarification_context: >-
  I can help you with X, Y, and Z. What specifically do you need?

# Few-shot examples for the classifier — more examples = better routing
examples:
  - "Example query that should route to this agent"
  - "Another query this agent should handle"
  - "A third example showing the agent's domain"
```

### Schema Reference

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `agent_id` | yes | string | Unique identifier (lowercase, hyphens allowed) |
| `display_name` | yes | string | Human-readable name for UI and prompts |
| `description` | yes | string | Injected into classifier prompt — be precise |
| `endpoint` | yes | string | MCP server URL (must be valid HTTP/HTTPS) |
| `type` | yes | string | Always `"mcp"` |
| `is_default` | yes | boolean | Exactly one agent must be default |
| `confidence_threshold` | yes | number | 0.0–1.0, default agent must be 0.0 |
| `clarification_required` | yes | boolean | Whether to ask clarifying questions |
| `clarification_context` | no | string | Shown when clarification is needed |
| `examples` | yes | string[] | Few-shot examples for classifier |

### Invariants Enforced at Load Time

1. **Exactly one default agent** — if multiple agents have `is_default: true`,
   the entire reload is aborted and the old registry remains active.

2. **Default agent threshold must be 0** — the default agent always accepts
   fallback traffic, so its threshold is enforced to 0.0.

3. **Unique agent IDs** — duplicate IDs cause reload abort.

4. **Valid endpoint URLs** — localhost and private IP ranges (10.x, 172.16.x,
   192.168.x) are rejected to prevent SSRF vulnerabilities.

5. **File size limits** — YAML files exceeding 1MB are skipped.

### Registration Process

1. Create your agent YAML file in the registry directory:
   ```bash
   cp agents/my-agent.yaml /path/to/orchestrator/agents/
   ```

2. Set the environment variable for your endpoint:
   ```bash
   export MY_AGENT_ENDPOINT=https://my-agent.cloudrun.app
   ```

3. Send `SIGHUP` to the orchestrator process to hot-reload:
   ```bash
   kill -HUP $(pgrep -f orchestrator)
   ```

4. Verify the agent is loaded:
   ```bash
   curl http://localhost:8080/health/deep | jq .agents
   ```

---

## MCP Protocol Contract

Agents must implement the MCP (Model Context Protocol) server interface. The
orchestrator communicates with agents via `StreamableHTTP` transport.

### Request Format

The orchestrator sends a `handle_message` tool call with the following structure:

```json
{
  "jsonrpc": "2.0",
  "id": "request-123",
  "method": "tools/call",
  "params": {
    "name": "handle_message",
    "arguments": {
      "session_id": "550e8400-e29b-41d4-a716-446655440000",
      "request_id": "660e8400-e29b-41d4-a716-446655440001",
      "employee_id": "emp123",
      "display_name": "John Doe",
      "raw_input": "Reset my password",
      "intent_summary": "User needs password reset assistance",
      "entities": { "account_type": "okta" },
      "detected_language": "en",
      "turn_history": [
        { "role": "user", "content": "First message", "timestamp": "2026-04-15T22:00:00Z" },
        { "role": "agent", "content": "Response", "timestamp": "2026-04-15T22:00:05Z" }
      ],
      "workflow_state": {}
    }
  }
}
```

### Response Format

Agents must return a response matching this schema:

```json
{
  "jsonrpc": "2.0",
  "id": "request-123",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "I can help you reset your password. Please visit..."
      }
    ]
  }
}
```

The orchestrator validates the response against this Zod schema (from `@reaatech/agent-mesh`):

```typescript
import { AgentResponseSchema } from '@reaatech/agent-mesh';

// Schema shape:
// z.object({
//   content: z.string().min(1, 'content is required'),
//   workflow_complete: z.boolean(),
//   workflow_state: z.record(z.string(), z.unknown()).optional(),
// });
```

### Response Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `content` | yes | string | Human-readable response for the user |
| `workflow_complete` | yes | boolean | `true` = close session, `false` = keep open |
| `workflow_state` | no | object | Agent-managed state for multi-turn context |

### Workflow State

For multi-turn agents, use `workflow_state` to persist context across turns:

```json
{
  "content": "I've started your password reset. What's your email?",
  "workflow_complete": false,
  "workflow_state": {
    "step": "awaiting_email",
    "reset_token": "abc123"
  }
}
```

The orchestrator passes this state back on subsequent turns, allowing the agent
to maintain context without the orchestrator understanding the content.

---

## Skill System

Skills are the atomic unit of agent capability. Each skill maps to one or more
MCP tools and is described by a `skills/{skill-id}.md` file.

### Skill File Structure

```markdown
# {skill-display-name}

## Capability
One-sentence description of what this skill enables.

## MCP Tools
| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `tool_name` | Zod schema summary | Return type | RPM |

## Usage Examples
### Example 1: Basic usage
- User intent
- Tool call
- Expected response

## Error Handling
- Known failure modes
- Recovery strategies
- Escalation paths

## Security Considerations
- PII handling
- Permission requirements
- Audit logging
```

### Built-in Skills

The `agent-mesh` orchestrator exposes these skills for agent use:

| Skill ID | File | Description |
|----------|------|-------------|
| `routing` | `skills/routing/skill.md` | Intent classification and agent routing |
| `circuit-breaker` | `skills/circuit-breaker/skill.md` | Agent resilience and failure isolation |
| `session-management` | `skills/session-management/skill.md` | Multi-turn conversation state |
| `clarification` | `skills/clarification/skill.md` | User clarification when confidence is low |

### Adding a New Skill

1. **Create the skill definition:**
   ```bash
   mkdir -p skills/my-skill
   touch skills/my-skill/skill.md
   ```

2. **Implement the MCP tools** in your agent server.

3. **Update this document** with the new skill in the table above.

---

## Confidence-Gated Routing

The orchestrator uses a confidence gate to decide whether to route to your agent,
ask for clarification, or fall back to the default agent.

### Decision Tree

```
1. Unknown agent_id        → route to default agent
2. Default agent           → always route directly (no threshold check)
3. Confidence ≥ threshold AND not ambiguous → route to your agent
4. clarification_required  → generate clarification question
5. Otherwise               → fall back to default agent
```

### Configuring Your Threshold

Set `confidence_threshold` in your agent YAML based on how specific your domain is:

| Threshold | Use Case |
|-----------|----------|
| 0.0–0.3 | Broad, general-purpose agent (like the default) |
| 0.4–0.6 | Moderately specific domain (IT helpdesk, HR) |
| 0.7–0.9 | Narrow, well-defined domain (password reset, expense reports) |
| 1.0 | Never recommended — you'll never receive traffic |

### Clarification Flow

If your agent has `clarification_required: true` and confidence is below threshold,
the orchestrator generates a clarification question using Gemini:

1. Orchestrator detects low confidence for your agent
2. Gemini generates a targeted question in the user's language
3. Question is shown to the user
4. User's response is re-classified with the additional context
5. If confidence improves, route to your agent; otherwise fall back

This allows users to confirm their intent before being routed to specialized agents.

---

## Circuit Breaker Integration

The orchestrator implements per-agent circuit breakers to prevent cascading failures.
Your agent's health directly affects whether it receives traffic.

### Circuit States

| State | Behavior | When |
|-------|----------|------|
| **CLOSED** | Normal — requests pass through | Default state, agent is healthy |
| **OPEN** | Requests rejected immediately | Agent has exceeded failure threshold |
| **HALF_OPEN** | Limited test requests allowed | Testing if agent has recovered |

### Configuration

The orchestrator's circuit breaker is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | 5 | Failures before opening |
| `CIRCUIT_BREAKER_RESET_TIMEOUT_MS` | 30000 | Time before recovery attempt |
| `CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS` | 3 | Test calls in half-open state |
| `CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS` | 60000 | Max time in half-open state |

### Best Practices for Agents

1. **Return proper error responses** — don't just crash or timeout
2. **Implement health checks** — the orchestrator may probe your `/health` endpoint
3. **Use timeouts** — don't let requests hang indefinitely
4. **Return `workflow_complete: true`** for terminal states to close sessions
5. **Handle retries gracefully** — the orchestrator may retry on transient failures

### State Persistence

Circuit breaker state is persisted to Firestore and survives Cloud Run restarts.
This means if your agent is unhealthy, it won't immediately receive traffic when
the orchestrator restarts — it must prove it has recovered first.

---

## Session Management

The orchestrator manages multi-turn sessions in Firestore. Understanding the
session lifecycle helps you build agents that maintain context correctly.

### Session Lifecycle

```
createSession  →  status: 'active',  ttl: now + 30m
appendTurn     →  arrayUnion (transaction),  ttl refreshed
updateWorkflow →  workflow_state replaced
closeSession   →  status: COMPLETED | ABANDONED | ERROR
                  ttl field deleted (Firestore TTL policy GCs document)
resumeSession  →  new session_id, prior turn_history carried forward
```

### Session Bypass

If a user has an active session (`status == 'active'` AND `ttl > now()`), the
orchestrator **skips classification** and routes directly to the session's agent.
This is a hard requirement — mid-turn messages are never re-classified.

### Turn History

Each turn is stored as:

```typescript
interface TurnEntry {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;  // ISO-8601
  intent_summary?: string;  // For bypass-path context
}
```

Your agent receives the full turn history on each request, allowing you to
maintain conversational context.

### Workflow State

Use `workflow_state` to persist agent-specific context:

```json
{
  "workflow_state": {
    "step": "collecting_info",
    "collected_fields": ["name", "email"],
    "pending_action": "password_reset"
  }
}
```

The orchestrator passes this through without interpreting it — it's your agent's
private state bag.

---

## Security Model

### Input Validation

All tool inputs are validated against Zod schemas before reaching your agent.
The orchestrator also sanitizes string inputs for prompt-injection patterns.

### PII Handling

- **Never log raw user input** — the orchestrator's logger redacts PII automatically
- **Never return PII in error messages** — use generic error text
- **Use the orchestrator's audit logging** for compliance-critical events

### Authentication

The orchestrator validates API keys on all inbound requests. Your agent should
trust that authentication has already been performed — don't re-validate unless
you have specific agent-level permissions.

### SSRF Protection

Agent endpoint URLs are validated to reject localhost and private IP ranges.
This prevents malicious agent registrations from accessing internal services.

---

## Observability

### Structured Logging

The orchestrator logs all events with `request_id` and `service` context. When
building agents, follow the same pattern:

```typescript
import { logger } from '@reaatech/agent-mesh-observability';

logger.info({
  request_id: context.requestId,
  agent_id: 'my-agent',
  action: 'handle_message',
  duration_ms: elapsed,
}, 'Agent request completed');
```

### Tracing

Each tool call is traced as an OpenTelemetry span. Add custom attributes:

```typescript
import { trace } from '@opentelemetry/api';

const span = trace.getActiveSpan();
span?.setAttribute('agent.action', 'password_reset');
span?.setAttribute('agent.step', 'collecting_email');
```

### Metrics

The orchestrator exposes these default metrics:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `agent.dispatch.duration_ms` | Histogram | `agent_id` | Agent response latency |
| `agent.dispatch.errors` | Counter | `agent_id`, `error_type` | Agent error rate |
| `circuit_breaker.state` | Gauge | `agent_id` | Circuit breaker state |

Add custom metrics for your agent's key operations.

---

## Testing

### Contract Tests

The orchestrator includes contract tests that validate:

1. **Registry Contract** — YAML schema validation, invariant enforcement
2. **Protocol Contract** — MCP request/response schema compliance
3. **Routing Contract** — Decision tree correctness

Run these tests to ensure your agent is compatible:

```bash
pnpm test
```

### Agent Testing

Test your agent's MCP server independently:

```typescript
import { describe, it, expect } from 'vitest';
import { AgentResponseSchema } from '@reaatech/agent-mesh';

describe('my-agent', () => {
  it('should handle password reset request', async () => {
    const result = await handle_message({
      session_id: 'test-session',
      request_id: 'test-request',
      employee_id: 'emp123',
      raw_input: 'Reset my password',
      intent_summary: 'Password reset request',
      turn_history: [],
      workflow_state: {},
    });

    expect(result.workflow_complete).toBe(false);
    expect(result.content).toContain('password');
  });
});
```

### Integration Tests

Test the full routing flow with the orchestrator:

```typescript
describe('Multi-agent routing', () => {
  it('should route password reset queries to my-agent', async () => {
    const response = await fetch('http://localhost:8080/v1/request', {
      method: 'POST',
      headers: { 'x-api-key': 'test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: 'I need to reset my password',
        employee_id: 'emp123',
        entry_point: 'ui',
      }),
    });

    const result = await response.json();
    expect(result.agent_id).toBe('my-agent');
  });
});
```

---

## Deployment

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | no | `8080` | HTTP listen port |
| `NODE_ENV` | no | `development` | Environment name (development/production/test) |
| `GOOGLE_CLOUD_PROJECT` | yes | — | GCP project ID |
| `GOOGLE_CLOUD_REGION` | no | `us-central1` | GCP region |
| `FIRESTORE_DATABASE` | no | `(default)` | Firestore database ID |
| `VERTEX_AI_LOCATION` | no | `us-central1` | Vertex AI region |
| `VERTEX_AI_MODEL` | no | `gemini-2.0-flash` | Classification model |
| `API_KEY` | yes | — | API key for authentication |
| `API_KEY_SECRET_NAME` | no | — | Secret Manager secret name for API key |
| `SLACK_BOT_TOKEN` | no | — | Slack bot token for profile resolution |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | — | OTel collector endpoint |
| `LOG_LEVEL` | no | `info` | Log level (debug/info/warn/error) |
| `SESSION_TTL_MINUTES` | no | `30` | Session TTL in minutes |
| `SESSION_MAX_TURNS` | no | `100` | Maximum turns per session |
| `ENABLE_SESSION_BYPASS` | no | `true` | Enable session bypass for mid-turn messages |
| `ENABLE_CLARIFICATION` | no | `true` | Enable clarification questions when confidence is low |
| `ENABLE_CIRCUIT_BREAKER` | no | `true` | Enable per-agent circuit breakers |
| `ENABLE_RATE_LIMITING` | no | `true` | Enable rate limiting middleware |
| `RATE_LIMIT_WINDOW_MS` | no | `900000` | Rate limit window in ms (15 min default) |
| `RATE_LIMIT_MAX_REQUESTS` | no | `100` | Max requests per window |
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | no | `5` | Failures before opening circuit |
| `CIRCUIT_BREAKER_RESET_TIMEOUT_MS` | no | `30000` | Time before recovery attempt (ms) |
| `CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS` | no | `3` | Test calls in half-open state |
| `CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS` | no | `60000` | Max time in half-open state (ms) |
| `CB_SYNC_INTERVAL_MS` | no | `5000` | Circuit breaker Firestore sync interval |
| `CB_LEADER_LEASE_MS` | no | `15000` | Leader lease duration (ms) |
| `AGENT_REGISTRY_DIR` | no | `./agents` | Directory containing agent YAML files |
| `MCP_REQUEST_TIMEOUT_MS` | no | `30000` | MCP request timeout (ms) |
| `MCP_MAX_RETRIES` | no | `3` | Max retries for failed MCP requests |

### Local Development

```bash
git clone https://github.com/reaatech/agent-mesh.git
cd agent-mesh
pnpm install
pnpm build
pnpm --filter @reaatech/agent-mesh-orchestrator build
GOOGLE_CLOUD_PROJECT=my-project API_KEY=dev-key node examples/orchestrator/dist/index.js
```

### Docker

```bash
docker build -t agent-mesh .
docker run -p 8080:8080 -e GOOGLE_CLOUD_PROJECT=my-project agent-mesh
```

### GCP Cloud Run

```bash
gcloud run deploy agent-mesh \
  --image gcr.io/my-project/agent-mesh:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=my-project
```

### Register with Orchestrator

1. Deploy your agent and get the URL
2. Create agent YAML:
   ```yaml
   agent_id: my-agent
   display_name: My Agent
   description: "My agent's capabilities..."
   endpoint: https://my-agent-xyz.run.app
   type: mcp
   is_default: false
   confidence_threshold: 0.7
   clarification_required: false
   examples:
     - "Example query"
   ```
3. Copy to orchestrator's agent registry
4. Send `SIGHUP` to reload

---

## Checklist: Production Readiness

Before deploying an agent to production:

- [ ] Agent implements MCP `handle_message` tool
- [ ] Response schema matches `AgentResponseSchema` (content, workflow_complete, workflow_state)
- [ ] Agent handles all error cases gracefully (no unhandled exceptions)
- [ ] Agent respects timeouts (configurable, default 30s)
- [ ] Agent returns `workflow_complete: true` for terminal states
- [ ] Agent uses `workflow_state` for multi-turn context
- [ ] Agent YAML is valid and passes schema validation
- [ ] Agent endpoint is reachable (not localhost/private IP)
- [ ] Agent has health check endpoint (`GET /health`)
- [ ] Agent logs are structured JSON with `request_id`
- [ ] Agent uses OpenTelemetry for tracing
- [ ] Agent contract tests pass
- [ ] Agent integration tests pass
- [ ] No PII in logs or error messages
- [ ] Agent handles concurrent requests safely

---

## References

- **ARCHITECTURE.md** — Orchestrator system design deep dive
- **README.md** — Quick start and overview
- **MCP Specification** — https://modelcontextprotocol.io/
- **skills/** — Skill definitions for orchestrator capabilities
```
