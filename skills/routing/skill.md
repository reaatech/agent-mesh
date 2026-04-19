# Routing

## Capability

Intent classification and agent routing — the core skill that determines which
agent should handle each user request based on semantic understanding of the
input and agent capability descriptions.

## MCP Tools

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `classify_intent` | `{ input: string, user_context?: { employee_id, display_name, title, department }, language?: string }` | `{ agent_id, confidence, ambiguous, detected_language, intent_summary, entities }` | 60 RPM |
| `route_request` | `{ input: string, classifier_output: ClassifierOutput, agent_registry: AgentConfig[], detected_language: string }` | `{ action: 'route' \| 'clarify', agent_id: string, clarification_question?: string }` | 120 RPM |
| `evaluate_confidence` | `{ confidence: number, threshold: number, ambiguous: boolean, agent_config: AgentConfig }` | `{ pass: boolean, action: 'route' \| 'clarify' \| 'fallback' }` | 120 RPM |

## Usage Examples

### Example 1: Basic intent classification

**User intent:** "Reset my password"

**Tool call:**
```json
{
  "input": "Reset my password",
  "user_context": {
    "employee_id": "emp123",
    "display_name": "John Doe",
    "department": "Engineering"
  },
  "language": "en"
}
```

**Expected response:**
```json
{
  "agent_id": "it-helpdesk",
  "confidence": 0.92,
  "ambiguous": false,
  "detected_language": "en",
  "intent_summary": "User requesting password reset assistance",
  "entities": {
    "action_type": "password_reset",
    "urgency": "normal"
  }
}
```

### Example 2: Ambiguous request requiring clarification

**User intent:** "I need help with my account"

**Tool call:**
```json
{
  "input": "I need help with my account",
  "user_context": {
    "employee_id": "emp456"
  }
}
```

**Expected response:**
```json
{
  "agent_id": "hr-portal",
  "confidence": 0.45,
  "ambiguous": true,
  "detected_language": "en",
  "intent_summary": "User needs account-related assistance, unclear which system",
  "entities": {}
}
```

**Routing decision:**
```json
{
  "action": "clarify",
  "agent_id": "hr-portal",
  "clarification_question": "Could you tell me more about what kind of account help you need? For example, are you looking for HR system access, IT account issues, or something else?"
}
```

### Example 3: Low confidence fallback to default

**User intent:** "Hello"

**Tool call:**
```json
{
  "input": "Hello",
  "user_context": {
    "employee_id": "emp789"
  }
}
```

**Expected response:**
```json
{
  "agent_id": "general-assistant",
  "confidence": 0.15,
  "ambiguous": false,
  "detected_language": "en",
  "intent_summary": "User greeting",
  "entities": {}
}
```

**Routing decision:**
```json
{
  "action": "route",
  "agent_id": "default-agent"
}
```

## Error Handling

### Known failure modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `CLASSIFIER_TIMEOUT` | Gemini API timeout | Fall back to default agent, log warning |
| `INVALID_JSON_RESPONSE` | Gemini returned malformed JSON | Fall back to default agent with `fallback_reason: "json_parse_error"` |
| `RATE_LIMIT_EXCEEDED` | Gemini API rate limit | Exponential backoff, retry up to 3 times, then fallback |
| `EMPTY_REGISTRY` | No agents configured | Return error, do not route |
| `UNKNOWN_AGENT` | Classified agent not in registry | Route to default agent |

### Recovery strategies

1. **Classifier errors** — Always fall back to default agent. Log the error with
   full context for debugging.

2. **Registry errors** — Use the last-known-good registry (atomic swap ensures
   this is always available).

3. **Rate limiting** — Exponential backoff with jitter. If all retries fail,
   fall back to default agent.

### Escalation paths

- **Repeated classifier failures** → Alert on-call engineer
- **High fallback rate** → Review agent descriptions and examples
- **Consistent misrouting** → Retrain classifier with better examples

## Security Considerations

### PII handling

- **Never log raw user input** — Use intent summaries instead
- **Never include PII in classification output** — Entities should be anonymized
- **Hash employee_id in logs** — Use one-way hash for correlation

### Permission requirements

- Classifier service account needs Vertex AI permissions
- Registry read access (file system or GCS)
- No write permissions required for classification

### Audit logging

