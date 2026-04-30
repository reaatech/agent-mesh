# @reaatech/agent-mesh-utils

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-mesh-utils.svg)](https://www.npmjs.com/package/@reaatech/agent-mesh-utils)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-mesh/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Per-agent circuit breaker implementation with Firestore persistence and cross-instance leader election. Prevents cascading failures by isolating unhealthy agents and provides distributed state synchronization across Cloud Run instances.

## Installation

```bash
npm install @reaatech/agent-mesh-utils
# or
pnpm add @reaatech/agent-mesh-utils
```

## Feature Overview

- **Three-state circuit breaker** — CLOSED (normal), OPEN (reject requests), HALF_OPEN (probing recovery)
- **Exponential backoff** — backoff multiplier doubles on each OPEN transition, up to 32×
- **Leader-elected persistence** — Firestore-based leader election ensures single-writer sync across instances
- **Automatic state restoration** — persisted circuit state survives Cloud Run restarts
- **Configurable thresholds** — failure count, reset timeout, half-open max calls — all environment-configurable

## Quick Start

```typescript
import { circuitBreaker } from "@reaatech/agent-mesh-utils";

// Check if an agent can receive traffic
if (circuitBreaker.canCall("serval")) {
  await dispatchToAgent(servalAgent);
}

// Record success or failure after dispatch
try {
  await mcpClient.sendMessage(context);
  circuitBreaker.recordSuccess("serval");
} catch (error) {
  circuitBreaker.recordFailure("serval");
}
```

## API Reference

### Circuit Breaker

#### `circuitBreaker` (singleton)

The global `CircuitBreaker` instance. All methods are synchronous and thread-safe.

| Method | Description |
|--------|-------------|
| `getState(agentId)` | Returns the current `CircuitBreakerState`, auto-transitioning if timeouts have elapsed |
| `canCall(agentId)` | Returns `true` if the circuit is CLOSED or HALF_OPEN with available slots |
| `recordSuccess(agentId)` | Records a successful call; closes the circuit if HALF_OPEN with enough successes |
| `recordFailure(agentId)` | Records a failure; opens the circuit if threshold reached |
| `forceState(agentId, newState)` | Forces the circuit to a specific state (testing/admin) |
| `getAllStates()` | Returns a snapshot of all circuit states |
| `setState(state)` | Sets a single circuit state (used for restoring from persistence) |
| `setStates(states)` | Sets multiple circuit states at once |
| `clear()` | Clears all circuit states (testing) |

#### Circuit States

| State | Behavior |
|-------|----------|
| `CLOSED` | Normal operation — requests pass through |
| `OPEN` | Failures >= threshold — requests rejected, auto-transitions to HALF_OPEN after `RESET_TIMEOUT_MS * backoff_multiplier` |
| `HALF_OPEN` | Testing recovery — limited test calls allowed, reverts to OPEN if any fail |

### Persistence Layer

#### `startCircuitBreakerPersistence(): Promise<void>`

Initializes leader election, restores states from Firestore, and starts periodic sync (leader only).

```typescript
import { startCircuitBreakerPersistence, stopCircuitBreakerPersistence } from "@reaatech/agent-mesh-utils";

await startCircuitBreakerPersistence();

// On shutdown
stopCircuitBreakerPersistence();
```

#### `stopCircuitBreakerPersistence(): void`

Stops the sync interval and cleans up.

#### `isLeader(): boolean`

Returns `true` if this instance currently holds the leader lease.

#### `getLeaderId(): string | null`

Returns the current leader's instance ID.

#### `restoreCircuitBreakerStates(maxRetries?): Promise<void>`

Loads all circuit breaker states from Firestore with exponential-backoff retries.

#### `updateCircuitBreakerState(state): Promise<void>`

Updates local state and persists to Firestore.

#### `getLocalCircuitBreakerState(agentId)`

Returns the local circuit state for a given agent (no Firestore read).

## Configuration

All thresholds are configured via environment variables (validated by `@reaatech/agent-mesh`):

| Variable | Default | Description |
|----------|---------|-------------|
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | `5` | Failures before opening circuit |
| `CIRCUIT_BREAKER_RESET_TIMEOUT_MS` | `30000` | Time before attempting recovery |
| `CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS` | `3` | Test calls allowed in HALF_OPEN |
| `CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS` | `60000` | Max time in HALF_OPEN before reverting to OPEN |
| `CB_SYNC_INTERVAL_MS` | `5000` | Leader sync interval |
| `CB_LEADER_LEASE_MS` | `15000` | Leader lease duration |

## Usage Patterns

### With the Router

```typescript
import { circuitBreaker } from "@reaatech/agent-mesh-utils";
import { env } from "@reaatech/agent-mesh";

async function dispatchToAgent(agent: AgentConfig) {
  if (env.ENABLE_CIRCUIT_BREAKER && !circuitBreaker.canCall(agent.agent_id)) {
    throw new Error(`Circuit breaker OPEN for agent ${agent.agent_id}`);
  }

  try {
    const response = await mcpClient.sendMessage(context);
    circuitBreaker.recordSuccess(agent.agent_id);
    return response;
  } catch (error) {
    circuitBreaker.recordFailure(agent.agent_id);
    throw error;
  }
}
```

### Admin Operations

```typescript
// Force-close a circuit (e.g., after fixing a downstream agent)
circuitBreaker.forceState("serval", "CLOSED");

// Inspect all circuits
for (const [agentId, state] of circuitBreaker.getAllStates()) {
  console.log(`${agentId}: ${state.state} (failures: ${state.failure_count})`);
}
```

## Related Packages

- [`@reaatech/agent-mesh`](https://www.npmjs.com/package/@reaatech/agent-mesh) — Core types (CircuitBreakerState, CircuitState)
- [`@reaatech/agent-mesh-session`](https://www.npmjs.com/package/@reaatech/agent-mesh-session) — Firestore client (used by persistence layer)
- [`@reaatech/agent-mesh-router`](https://www.npmjs.com/package/@reaatech/agent-mesh-router) — MCP dispatch (uses circuit breaker for health gating)

## License

[MIT](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
