# agent-mesh — Architecture

## Monorepo Package Map

agent-mesh is organized as a pnpm monorepo. Each package is independently publishable
under the `@reaatech` scope with dual ESM/CJS output.

```
packages/
├── core/                  → @reaatech/agent-mesh              (types, schemas, config)
├── observability/         → @reaatech/agent-mesh-observability (logging, metrics, audit)
├── utils/                 → @reaatech/agent-mesh-utils         (circuit breaker, persistence)
├── registry/              → @reaatech/agent-mesh-registry     (YAML loader, SIGHUP)
├── session/               → @reaatech/agent-mesh-session       (Firestore session mgmt)
├── classifier/            → @reaatech/agent-mesh-classifier    (Gemini intent classification)
├── confidence/            → @reaatech/agent-mesh-confidence    (confidence gate, clarification)
├── router/                → @reaatech/agent-mesh-router        (MCP dispatch, connection pool)
├── gateway/               → @reaatech/agent-mesh-gateway       (Express middleware, handlers)
└── mcp-server/            → @reaatech/agent-mesh-mcp-server    (orchestrator-as-MCP-server)
examples/
└── orchestrator/          → Reference deployment (wires all packages together)
```

**Dependency graph (→ means "depends on"):**
```
agent-mesh (core)
 ├── observability ─────────────────────────────────────────────────────┐
 ├── registry ──────────────────────────────────────────────────────────┤
 ├── session ───────────────────────────────────────────────────────────┤
 ├── classifier ──► confidence ─────────────────────────────────────────┤
 ├── utils ─────────────────────────────────────────────────────────────┤
 │                                                                       ▼
 ├── session ──► gateway ──────────────────────────────────────────► mcp-server
 │                                                                       │
 └───────────────────────────────────────────────────────────────────────┤
                                                                         ▼
                                                                  examples/orchestrator
```

**Toolchain:** pnpm workspaces + Turbo (task orchestration) + Changesets (versioning) +
tsup (dual CJS/ESM build) + Biome (lint/format) + Vitest (testing).

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  MCP Client │    │  Web/Mobile │    │  Slack/Chat │                  │
│  │  (Claude)   │    │  App        │    │  Platform   │                  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│         │                   │                   │                         │
│         └───────────────────┼───────────────────┘                         │
│                             │ HTTP/HTTPS                                   │
└─────────────────────────────┼─────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Gateway Layer                                    │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────┐  │
│  │   Auth   │───▶│  Rate Limit  │───▶│    Session    │───▶│    TLS   │  │
│  │Middleware│    │  Middleware  │    │  Middleware   │    │Middleware│  │
│  └──────────┘    └──────────────┘    └───────────────┘    └──────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Orchestration Core                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Request Pipeline                             │   │
│  │                                                                   │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │   │
│  │  │  Classifier │───▶│  Confidence │───▶│    Router   │           │   │
│  │  │  (Gemini)   │    │    Gate     │    │   (MCP)     │           │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘           │   │
│  │         │                   │                   │                 │   │
│  │         ▼                   ▼                   ▼                 │   │
│  │  ┌─────────────────────────────────────────────────────────────┐  │   │
│  │  │                    Agent Registry                            │  │   │
│  │  │              (YAML + SIGHUP Hot-Reload)                      │  │   │
│  │  └─────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Agent Pool                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Agent A   │  │   Agent B   │  │   Agent C   │  │   Default   │    │
│  │   (MCP)     │  │   (MCP)     │  │   (MCP)     │  │   Agent     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Cross-Cutting Concerns                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │   Observability  │  │  Circuit Breaker │  │    Firestore     │       │
│  │  - Tracing (OTel)│  │  (Per-Agent)     │  │  - Sessions      │       │
│  │  - Metrics (OTel)│  │  - Persisted     │  │  - CB State      │       │
│  │  - Logging       │  │  - Leader Elected│  │  - TTL Management│       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. Stateless by Design
- No in-memory state shared across requests
- All session state persisted to Firestore
- Circuit breaker state persisted with leader election
- Enables horizontal scaling on Cloud Run / Kubernetes

### 2. Zero-Trust Security
- All inputs validated with Zod schemas
- SSRF protection on agent endpoint URLs
- API key required on all endpoints
- No PII in logs (automatic redaction)
- TLS enforcement in production

### 3. Observability First
- Every request has a `request_id` for tracing
- OpenTelemetry spans for every component
- Structured JSON logging (Winston)
- Metrics for SLO monitoring (latency, error rate, throughput)

