# @reaatech/agent-mesh-confidence

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-mesh-confidence.svg)](https://www.npmjs.com/package/@reaatech/agent-mesh-confidence)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
[![CI](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Confidence-gated routing decision engine for the agent-mesh orchestrator. Implements a 5-rule decision tree that evaluates classifier output against agent thresholds to route, ask for clarification, or fall back to the default agent. Includes an LRU clarification cache with deferred-clear semantics.

## Installation

```bash
npm install @reaatech/agent-mesh-confidence
# or
pnpm add @reaatech/agent-mesh-confidence
```

## Feature Overview

- **5-rule decision tree** — deterministic routing logic: unknown agent → default, default agent → route, confidence ≥ threshold → route, clarification enabled → clarify, otherwise → fallback
- **Session bypass** — active sessions skip the confidence gate and route directly to the session's agent
- **Clarification cache** — LRU cache with TTL expiration and deferred clear (waits for in-flight requests)
- **Language-aware questions** — clarification questions returned in the user's detected language
- **Metric recording** — emits `confidence.clarification.count` counter on every clarification event

## Quick Start

```typescript
import { evaluateConfidenceGate } from "@reaatech/agent-mesh-confidence";

const decision = evaluateConfidenceGate(
  { agent_id: "serval", confidence: 0.55, ambiguous: false, detected_language: "en", intent_summary: "Password reset", entities: {} },
  registry,
  false, // bypassClassifier
);

console.log(decision);
// → { action: "clarify", agent_id: "serval", confidence: 0.55, clarification_question: "Could you please provide...", reason: "Below threshold 0.7, clarification required" }
```

## API Reference

### Decision Engine

#### `evaluateConfidenceGate(classifierOutput, registry, bypassClassifier?): ConfidenceDecision`

Evaluates the multi-agent routing decision tree. Returns a `ConfidenceDecision` with one of three actions.

**Decision rules (in order):**

| Rule | Condition | Action |
|------|-----------|--------|
| 1 | Classified agent ID is not in the registry | `route` to default agent |
| 2 | Matched agent is the default agent | `route` directly (no threshold check) |
| 3 | `bypassClassifier` is `true` (active session) | `route` to the session's agent |
| 4 | `confidence ≥ threshold` AND `!ambiguous` | `route` to the matched agent |
| 5 | `clarification_required` is `true` AND `ENABLE_CLARIFICATION` | `clarify` with a localized question |
| 6 | Otherwise | `fallback` to the default agent |

#### `ConfidenceDecision`

```typescript
interface ConfidenceDecision {
  action: "route" | "clarify" | "fallback";
  agent_id: string;
  confidence: number;
  clarification_question?: string; // Only set when action === "clarify"
  reason: string;
}
```

### Clarification Questions

#### `generateClarificationQuestion(agent, userInput, language): Promise<string>`

Generates a contextual clarification question for a specific agent. Uses the cache to avoid redundant generation. Returns a localized fallback question.

```typescript
import { generateClarificationQuestion } from "@reaatech/agent-mesh-confidence";

const question = await generateClarificationQuestion(
  servalAgent,
  "I need help with my computer",
  "en",
);
// → "Could you please provide more details about what you need help with?"
```

### Clarification Cache

#### `clarificationCache` (singleton)

An LRU cache for clarification questions with TTL expiration and deferred-clear semantics.

```typescript
import { clarificationCache } from "@reaatech/agent-mesh-confidence";

// Cache a question
clarificationCache.set("serval:en", "What specific IT issue are you having?");

// Retrieve (respects TTL)
const cached = clarificationCache.get("serval:en");

// Track in-flight requests (prevents cache clear during active requests)
clarificationCache.startRequest();
// ... process request ...
clarificationCache.endRequest();

// Clear when deferred
clarificationCache.clear();

// Inspect
const stats = clarificationCache.getStats();
// → { size: 3, pendingClear: false, activeRequests: 0 }
```

## Routing Decision Flow

```
Classifier Output
        │
        ▼
┌─── Unknown agent? ──→ Route to default
│
├─── Is default? ──→ Route directly
│
├─── Session bypass? ──→ Route to session agent
│
├─── Confidence ≥ threshold && !ambiguous? ──→ Route to agent
│
├─── Clarification enabled? ──→ Generate question
│
└─── Otherwise ──→ Fallback to default
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CLARIFICATION` | `true` | Whether to generate clarification questions when confidence is below threshold |

Each agent also has its own `confidence_threshold` (0.0–1.0) and `clarification_required` boolean in the registry.

## Usage Patterns

### In the Orchestrator Pipeline

```typescript
import { evaluateConfidenceGate } from "@reaatech/agent-mesh-confidence";

const classification = await classifierService.classify(input, registry);
const decision = evaluateConfidenceGate(classification, registry, false);

switch (decision.action) {
  case "route":
    return dispatchToAgent(registry.getAgent(decision.agent_id), input);
  case "clarify":
    return { clarification: decision.clarification_question, suggestedAgent: decision.agent_id };
  case "fallback":
    return dispatchToAgent(registry.defaultAgent, input);
}
```

### Session Bypass

```typescript
// Active session found — skip classification and confidence gate
const decision = evaluateConfidenceGate(
  { agent_id: session.active_agent, confidence: 1, ambiguous: false, detected_language: "en", intent_summary: "Session bypass", entities: {} },
  registry,
  true, // bypassClassifier
);
// → { action: "route", agent_id: session.active_agent, reason: "Session bypass, routing directly to session agent" }
```

## Related Packages

- [`@reaatech/agent-mesh`](https://www.npmjs.com/package/@reaatech/agent-mesh) — Core types (ConfidenceDecision, ClassifierOutput, ConfidenceAction)
- [`@reaatech/agent-mesh-classifier`](https://www.npmjs.com/package/@reaatech/agent-mesh-classifier) — Provides ClassifierOutput and localization
- [`@reaatech/agent-mesh-registry`](https://www.npmjs.com/package/@reaatech/agent-mesh-registry) — Agent registry with threshold configs
- [`@reaatech/agent-mesh-router`](https://www.npmjs.com/package/@reaatech/agent-mesh-router) — Consumes the routing decision for agent dispatch

## License

[MIT](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