Log these events for compliance:
- Classification requests (without raw input)
- Routing decisions
- Fallback events with reason codes
- Registry reload events

### Prompt injection defense

- Sanitize agent descriptions before injecting into prompts
- Validate entity extraction output
- Limit input length to prevent prompt overflow
- Use structured output format (JSON) to prevent injection

## Performance Characteristics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Classification latency (p50) | < 500ms | Gemini API call + parsing |
| Classification latency (p99) | < 2s | Including retries |
| Routing decision latency | < 10ms | In-memory evaluation |
| Cache hit rate | > 80% | Clarification question cache |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CLASSIFIER_MODEL` | `gemini-2.0-flash-001` | Vertex AI model ID |
| `CLASSIFIER_LOCATION` | `us-central1` | Vertex AI region |
| `CLASSIFIER_TEMPERATURE` | `0.1` | Sampling temperature (lower = more deterministic) |
| `CONFIDENCE_THRESHOLD` | `0.75` | Default threshold if agent doesn't specify |
| `CLARIFICATION_CACHE_TTL_MS` | `300000` | Cache TTL for generated questions (5 min) |
| `CLARIFICATION_CACHE_MAX_SIZE` | `1000` | Max cache entries before LRU eviction |

## Testing

### Unit tests

```typescript
describe('classify_intent', () => {
  it('should classify password reset request', async () => {
    const result = await classify_intent({
      input: 'Reset my password',
      user_context: { employee_id: 'emp123' },
      language: 'en',
    });

    expect(result.agent_id).toBe('it-helpdesk');
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.intent_summary).toContain('password');
  });

  it('should detect ambiguous requests', async () => {
    const result = await classify_intent({
      input: 'I need help',
      user_context: { employee_id: 'emp123' },
    });

    expect(result.ambiguous).toBe(true);
  });
});

describe('route_request', () => {
  it('should route high confidence to matched agent', async () => {
    const result = await route_request({
      input: 'Reset my password',
      classifier_output: {
        agent_id: 'it-helpdesk',
        confidence: 0.92,
        ambiguous: false,
        detected_language: 'en',
        intent_summary: 'Password reset',
        entities: {},
      },
      agent_registry: [
        {
          agent_id: 'it-helpdesk',
          confidence_threshold: 0.7,
          clarification_required: false,
          is_default: false,
        },
        {
          agent_id: 'default',
          confidence_threshold: 0,
          is_default: true,
        },
      ],
      detected_language: 'en',
    });

    expect(result.action).toBe('route');
    expect(result.agent_id).toBe('it-helpdesk');
  });

  it('should clarify when confidence is low and agent requires it', async () => {
    const result = await route_request({
      input: 'Help with account',
      classifier_output: {
        agent_id: 'hr-portal',
        confidence: 0.45,
        ambiguous: true,
        detected_language: 'en',
        intent_summary: 'Account help',
        entities: {},
      },
      agent_registry: [
        {
          agent_id: 'hr-portal',
          confidence_threshold: 0.7,
          clarification_required: true,
          is_default: false,
        },
        {
          agent_id: 'default',
          confidence_threshold: 0,
          is_default: true,
        },
      ],
      detected_language: 'en',
    });

    expect(result.action).toBe('clarify');
    expect(result.clarification_question).toBeDefined();
  });
});
```

### Contract tests

```typescript
describe('Routing contract', () => {
  it('should maintain backward compatibility with agent request format', () => {
    // Ensure classified output is compatible with agent dispatch
    const classified = {
      agent_id: 'test-agent',
      confidence: 0.8,
      ambiguous: false,
      detected_language: 'en',
      intent_summary: 'Test intent',
      entities: {},
    };

    // Should be valid for MCP dispatch
    expect(validateForDispatch(classified)).toBe(true);
  });

  it('should handle all decision tree paths', () => {
    const paths = [
      { name: 'unknown_agent', input: createRequest('unknown') },
      { name: 'default_agent', input: createRequest('default') },
      { name: 'high_confidence', input: createRequest('confident') },
      { name: 'clarification', input: createRequest('unclear') },
      { name: 'fallback', input: createRequest('low_confidence') },
    ];

    for (const path of paths) {
      const result = route_request(path.input);
      expect(result.action).toBeDefined();
      expect(['route', 'clarify']).toContain(result.action);
    }
  });
});