### 4. Resilience Patterns
- Per-agent circuit breakers prevent cascading failures
- Confidence-gated routing with clarification fallback
- Session bypass for mid-turn consistency
- Graceful degradation on component failures

### 5. Convention over Configuration
- Agent registry via YAML files (no database schema)
- SIGHUP hot-reload (no restart required)
- Environment variable substitution in YAML
- Fail-fast startup on invalid configuration

---

## Component Deep Dive

### Gateway Layer

The gateway handles all inbound HTTP traffic before it reaches the orchestration core.
Implemented in `@reaatech/agent-mesh-gateway`.

| Middleware | Order | Purpose |
|------------|-------|---------|
| **TLS** | 1 | HTTPS redirect, security headers (CSP, HSTS, X-Frame-Options) |
| **Auth** | 2 | API key validation with 5-min cache |
| **Rate Limit** | 3 | Token bucket per client (keyed by API key or IP) |
| **Session** | 4 | Firestore lookup, set bypass_classifier flag |

**Design Decision:** Session middleware runs before classification because the
session bypass is a hard requirement — active sessions must skip classification
entirely for mid-turn consistency.

**Import example:**
```typescript
import { authMiddleware, rateLimiterMiddleware, tlsMiddleware,
         healthCheck, deepHealthCheck, handleRequest } from '@reaatech/agent-mesh-gateway';
```

### Agent Registry

The registry is loaded from YAML files at startup and reloaded on `SIGHUP`.
Implemented in `@reaatech/agent-mesh-registry`.

```
agents/
├── default.yaml      # Default agent (is_default: true)
├── specialist-a.yaml # Specialized agent
├── specialist-b.yaml # Another specialized agent
└── fallback.yaml     # Fallback agent
```

**Loading Process:**
1. Glob all `.yaml`/`.yml` files in registry directory
2. Check file size (reject > 1MB)
3. Expand `${ENV_VAR}` placeholders
4. Parse YAML and validate against `AgentConfigSchema` (Zod)
5. Enforce invariants (one default, unique IDs, valid URLs)
6. Atomic swap — old registry remains active until new one is fully valid

**SIGHUP Handler:**
- Debounced (default 5s) to prevent rapid reloads
- Pending reload tracking during debounce window
- Optional health check post-reload
- Structured logging for alerting systems

**Design Decision:** Atomic swap ensures readers never see partial state. If
validation fails, the old registry remains active — no service disruption.

### Classifier Service

Uses Google Vertex AI Gemini Flash for intent classification.
Implemented in `@reaatech/agent-mesh-classifier`.

```
User Input → Prompt Builder → Gemini Flash → Structured Output
                                   │
                                   ▼
                          Agent Descriptions + Few-Shot Examples
                          (from Registry)
```

**Prompt Structure:**
```
System: You are an intent classifier for a multi-agent system.
        Classify the user's request and select the best agent.

Agents:
  - Agent A: {description from YAML}
    Examples: {examples from YAML}
  - Agent B: {description from YAML}
    Examples: {examples from YAML}
  ...

User: {raw_input}

Output JSON: {agent_id, confidence, ambiguous, detected_language, intent_summary, entities}
```

**Fallback Behavior:**
- Any Gemini error → route to default agent
- Rate limit → exponential backoff with jitter
- Invalid JSON → default agent with `fallback_reason: "json_parse_error"`

**Import example:**
```typescript
import { classifierService } from '@reaatech/agent-mesh-classifier';

const classification = await classifierService.classify(userInput, registryState.registry);
```

**Design Decision:** Gemini Flash is used for speed and cost. The pattern works
with any LLM — swap the classifier implementation, keep the orchestration.

### Confidence Gate

Evaluates classifier output against agent thresholds.
Implemented in `@reaatech/agent-mesh-confidence`.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Confidence Gate                               │
│                                                                      │
│  Input: ClassifierOutput + AgentConfig[] + detectedLanguage          │
│                                                                      │
│  Decision Tree (evaluated in order):                                 │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 1. Unknown agent_id?         → route to default                 ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 2. Is default agent?         → route directly (no threshold)    ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 3. Confidence ≥ threshold AND not ambiguous? → route to agent   ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 4. clarification_required?   → generate clarification question  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 5. Otherwise                 → fall back to default              ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Output: ConfidenceDecision { action, agent_id, clarification_question? }
└─────────────────────────────────────────────────────────────────────┘
```

**Clarification Question Generation:**
- Uses Gemini Flash (same model as classifier)
- Localized to user's detected language
- 58 language fallback questions pre-translated
- LRU cache with 5-minute TTL
- Deferred cache clear on SIGHUP (wait for active requests)

**Import example:**
```typescript
import { evaluateConfidenceGate } from '@reaatech/agent-mesh-confidence';

