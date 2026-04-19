# agent-mesh

**Reference multi-agent orchestrator** implementing MCP-based agent routing with confidence-gated dispatch, per-agent circuit breakers, and session-bypass middleware.

## Overview

agent-mesh is a production-ready orchestrator for building multi-agent AI systems. It routes user requests to specialized agents based on intent classification, with built-in resilience patterns and observability.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   AI Client     │────▶│  Orchestrator    │────▶│  Agent Registry │
│  (Claude, etc)  │     │  (agent-mesh)    │     │  (YAML configs) │
└─────────────────┘     │                  │     └─────────────────┘
                        │  ┌────────────┐  │              │
                        │  │ Classifier │  │              ▼
                        │  │ (Gemini)   │  │     ┌─────────────────┐
                        │  └────────────┘  │     │  Agent Pool     │
                        │  ┌────────────┐  │     │  (MCP servers)  │
                        │  │ Confidence │  │     └─────────────────┘
                        │  │ Gate       │  │
                        │  └────────────┘  │
                        │  ┌────────────┐  │
                        │  │ Circuit    │  │
                        │  │ Breaker    │  │
                        │  └────────────┘  │
                        └──────────────────┘
```

## Features

- **YAML Agent Registry** — Hot-reload agent configs via SIGHUP, no restart needed
- **Confidence-Gated Routing** — Gemini-powered intent classification with clarification fallback
- **Per-Agent Circuit Breakers** — Prevents cascading failures with persisted state
- **Session Bypass** — Active sessions skip classification for mid-turn consistency
- **MCP Protocol** — Standard Model Context Protocol for agent communication
- **SSRF Protection** — Endpoint URL validation rejects private IPs
- **Observability** — OpenTelemetry tracing, metrics, and structured logging

## Quick Start

### Prerequisites

- Node.js 22+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/reaatech/agent-mesh.git
cd agent-mesh

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your values

# Build
npm run build

# Start the server
npm run dev
```

### Configuration

Set these environment variables in `.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
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
| `CB_LEADER_RENEWAL_MS` | no | `5000` | Leader renewal interval (ms) |
| `AGENT_REGISTRY_DIR` | no | `./agents` | Directory containing agent YAML files |
| `MCP_REQUEST_TIMEOUT_MS` | no | `30000` | MCP request timeout (ms) |
| `MCP_MAX_RETRIES` | no | `3` | Max retries for failed MCP requests |

### Agent Registration

Create YAML files in the `agents/` directory:

```yaml
# agents/my-agent.yaml
agent_id: "my-agent"
display_name: "My Agent"
description: "Handles X, Y, and Z queries"
endpoint: "https://my-agent.example.com"
type: mcp
is_default: false
confidence_threshold: 0.7
clarification_required: false
examples:
  - "Example query for this agent"
  - "Another example query"
```

After adding agents, send SIGHUP to reload:
```bash
kill -HUP $(pgrep -f "node.*index.js")
```

### API Usage

```bash
# Health check
curl http://localhost:8080/health

# Deep health check
curl http://localhost:8080/health/deep

# Send a request
curl -X POST http://localhost:8080/v1/request \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Reset my password",
    "employee_id": "emp123"
  }'
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design.

### Key Components

| Component | Description |
|-----------|-------------|
| **Agent Registry** | YAML-based config with SIGHUP hot-reload |
| **Classifier** | Gemini Flash intent classification |
| **Confidence Gate** | Decision tree for routing/clarification/fallback |
| **Circuit Breaker** | Per-agent resilience with Firestore persistence |
| **MCP Router** | Agent dispatch via StreamableHTTP transport |

### Decision Flow

1. **Unknown agent** → Route to default
2. **Default agent** → Always route directly
3. **Confidence ≥ threshold** → Route to matched agent
4. **Clarification required** → Generate clarification question
5. **Otherwise** → Fall back to default

## Development

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

## Deployment

### Docker

```bash
docker build -t agent-mesh .
docker run -p 8080:8080 -e GOOGLE_CLOUD_PROJECT=my-project agent-mesh
```

### Terraform Deployment

The `infra/` directory contains reusable Terraform modules for deploying agent-mesh to multiple cloud providers:

| Provider | Module | Description |
|----------|--------|-------------|
| AWS | `infra/modules/aws-ecs` | ECS Fargate with ALB |
| Azure | `infra/modules/azure-container-apps` | Azure Container Apps |
| GCP | `infra/modules/gcp-cloud-run` | Cloud Run (managed) |
| OCI | `infra/modules/oci-oke` | Oracle Container Engine for Kubernetes |
| Netlify | `infra/modules/netlify` | Netlify serverless functions |
| Vercel | `infra/modules/vercel` | Vercel serverless functions |

#### Using the Modules

```hcl
# Example: AWS ECS deployment
module "agent_mesh" {
  source = "./infra/modules/aws-ecs"

  cluster_name     = "agent-mesh-cluster"
  service_name     = "agent-mesh"
  container_image  = "us-docker.pkg.dev/my-project/agent-mesh:latest"
  desired_count    = 2
  cpu              = 1024
  memory           = 2048
  vpc_id           = "vpc-123456"
  subnets          = ["subnet-123", "subnet-456"]

  environment_variables = {
    GOOGLE_CLOUD_PROJECT = "my-gcp-project"
    LOG_LEVEL            = "info"
  }

  secrets = {
    API_KEY = "arn:aws:secretsmanager:us-east-1:123456789:secret:api-key"
  }

  tags = {
    Environment = "production"
    Team        = "platform"
  }
}
```

See each module's `variables.tf` for the full list of configuration options.

### GCP Cloud Run (Manual)

```bash
gcloud run deploy agent-mesh \
  --image gcr.io/my-project/agent-mesh:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed deployment instructions.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System design deep dive
- [AGENTS.md](./AGENTS.md) — Agent development guide
- [DEV_PLAN.md](./DEV_PLAN.md) — Development checklist

## License

MIT — see [LICENSE](./LICENSE)
