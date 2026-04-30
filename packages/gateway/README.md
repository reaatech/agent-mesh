# @reaatech/agent-mesh-gateway

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-mesh-gateway.svg)](https://www.npmjs.com/package/@reaatech/agent-mesh-gateway)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
[![CI](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

HTTP gateway for the agent-mesh orchestrator. Provides the main `/v1/request` entry point with full request orchestration, Express middleware pipeline (authentication, rate limiting, TLS enforcement), health check endpoints, and Slack profile resolution.

## Installation

```bash
npm install @reaatech/agent-mesh-gateway
# or
pnpm add @reaatech/agent-mesh-gateway
```

## Feature Overview

- **Request orchestration** — `/v1/request` endpoint with full pipeline: validation → identity resolution → session lookup → classification → confidence gate → agent dispatch → response
- **API key authentication** — Secret Manager-backed key validation with in-memory caching and dev-mode bypass
- **Token bucket rate limiting** — per-client (key or IP) with configurable windows, endpoint-specific overrides, and standard rate-limit headers
- **TLS enforcement** — HTTPS redirect in production, HSTS headers (1-year max-age), and security headers (CSP, X-Frame-Options, X-Content-Type-Options)
- **Health check endpoints** — `/health` (liveness) and `/health/deep` (readiness with registry and Firestore checks)
- **Slack profile resolution** — resolve Slack user IDs to employee profiles with 10-minute cache TTL
- **Internal API** — `handleInternalRequest()` for programmatic invocation from the MCP server

## Quick Start

```typescript
import express from "express";
import { authMiddleware, rateLimiterMiddleware, tlsMiddleware, healthCheck, deepHealthCheck, handleRequest } from "@reaatech/agent-mesh-gateway";

const app = express();
app.set("trust proxy", 1);
app.use(tlsMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(rateLimiterMiddleware);

app.get("/health", healthCheck);
app.get("/health/deep", deepHealthCheck);
app.post("/v1/request", authMiddleware, handleRequest);

app.listen(8080);
```

## API Reference

### Request Handler

#### `handleRequest(req, res): Promise<void>`

The main Express handler for `POST /v1/request`. Validates the request body against `IncomingRequestSchema`, resolves identity (Slack profile or inline), looks up active sessions with bypass support, runs classification and confidence gating, dispatches to the matched agent, manages session lifecycle (create, append turns, close), and returns a structured response.

**Response shape:**
```typescript
{
  request_id: string;
  session_id: string;
  agent_id: string;
  response: string;           // Agent's human-readable content
  workflow_complete: boolean;
  classification: {
    intent: string;
    confidence: number;
    language: string;
  };
  routing: {
    action: "route" | "clarify" | "fallback";
    reason: string;
  };
  duration_ms: number;
}
```

**Clarification response (when action is `clarify`):**
```typescript
{
  request_id: string;
  session_id: string;
  action: "clarification";
  clarification_question: string;
  suggested_agent: string;
  reason: string;
  duration_ms: number;
}
```

#### `handleInternalRequest(payload): Promise<{ status: number; body: Record<string, unknown> }>`

Programmatic invocation point used by the MCP server. Accepts the same payload as the HTTP endpoint.

### Health Checks

#### `healthCheck(req, res): void`

Liveness probe. Returns `{ status: "healthy", service, version, timestamp }`. Always returns 200.

#### `deepHealthCheck(req, res): Promise<void>`

Readiness probe. Checks registry state and Firestore connectivity. Returns 503 if any check fails.

```json
{
  "status": "healthy",
  "checks": {
    "registry": { "status": "pass", "message": "3 agents loaded" },
    "firestore": { "status": "pass", "message": "Firestore reachable" }
  },
  "agents": ["default", "glean", "serval"],
  "defaultAgent": "default"
}
```

### Authentication Middleware

#### `authMiddleware`

Validates the `x-api-key` header against the configured API key (from `API_KEY` env var or Secret Manager). Supports a development bypass when `NODE_ENV=development` and `API_KEY=dev-key`.

```typescript
app.post("/v1/request", authMiddleware, handleRequest);
```

#### `clearAuthCache(): void`

Clears the in-memory key validation cache (for testing).

### Rate Limiting Middleware

#### `rateLimiterMiddleware`

Token bucket rate limiter keyed by API key (preferred) or client IP. Sets standard headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.

```typescript
app.use(rateLimiterMiddleware); // Applied globally or per-route
```

#### `clearRateLimitBuckets(): void`

Clears all rate-limit buckets (for testing).

#### `getBucketState(clientId): TokenBucket | undefined`

Returns the current token bucket state for debugging.

### TLS Middleware

#### `tlsMiddleware`

Combined middleware that applies HTTPS redirect (production only), HSTS header, and security headers.

Individual middleware also exported:

| Export | Description |
|--------|-------------|
| `httpsRedirectMiddleware` | Redirects HTTP to HTTPS (production only, skips `/health`) |
| `hstsMiddleware` | Sets `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` |
| `securityHeadersMiddleware` | Sets `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `CSP`, `Referrer-Policy`, `Permissions-Policy` |

### Slack Profile Resolver

#### `resolveSlackProfile(slackUserId): Promise<EmployeeProfile>`

Fetches a Slack user's profile via the `users.profile.get` API and extracts `employee_id`, `display_name`, `email`, `title`, and `department`. Results are cached for 10 minutes.

```typescript
import { resolveSlackProfile } from "@reaatech/agent-mesh-gateway";

const profile = await resolveSlackProfile("U12345678");
// → { employee_id: "emp-123", display_name: "John Doe", email: "john@company.com", title: "Engineer" }
```

#### `resolveSlackProfileNoCache(slackUserId): Promise<EmployeeProfile>`

Bypasses the cache for a fresh fetch.

#### `preloadProfiles(userIds: string[]): Promise<Map<string, EmployeeProfile>>`

Batch preloads profiles for multiple users.

#### `clearProfileCache(): void`

Clears the profile cache (for testing).

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY` | (required) | API key for authentication |
| `API_KEY_SECRET_NAME` | — | Secret Manager secret name (overrides `API_KEY`) |
| `SLACK_BOT_TOKEN` | — | Slack bot token for profile resolution |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |

## Usage Patterns

### Minimal Server Setup

```typescript
import express from "express";
import { authMiddleware, tlsMiddleware, healthCheck, handleRequest } from "@reaatech/agent-mesh-gateway";

const app = express();
app.set("trust proxy", 1);
app.use(tlsMiddleware);
app.use(express.json());

app.get("/health", healthCheck);
app.post("/v1/request", authMiddleware, handleRequest);

app.listen(8080);
```

### Internal (Programmatic) Invocation

```typescript
import { handleInternalRequest } from "@reaatech/agent-mesh-gateway";

const result = await handleInternalRequest({
  input: "Reset my password",
  employee_id: "emp-123",
  user_id: "user-456",
  session_id: "550e8400-...",
});
```

## Related Packages

- [`@reaatech/agent-mesh`](https://www.npmjs.com/package/@reaatech/agent-mesh) — Core types (IncomingRequestSchema, constants)
- [`@reaatech/agent-mesh-session`](https://www.npmjs.com/package/@reaatech/agent-mesh-session) — Session management (used in the request pipeline)
- [`@reaatech/agent-mesh-classifier`](https://www.npmjs.com/package/@reaatech/agent-mesh-classifier) — Intent classification
- [`@reaatech/agent-mesh-confidence`](https://www.npmjs.com/package/@reaatech/agent-mesh-confidence) — Confidence gate
- [`@reaatech/agent-mesh-router`](https://www.npmjs.com/package/@reaatech/agent-mesh-router) — Agent dispatch

## License

[MIT](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