const decision = evaluateConfidenceGate(classification, registry, bypassClassifier);
```

**Design Decision:** Clarification is generated by Gemini (not templates) because
it produces more natural, context-aware questions. The fallback questions ensure
users always see localized text even if Gemini fails.

### Circuit Breaker

Per-agent circuit breaker prevents cascading failures.
Implemented in `@reaatech/agent-mesh-utils`.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Circuit Breaker States                           │
│                                                                      │
│                    ┌─────────────┐                                  │
│              ┌────▶│   CLOSED    │◀────┐                            │
│              │     │  (healthy)  │     │                            │
│              │     └──────┬──────┘     │                            │
│              │            │            │                            │
│              │     failures >= threshold│ successes >= expected     │
│              │            │            │                            │
│              │            ▼            │                            │
│              │     ┌──────────────┐    │                            │
│              │     │    OPEN      │    │                            │
│              │     │ (unhealthy)  │    │                            │
│              │     └──────┬───────┘    │                            │
│              │            │            │                            │
│              │   reset_timeout * backoff_multiplier                 │
│              │            │            │                            │
│              │            ▼            │                            │
│              │     ┌──────────────┐    │                            │
│              └─────│  HALF_OPEN   │────┘                            │
│                    │  (testing)   │                                 │
│                    └──────────────┘                                 │
│                                                                      │
│  HALF_OPEN rules:                                                    │
│  - Allow N test calls (configurable)                                │
│  - Track completed calls (not just started)                         │
│  - Timeout if not all succeed within window                         │
│  - Exponential backoff on reopen                                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Persistence Architecture:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                    Firestore Persistence                             │
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │ Instance 1  │    │ Instance 2  │    │ Instance 3  │              │
│  │ (Leader)    │    │ (Follower)  │    │ (Follower)  │              │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘              │
│         │                  │                  │                       │
│         │ Leader election via Firestore       │                       │
│         │ (lease-based with fencing tokens)   │                       │
│         │                  │                  │                       │
│         └──────────────────┼──────────────────┘                       │
│                            │                                          │
│                            ▼                                          │
│                   ┌─────────────┐                                    │
│                   │  Firestore  │                                    │
│                   │  (CB State)  │                                    │
│                   └─────────────┘                                    │
│                                                                      │
│  Benefits:                                                           │
│  - Survives Cloud Run restarts                                      │
│  - Cross-instance consistency                                       │
│  - No single point of failure                                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Import example:**
```typescript
import { circuitBreaker } from '@reaatech/agent-mesh-utils';
import { startCircuitBreakerPersistence, stopCircuitBreakerPersistence } from '@reaatech/agent-mesh-utils';
```

**Leader Election:**
- Lease-based approach with periodic renewal
- Fencing tokens prevent network partition issues
- Only leader persists state to Firestore
- Followers maintain in-memory state only

**Design Decision:** Leader election adds complexity but is necessary for
cross-instance consistency without a central coordinator.

### Session Management

Firestore-backed session storage with 30-minute sliding TTL.
Implemented in `@reaatech/agent-mesh-session`.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Session Lifecycle                               │
│                                                                      │
│  1. createSession(user_id, employee_id, ...)                        │
│     → status: 'active', ttl: now + 30m                              │
│                                                                      │
│  2. appendTurn(session_id, turn)                                    │
│     → arrayUnion (transaction), ttl refreshed                       │
│                                                                      │
│  3. updateWorkflowState(session_id, state)                          │
│     → workflow_state replaced (not merged)                          │
│                                                                      │
│  4. closeSession(session_id, status)                                │
│     → status: COMPLETED | ABANDONED | ERROR                         │
│     → ttl field deleted (Firestore TTL policy GCs document)         │
│     → publish to Pub/Sub → BigQuery (for analytics)                 │
│                                                                      │
│  5. resumeSession(prior_session_id)                                 │
│     → new session_id, prior turn_history carried forward            │
│                                                                      │
│  Firestore composite index required:                                │
│  Collection: sessions                                               │
│  Fields:     user_id ASC, status ASC, ttl ASC                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Import example:**
```typescript
import { createSession, getActiveSession, appendTurn,
         closeSession, sessionMiddleware } from '@reaatech/agent-mesh-session';
