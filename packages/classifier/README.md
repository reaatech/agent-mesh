# @reaatech/agent-mesh-classifier

> **Pluggable** via `ClassifierProvider` — inject any intent classifier with
> `createClassifier(provider)`. Default (no arg) = Gemini Flash + mock fallback.

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-mesh-classifier.svg)](https://www.npmjs.com/package/@reaatech/agent-mesh-classifier)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
[![CI](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-mesh/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Gemini Flash intent classifier for the agent-mesh orchestrator. Dynamically builds prompts from the agent registry, classifies user requests with confidence scoring and language detection, and falls back to a mock keyword-based classifier when Gemini is unavailable.

## Installation

```bash
npm install @reaatech/agent-mesh-classifier
# or
pnpm add @reaatech/agent-mesh-classifier
```

## Feature Overview

- **Gemini Flash classification** — Vertex AI-powered intent classification with temperature-controlled output
- **Dynamic prompt construction** — agent descriptions and few-shot examples from the registry are injected verbatim into the classifier prompt
- **Exponential backoff retry** — automatic retry on rate-limit errors (429, quota exceeded, resource exhausted)
- **Mock classifier fallback** — keyword-matching classifier for development/testing when GCP is unavailable
- **Language detection** — heuristic-based detection for 58 languages with regex pattern scoring
- **Localized clarification questions** — 58-language fallback question bank for when Gemini cannot generate contextual clarifications

## Quick Start

```typescript
import { classifierService } from "@reaatech/agent-mesh-classifier";
import { registryState } from "@reaatech/agent-mesh-registry";

const classification = await classifierService.classify(
  "I need to reset my Okta password",
  registryState.registry!,
);

console.log(classification);
// → { agent_id: "serval", confidence: 0.92, ambiguous: false, detected_language: "en", intent_summary: "User needs password reset" }
```

## API Reference

### Classifier Service

#### `classifierService` (singleton)

The global `ClassifierService` instance. In production, it initializes Gemini Flash on first use. Falls back to the mock classifier if Gemini is unavailable or if `NODE_ENV === "test"`.

```typescript
import { classifierService } from "@reaatech/agent-mesh-classifier";

const result = await classifierService.classify(userInput, registry, priorLanguage?);
```

#### `classifierService.classify(userInput, registry, priorLanguage?): Promise<ClassifierOutput>`

Classifies a user request against the available agents. Returns a structured `ClassifierOutput` with agent ID, confidence score (0–1), ambiguity flag, detected language, intent summary, and entities.

#### `classifierService.isMock(): boolean`

Returns `true` if the classifier is currently using the mock (keyword-based) implementation.

#### `isRateLimitError(error: unknown): boolean`

Utility to check if an error is a Gemini rate-limit error. Returns `true` for 429, quota exceeded, and resource exhausted errors.

### Prompt Builder

#### `buildClassifierPrompt(registry, userInput, detectedLanguage?): string`

Builds the full Gemini classifier prompt from the agent registry. Each agent's description, examples, and clarification context are injected into the prompt. An optional language hint is included from prior turns.

#### `parseClassifierOutput(jsonStr: string): ClassifierOutput`

Parses and validates the Gemini JSON response. Strips markdown code fences, validates required fields (`agent_id`, `confidence`, `detected_language`, `intent_summary`), and returns a typed `ClassifierOutput`.

### Localization

#### `detectLanguage(text: string): SupportedLanguage`

Detects the language of input text using regex pattern scoring across 58 languages. Returns an ISO 639-1 language code.

```typescript
import { detectLanguage } from "@reaatech/agent-mesh-classifier";

detectLanguage("¿Cómo puedo restablecer mi contraseña?"); // → "es"
detectLanguage("パスワードをリセットする方法");           // → "ja"
```

#### `isValidLanguageCode(code: string): boolean`

Validates that a string is one of the 58 supported language codes.

#### `getClarificationQuestion(language: string): string`

Returns a localized clarification question for a given language. Falls back to English if the language is unsupported.

```typescript
import { getClarificationQuestion } from "@reaatech/agent-mesh-classifier";

getClarificationQuestion("es"); // → "¿Podría proporcionar más detalles sobre lo que necesita ayuda?"
getClarificationQuestion("en"); // → "Could you please provide more details about what you need help with?"
```

#### `FALLBACK_QUESTIONS`

A constant record mapping all 58 supported language codes to their localized fallback questions.

## Classifier Output Shape

```typescript
interface ClassifierOutput {
  agent_id: string;              // ID of the best-matching agent
  confidence: number;            // 0.0–1.0 confidence score
  ambiguous: boolean;            // Whether the request could match multiple agents
  detected_language: string;     // ISO 639-1 language code
  intent_summary: string;        // One-sentence summary
  entities: Record<string, unknown>; // Extracted key-value entities
}
```

## Usage Patterns

### Rate-Limit Handling

```typescript
import { classifierService, isRateLimitError } from "@reaatech/agent-mesh-classifier";

try {
  const result = await classifierService.classify(input, registry);
} catch (error) {
  if (isRateLimitError(error)) {
    // The service internally retries with backoff, but if it exhausts retries:
    console.warn("Gemini rate-limited, using fallback");
  }
}
```

### Language-Aware Classification

```typescript
// First classification detects language
const first = await classifierService.classify("Bonjour", registry);
// first.detected_language === "fr"

// Subsequent turns pass the prior language as a hint
const second = await classifierService.classify(
  "Je voudrais réinitialiser mon mot de passe",
  registry,
  first.detected_language
);
```

### Mock Mode for Development

```typescript
import { classifierService } from "@reaatech/agent-mesh-classifier";

// When Gemini is unavailable (no GCP credentials, NODE_ENV=test, or init failure):
// The mock classifier uses keyword matching against agent examples

if (classifierService.isMock()) {
  console.log("Running in mock classifier mode");
}
```

## Related Packages

- [`@reaatech/agent-mesh-registry`](https://www.npmjs.com/package/@reaatech/agent-mesh-registry) — Agent registry (consumed by the prompt builder)
- [`@reaatech/agent-mesh`](https://www.npmjs.com/package/@reaatech/agent-mesh) — Core types (ClassifierOutput) and constants (SUPPORTED_LANGUAGES)
- [`@reaatech/agent-mesh-confidence`](https://www.npmjs.com/package/@reaatech/agent-mesh-confidence) — Confidence gate (consumes ClassifierOutput for routing decisions)

## License

[MIT](https://github.com/reaatech/agent-mesh/blob/main/LICENSE)
