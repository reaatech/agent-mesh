# @reaatech/agent-mesh-session

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-mesh-session.svg)](https://www.npmjs.com/package/@reaatech/agent-mesh-session)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
[![CI](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Firestore-backed session management for the agent-mesh orchestrator. Manages multi-turn conversation state with sliding TTL, turn history, workflow state passthrough, session bypass middleware, and Pub/Sub event publishing.

## Installation

```bash
npm install @reaatech/agent-mesh-session
# or
pnpm add @reaatech/agent-mesh-session
```

## Feature Overview

- **Firestore persistence** — sessions stored in Firestore with sliding TTL and automatic garbage collection
- **Multi-turn state** — full turn history (`role`, `content`, `timestamp`, `intent_summary`) with configurable max turns
- **Workflow state passthrough** — orchestrator-agnostic key-value bag for agent-managed context
- **Session bypass middleware** — Express middleware that detects active sessions and sets bypass metadata
- **Pub/Sub events** — best-effort session lifecycle events published to `session-events` topic
- **Session resumption** — carry forward history and workflow state into a new session
- **Transactional turn append** — Firestore transactions ensure history integrity

## Quick Start

```typescript
import {
  createSession,
  getActiveSession,
  appendTurn,
  closeSession,
} from "@reaatech/agent-mesh-session";

// Create a new session
const session = await createSession({
  userId: "user-123",
  employeeId: "emp-456",
  activeAgent: "serval",
});

// Append a user turn
await appendTurn(session.session_id, {
  role: "user",
  content: "Reset my password",
  timestamp: new Date().toISOString(),
});

// Append an agent turn
await appendTurn(session.session_id, {
  role: "agent",
  content: "I've reset your password. Check your email.",
  timestamp: new Date().toISOString(),
});

// Close the session when done
await closeSession(session.session_id, "completed");
```

## API Reference

### Session Lifecycle

#### `createSession(data): Promise<SessionRecord>`

Creates a new Firestore session document with a generated UUID and TTL set to `SESSION_TTL_MINUTES` from now.

```typescript
const session = await createSession({
  userId: string;
  employeeId: string;
  activeAgent: string;
});
```

#### `getActiveSession(userId: string): Promise<SessionRecord | null>`

Queries Firestore for an active session belonging to a user where `status === "active"` and `ttl > now()`. Returns `null` if no active session exists.

#### `getSessionById(sessionId: string): Promise<SessionRecord | null>`

Direct Firestore document lookup by session ID.

#### `closeSession(sessionId, status): Promise<void>`

Transitions a session to a terminal status (`completed`, `abandoned`, `error`) and deletes the TTL field (enabling Firestore TTL policy GC). Publishes a best-effort `session.closed` event to Pub/Sub.

#### `resumeSession(priorSessionId): Promise<SessionRecord | null>`

Creates a new session with carried-forward turn history and workflow state from a prior session, then closes the prior session.

### Turn Management

#### `appendTurn(sessionId, turn): Promise<void>`

Appends a turn entry to the session's history using a Firestore transaction. The history is capped at `SESSION_MAX_TURNS` entries. The session TTL is refreshed on each append.

```typescript
await appendTurn(sessionId, {
  role: "user",
  content: "What's my VPN status?",
  timestamp: new Date().toISOString(),
  intent_summary: "VPN status inquiry",
});
```

#### `updateWorkflowState(sessionId, workflowState): Promise<void>`

Updates the workflow state bag for a session. The orchestrator passes this through to the agent on subsequent turns without interpreting it.

### Firestore Client

#### `getFirestore(): Firestore`

Returns the singleton Firestore client instance (lazy initialized). Configured with `GOOGLE_CLOUD_PROJECT` and `FIRESTORE_DATABASE` from the environment.

#### `resetFirestore(): void`

Resets the Firestore client singleton (for testing).

### Session Middleware

#### `sessionMiddleware`

Express middleware that looks up active sessions for incoming requests. When an active session is found, it sets `req.sessionContext` with:

```typescript
interface SessionContext {
  sessionId: string;
  activeAgent: string;
  bypassClassifier: boolean;  // true when session bypass is active
  turnHistory: TurnEntry[];
  workflowState: Record<string, unknown>;
}
```

```typescript
import { sessionMiddleware } from "@reaatech/agent-mesh-session";

app.use(sessionMiddleware);
```

## Session Record Shape

```typescript
interface SessionRecord {
  session_id: string;         // UUID
  user_id: string;
  employee_id: string;
  status: SessionStatus;      // "active" | "completed" | "abandoned" | "error"
  active_agent: string;
  turn_history: TurnEntry[];  // Capped at SESSION_MAX_TURNS
  workflow_state: Record<string, unknown>;
  created_at: string;         // ISO 8601
  updated_at: string;         // ISO 8601
  ttl: Date;                  // Firestore TTL field
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_TTL_MINUTES` | `30` | Session time-to-live in minutes (sliding) |
| `SESSION_MAX_TURNS` | `100` | Maximum turns retained in history |
| `ENABLE_SESSION_BYPASS` | `true` | Whether to skip classification for active sessions |

## Usage Patterns

### Full Request Pipeline

```typescript
import { getActiveSession, createSession, appendTurn, closeSession } from "@reaatech/agent-mesh-session";

async function handleRequest(input: string, userId: string) {
  let session = await getActiveSession(userId);
  let isNewSession = false;

  if (!session) {
    session = await createSession({
      userId,
      employeeId: userId,
      activeAgent: "default",
    });
    isNewSession = true;
  }

  await appendTurn(session.session_id, {
    role: "user",
    content: input,
    timestamp: new Date().toISOString(),
  });

  const response = await classifyAndRoute(input, session);

  await appendTurn(session.session_id, {
    role: "agent",
    content: response,
    timestamp: new Date().toISOString(),
  });

  if (response.workflow_complete) {
    await closeSession(session.session_id, "completed");
  }
}
```

## Related Packages

- [`@reaatech/agent-mesh`](https://www.npmjs.com/package/@reaatech/agent-mesh) — Core types (SessionRecord, TurnEntry, constants)
- [`@reaatech/agent-mesh-gateway`](https://www.npmjs.com/package/@reaatech/agent-mesh-gateway) — Entry handler (uses session service for the full pipeline)

## License

[MIT](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