```

**Session Bypass Middleware:**
```
Request → Session Middleware → Active session found?
                                   │
                          ┌────────┴────────┐
                          │                 │
                         Yes               No
                          │                 │
                          ▼                 ▼
                   bypass_classifier   Run classifier
                   active_agent =      (normal flow)
                   session.active_agent
                          │                 │
                          └────────┬────────┘
                                   ▼
                            Route to agent
```

**Design Decision:** Session bypass is mandatory — mid-turn messages are never
re-classified. This ensures conversational consistency and reduces latency.

### MCP Router

Dispatches requests to agents via MCP StreamableHTTP.
Implemented in `@reaatech/agent-mesh-router`.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MCP Router                                    │
│                                                                      │
│  Input: ContextPacket { session_id, request_id, employee_profile,   │
│                        raw_input, intent, turn_history, ... }       │
│                                                                      │
│  Process:                                                            │
│  1. Build MCP request (handle_message tool call)                    │
│  2. Check circuit breaker (reject if OPEN)                          │
│  3. Create StreamableHTTPClientTransport                            │
│  4. Send request with timeout                                       │
│  5. Validate response against AgentResponseSchema                   │
│  6. Record success/failure for circuit breaker                      │
│  7. Return validated response                                       │
│                                                                      │
│  Output: AgentResponse { content, workflow_complete, workflow_state? }
└─────────────────────────────────────────────────────────────────────┘
```

**Import example:**
```typescript
import { dispatchToAgent, mcpClientFactory } from '@reaatech/agent-mesh-router';

const response = await dispatchToAgent(agent, { sessionId, employeeId, ... });
```

**Timeout Strategy:**
- Default: 30 seconds
- Configurable per-agent via environment variable
- Timeout counts as failure for circuit breaker
- Retry only on transient errors (network, 5xx)

**Design Decision:** Single attempt (no retry) for idempotency. Agents should
handle their own retries for transient failures. The orchestrator retries only
on clearly transient errors (network timeouts, 503s).

### MCP Server Layer

Exposes the orchestrator as an MCP-compliant agent.
Implemented in `@reaatech/agent-mesh-mcp-server`.

Provides JSON-RPC 2.0 routing with three tools:
- `handle_message` — route user messages through the full orchestrator pipeline
- `get_session_status` — query session state by ID
- `list_agents` — enumerate all registered agents

Also provides SSE transport for legacy MCP client compatibility.

**Import example:**
```typescript
import { mcpMiddleware, sseHandler, messageHandler } from '@reaatech/agent-mesh-mcp-server';
```

### Observability Layer

Structured logging, metrics, and audit events.
Implemented in `@reaatech/agent-mesh-observability`.

```typescript
import { logger, createChildLogger } from '@reaatech/agent-mesh-observability';
import { recordAgentDispatchDuration } from '@reaatech/agent-mesh-observability';
import { logAgentRouted, logCircuitBreakerChange } from '@reaatech/agent-mesh-observability';
```

---

