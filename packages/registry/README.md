# @reaatech/agent-mesh-registry

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-mesh-registry.svg)](https://www.npmjs.com/package/@reaatech/agent-mesh-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-mesh/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Agent registry loader with atomic-swap semantics and SIGHUP hot-reload. Parses YAML agent configurations, validates them against Zod schemas with SSRF protection, and manages a thread-safe registry singleton with debounced signal-based updates.

## Installation

```bash
npm install @reaatech/agent-mesh-registry
# or
pnpm add @reaatech/agent-mesh-registry
```

## Feature Overview

- **YAML agent configuration** — load agent definitions from a directory of YAML files with `${ENV_VAR}` expansion
- **SSRF-safe URL validation** — rejects localhost, private IPs (10.x, 172.16.x, 192.168.x), link-local addresses, and IPv6 loopbacks
- **Atomic-swap semantics** — readers always get a consistent snapshot; failed reloads leave the old registry intact
- **SIGHUP hot-reload** — debounced signal handler (5s default) with coalescing for rapid signals
- **Cross-agent invariant enforcement** — exactly one default agent, unique IDs, default threshold must be 0
- **File size limits** — YAML files exceeding 1MB are skipped with errors

## Quick Start

```typescript
import { initRegistry, registryState } from "@reaatech/agent-mesh-registry";

// Load the registry at startup
await initRegistry();

// Access the loaded registry
console.log(`${registryState.getAgentIds().length} agents loaded`);
console.log(`Default agent: ${registryState.defaultAgent?.agent_id}`);

// Look up a specific agent
const agent = registryState.getAgent("serval");
```

## API Reference

### Registry State

#### `registryState` (singleton)

The global `RegistryState` instance with atomic-swap semantics.

| Property / Method | Description |
|-------------------|-------------|
| `registry` | The current agent registry array (or `null` if not loaded) |
| `defaultAgent` | The agent with `is_default: true` (or `null`) |
| `isLoaded` | `true` if the registry has been successfully loaded |
| `loadError` | The last load error (or `null`) |
| `lastLoadTime` | Timestamp of the last successful load |
| `getAgent(agentId)` | Look up an agent by ID |
| `getAgentIds()` | Return all registered agent IDs |

### Loading

#### `initRegistry(): Promise<void>`

Loads the registry at startup. Throws on failure — fail-fast behavior.

#### `loadRegistry(): Promise<AgentRegistry>`

Loads and validates all YAML files from the configured directory. Returns a validated array of `AgentConfig` objects.

#### `reloadRegistry(): Promise<RegistryLoadResult>`

Loads and atomically swaps the registry. Returns a result object with success status, agent count, and errors. On failure, the old registry remains active — no downtime.

### SIGHUP Handler

#### `setupSighupHandler(debounceMs?): void`

Registers a debounced SIGHUP handler that calls `reloadRegistry()`. Multiple signals within the debounce window (default 5s) coalesce into a single reload.

```typescript
import { setupSighupHandler } from "@reaatech/agent-mesh-registry";

setupSighupHandler(); // Default 5s debounce
// or
setupSighupHandler(10000); // Custom 10s debounce
```

#### `triggerReload(): Promise<void>`

Triggers an immediate reload, bypassing the debounce. Useful for programmatic reloads or testing.

#### `isReloadPending(): boolean`

Returns `true` if a SIGHUP-triggered reload is pending (waiting for debounce).

#### `cleanupSighupHandler(): void`

Removes the SIGHUP listener and cancels any pending reloads.

### Agent Configuration Schema

#### `AgentConfigSchema` (Zod)

| Field | Type | Description |
|-------|------|-------------|
| `agent_id` | `string` | Unique lowercase identifier with hyphens |
| `display_name` | `string` | Human-readable name |
| `description` | `string` | Injected into the classifier prompt |
| `endpoint` | `string` (SSRF-safe URL) | MCP server endpoint |
| `type` | `"mcp"` | Always `"mcp"` |
| `is_default` | `boolean` | Exactly one agent must be `true` |
| `confidence_threshold` | `number` (0–1) | Default must be `0` |
| `clarification_required` | `boolean` | Whether to ask clarifying questions |
| `clarification_context` | `string?` | Shown when clarification is needed |
| `examples` | `string[]` | Few-shot examples for the classifier |

## Agent YAML Format

Create files in the registry directory (default `./agents/`):

```yaml
agent_id: "my-agent"
display_name: "My Agent"
description: "Handles specific domain tasks"
endpoint: "${MY_AGENT_ENDPOINT:-http://localhost:8081}"
type: mcp
is_default: false
confidence_threshold: 0.7
clarification_required: false
examples:
  - "Example query 1"
  - "Example query 2"
```

Environment variables in `${VAR}` and `${VAR:-default}` syntax are expanded at load time.

## Usage Patterns

### At Startup

```typescript
import { initRegistry, setupSighupHandler } from "@reaatech/agent-mesh-registry";

// Fail-fast: exit if registry can't load
await initRegistry();

// Register hot-reload handler
setupSighupHandler();
```

### In Request Handlers

```typescript
import { registryState } from "@reaatech/agent-mesh-registry";

function routeRequest(classification: ClassifierOutput) {
  const agent = registryState.getAgent(classification.agent_id);
  if (!agent) {
    // Fall back to default
    return registryState.defaultAgent;
  }
  return agent;
}
```

### Programmatic Reload

```typescript
import { triggerReload } from "@reaatech/agent-mesh-registry";

// Admin endpoint to reload agents
app.post("/admin/reload-registry", async (req, res) => {
  await triggerReload();
  res.json({ success: true, agents: registryState.getAgentIds() });
});
```

## Related Packages

- [`@reaatech/agent-mesh`](https://www.npmjs.com/package/@reaatech/agent-mesh) — Core types (AgentConfig, constants like PRIVATE_IP_RANGES)
- [`@reaatech/agent-mesh-classifier`](https://www.npmjs.com/package/@reaatech/agent-mesh-classifier) — Consumes the registry for agent-aware classification
- [`@reaatech/agent-mesh-gateway`](https://www.npmjs.com/package/@reaatech/agent-mesh-gateway) — Uses registry state for health checks and routing

## License

[MIT](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
