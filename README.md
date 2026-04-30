# agent-mesh

[![CI](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)

> Production-ready multi-agent orchestrator implementing MCP-based agent routing with confidence-gated dispatch, per-agent circuit breakers, and Firestore-backed session management.

This monorepo provides the full orchestrator stack for building multi-agent AI systems: canonical types, intent classification, confidence-gated routing, agent dispatch via the Model Context Protocol, session lifecycle management, and supporting observability infrastructure.

## Features

- **Confidence-gated routing** — Gemini Flash intent classification with a 5-rule decision tree (route / clarify / fallback) and per-agent confidence thresholds
- **MCP agent dispatch** — StreamableHTTP transport with connection pooling, retries, and Zod-validated responses
- **Per-agent circuit breakers** — Three-state (CLOSED/OPEN/HALF_OPEN) with exponential backoff, Firestore persistence, and cross-instance leader election
- **Session management** — Firestore-backed multi-turn sessions with sliding TTL, turn history, workflow state passthrough, and classification bypass
- **Hot-reload agent registry** — YAML-based agent configuration with `${ENV_VAR}` expansion, SIGHUP reload, SSRF-safe URL validation, and cross-agent invariant enforcement
- **Express gateway** — API key authentication (Secret Manager-backed), token bucket rate limiting, TLS enforcement with HSTS, and Slack profile resolution
- **MCP server interface** — Exposes the orchestrator as an MCP-compliant agent with JSON-RPC 2.0 routing, tool registration, and SSE transport
- **Observability** — Winston structured logging with PII redaction, OpenTelemetry tracing and metrics, and audit event logging for compliance

## Installation

### Using the packages

Packages are published under the `@reaatech` scope and can be installed individually:

```bash
# Core types, schemas, and configuration
pnpm add @reaatech/agent-mesh

# Agent registry loader with SIGHUP hot-reload
pnpm add @reaatech/agent-mesh-registry

# Firestore session management
pnpm add @reaatech/agent-mesh-session

# Gemini intent classifier
pnpm add @reaatech/agent-mesh-classifier

# Confidence-gated routing
pnpm add @reaatech/agent-mesh-confidence

# MCP agent dispatch
pnpm add @reaatech/agent-mesh-router

# Express gateway (auth, rate limiting, TLS)
pnpm add @reaatech/agent-mesh-gateway

# MCP server interface
pnpm add @reaatech/agent-mesh-mcp-server

# Circuit breaker with persistence
pnpm add @reaatech/agent-mesh-utils

# Observability (logging, metrics, tracing)
pnpm add @reaatech/agent-mesh-observability
```

### Contributing

```bash
# Clone the repository
git clone https://github.com/reaatech/agent-mesh.git
cd agent-mesh

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the test suite
pnpm test

# Run linting
pnpm lint
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/reaatech/agent-mesh.git && cd agent-mesh
pnpm install && pnpm build

# Configure environment
cp .env.example .env
# Edit .env with your GOOGLE_CLOUD_PROJECT and API_KEY

# Register agents (YAML files in ./agents/)
# agents/ already contains default.yaml, glean.yaml, and serval.yaml

# Start the orchestrator
pnpm --filter @reaatech/agent-mesh-orchestrator build
node examples/orchestrator/dist/index.js

# Or use the root dev command
pnpm build
GOOGLE_CLOUD_PROJECT=my-project API_KEY=dev-key node examples/orchestrator/dist/index.js
```

```bash
# Health check
curl http://localhost:8080/health

# Send a request
curl -X POST http://localhost:8080/v1/request \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"input": "Reset my password", "employee_id": "emp123"}'
```

See the [`examples/orchestrator/`](./examples/orchestrator/) directory for the complete reference deployment.

## Packages

| Package | Description |
| ------- | ----------- |
| [`@reaatech/agent-mesh`](./packages/core) | Core domain types, Zod schemas, environment config, and shared constants |
| [`@reaatech/agent-mesh-registry`](./packages/registry) | Agent YAML loader, SIGHUP hot-reload, SSRF-safe URL validation |
| [`@reaatech/agent-mesh-session`](./packages/session) | Firestore-backed multi-turn session management |
| [`@reaatech/agent-mesh-classifier`](./packages/classifier) | Gemini Flash intent classification with mock fallback |
| [`@reaatech/agent-mesh-confidence`](./packages/confidence) | Confidence-gated routing decision tree and clarification cache |
| [`@reaatech/agent-mesh-router`](./packages/router) | MCP-based agent dispatch with connection pooling |
| [`@reaatech/agent-mesh-gateway`](./packages/gateway) | Express middleware (auth, rate limiting, TLS) and request handler |
| [`@reaatech/agent-mesh-mcp-server`](./packages/mcp-server) | MCP server exposing orchestrator with JSON-RPC 2.0 and SSE transport |
| [`@reaatech/agent-mesh-utils`](./packages/utils) | Per-agent circuit breaker with Firestore persistence and leader election |
| [`@reaatech/agent-mesh-observability`](./packages/observability) | Structured logging, OpenTelemetry tracing/metrics, and audit events |

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System design, data flows, and component relationships
- [`AGENTS.md`](./AGENTS.md) — Agent development guide with MCP protocol contract and skill system
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Contribution workflow and code standards

## License

[MIT](LICENSE)