## Security Model

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Network                                                     │
│ - HTTPS required in production                                       │
│ - API key validation on all endpoints                                │
│ - Rate limiting per client                                           │
│ - TLS security headers (CSP, HSTS, X-Frame-Options)                  │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2: Input                                                       │
│ - Zod schema validation on all tool inputs                           │
│ - SSRF protection on agent endpoint URLs                             │
│ - Size limits on request bodies                                      │
│ - Prompt-injection sanitization on string inputs                     │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: Processing                                                  │
│ - Tools run with minimal permissions                                 │
│ - Timeouts on all async operations                                   │
│ - Circuit breakers prevent cascading failures                        │
│ - Session isolation (users can't access other sessions)              │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 4: Output                                                      │
│ - PII redaction in logs                                              │
│ - Structured error responses (no stack traces to clients)            │
│ - Audit logging for compliance-critical events                       │
└─────────────────────────────────────────────────────────────────────┘
```

### SSRF Protection

Agent endpoint URLs are validated to reject:
- `localhost` and `::1`
- Private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Link-local (169.254.0.0/16)
- Loopback (127.0.0.0/8)

This validation runs regardless of environment (dev or prod) to catch
misconfigurations early.

---

## Build & Toolchain

### Build Pipeline

```
pnpm install       → pnpm build (turbo run build)
                         │
                 ┌───────┴────────┐
                 │  tsup per-pkg  │
                 │  CJS + ESM +   │
                 │  DTS output    │
                 └───────┬────────┘
                         │
               packages/*/dist/
               ├── index.js     (ESM)
               ├── index.cjs    (CJS)
               ├── index.d.ts   (types ESM)
               └── index.d.cts  (types CJS)
```

### Type Checking

Root `tsconfig.typecheck.json` provides path aliases for cross-package type
resolution without requiring a full build:

```bash
pnpm typecheck    # tsc --noEmit -p tsconfig.typecheck.json
```

### Quality Gates

```bash
pnpm lint         # biome check .
pnpm format       # biome format --write .
pnpm typecheck    # tsc --noEmit -p tsconfig.typecheck.json
pnpm test         # turbo run test (vitest)
```

---

## Deployment Architecture

### GCP Cloud Run

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Cloud Run Service                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Orchestrator Container                     │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                │    │
│  │  │ App       │  │ OTel      │  │ Secrets   │                │    │
│  │  │ Container │  │ Sidecar   │  │ Mounted   │                │    │
│  │  └───────────┘  └───────────┘  └───────────┘                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Config:                                                             │
│  - Min instances: 0 (scale to zero)                                 │
│  - Max instances: 10 (configurable)                                 │
│  - Memory: 512MB, CPU: 1 vCPU                                       │
│  - Timeout: 60s (configurable)                                      │
│                                                                      │
│  Secrets: Secret Manager → mounted as env vars                       │
│  Observability: OTel → Cloud Monitoring / Datadog                    │
│  Session Store: Firestore (external)                                 │
│  Circuit Breaker: Firestore (external, leader-elected)              │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Client sends HTTP request
        │
2. Gateway middleware:
   - TLS check
   - Auth validation
   - Rate limit check
   - Session lookup
        │
3. If active session → bypass classifier, route to session's agent
   Else → continue to classification
        │
4. Classifier (Gemini Flash):
   - Build prompt with agent descriptions
   - Call Gemini API
   - Parse structured output
        │
5. Confidence Gate:
   - Evaluate decision tree
   - Generate clarification if needed
        │
6. Router:
   - Check circuit breaker
   - Build MCP request
   - Call agent via StreamableHTTP
   - Validate response
   - Record success/failure
        │
7. Session update:
   - Append turn to history
   - Update workflow state
   - Refresh TTL
        │
8. Response sent to client
        │
9. Observability:
   - Trace span closed
   - Metrics recorded
   - Structured log written
```

---

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Agent throws unhandled error | MCP protocol error | Return structured error, record circuit breaker failure |
| Agent timeout | Request timeout | Record failure, retry only on transient errors |
| Circuit breaker OPEN | State check | Reject immediately with 503, retry after reset timeout |
| Classifier API error | Gemini API failure | Fall back to default agent, log error |
| Firestore unavailable | Connection error | Retry with exponential backoff, fail open for read operations |
| Registry reload fails | Validation error | Keep old registry, log error at ERROR level for alerting |
| Session lookup timeout | Firestore timeout | Continue without session (no bypass), log warning |
| Rate limit exceeded | Token bucket empty | Return 429 with `Retry-After` header |

---

## Observability

### Tracing

Every request generates an OpenTelemetry trace with spans for:
- `gateway.auth` — API key validation
- `gateway.rate_limit` — Rate limit check
- `session.lookup` — Firestore session lookup
- `classifier.classify` — Gemini API call
- `confidence.evaluate` — Confidence gate evaluation
- `router.dispatch` — Agent dispatch
- `circuit_breaker.check` — Circuit breaker state check

### Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `orchestrator.requests.total` | Counter | `status`, `agent_id` | Total requests |
| `orchestrator.requests.duration_ms` | Histogram | `component` | Request latency |
| `session.lookup.duration_ms` | Histogram | `hit` | Session lookup latency |
| `classifier.calls.total` | Counter | `status` | Classifier API calls |
| `classifier.calls.duration_ms` | Histogram | — | Classifier latency |
| `confidence.clarification.count` | Counter | `agent_id` | Clarification questions |
| `circuit_breaker.state` | Gauge | `agent_id` | Circuit breaker state |
| `agent.dispatch.total` | Counter | `agent_id`, `status` | Agent dispatch results |
| `agent.dispatch.duration_ms` | Histogram | `agent_id` | Agent response latency |

### Logging

All logs are structured JSON with these standard fields:
- `timestamp` — ISO-8601
- `service` — "agent-mesh"
- `request_id` — Unique request identifier
- `session_id` — Session identifier (if applicable)
- `level` — Log level (debug, info, warn, error)
- `message` — Human-readable message
- Additional context fields as needed

PII is automatically redacted from all log fields.

---

## References

- **AGENTS.md** — Agent development guide
- **README.md** — Quick start and overview
- **MCP Specification** — https://modelcontextprotocol.io/
