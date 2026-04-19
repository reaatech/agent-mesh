# Clarification

## Capability

User clarification when confidence is low — generates targeted questions to help
users clarify their intent when the classifier's confidence is below the agent's
threshold, improving routing accuracy and user experience.

## MCP Tools

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `generate_clarification_question` | `{ agent_name: string, user_input: string, detected_language: string, intent_summary?: string }` | `{ question: string, language: string, cached: boolean }` | 60 RPM |
| `process_clarification_response` | `{ original_input: string, clarification_response: string, agent_id: string }` | `{ enhanced_input: string, should_reclassify: boolean }` | 120 RPM |
| `get_fallback_question` | `{ language: string }` | `{ question: string, language: string }` | Unlimited |

## Usage Examples

### Example 1: Generate clarification question

**User intent:** Classifier returned low confidence for a specialized agent

**Tool call:**
```json
{
  "agent_name": "IT Helpdesk",
  "user_input": "My computer is slow",
  "detected_language": "en",
  "intent_summary": "User reporting performance issues"
}
```

**Expected response:**
```json
{
  "question": "Could you tell me more about what's running slowly? For example, is it your web browser, specific applications, or your entire computer?",
  "language": "en",
  "cached": false
}
```

### Example 2: Cached clarification question

**User intent:** Same agent/language/input combination as recent request

**Tool call:**
```json
{
  "agent_name": "IT Helpdesk",
  "user_input": "My computer is slow",
  "detected_language": "en",
  "intent_summary": "User reporting performance issues"
}
```

**Expected response (within 5 minutes of previous):**
```json
{
  "question": "Could you tell me more about what's running slowly? For example, is it your web browser, specific applications, or your entire computer?",
  "language": "en",
  "cached": true
}
```

### Example 3: Localized clarification question

**User intent:** Generate question in user's detected language

**Tool call:**
```json
{
  "agent_name": "IT Helpdesk",
  "user_input": "Mi computadora está lenta",
  "detected_language": "es",
  "intent_summary": "Usuario reporta problemas de rendimiento"
}
```

**Expected response:**
```json
{
  "question": "¿Podrías decirme más sobre qué está funcionando lentamente? Por ejemplo, ¿es tu navegador web, aplicaciones específicas o toda tu computadora?",
  "language": "es",
  "cached": false
}
```

### Example 4: Fallback question when Gemini fails

**User intent:** Get a fallback question when AI generation fails

**Tool call:**
```json
{
  "language": "fr"
}
```

**Expected response:**
```json
{
  "question": "Pourriez-vous fournir plus de détails sur ce dont vous avez besoin ?",
  "language": "fr"
}
```

### Example 5: Process clarification response

**User intent:** Combine original input with clarification for re-classification

**Tool call:**
```json
{
  "original_input": "My computer is slow",
  "clarification_response": "It's mainly my web browser that's slow, especially when I have multiple tabs open",
  "agent_id": "it-helpdesk"
}
```

**Expected response:**
```json
{
  "enhanced_input": "My computer is slow. Specifically: It's mainly my web browser that's slow, especially when I have multiple tabs open",
  "should_reclassify": true
}
```

## Error Handling

### Known failure modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `GEMINI_TIMEOUT` | Vertex AI API timeout | Return localized fallback question |
| `GEMINI_RATE_LIMIT` | API quota exceeded | Return localized fallback question, log warning |
| `INVALID_LANGUAGE_CODE` | Unsupported language | Fall back to English fallback question |
| `EMPTY_AGENT_NAME` | Missing agent name | Use generic prompt without agent reference |
| `EMPTY_USER_INPUT` | No input provided | Use intent_summary or generic context |

### Recovery strategies

1. **Gemini failures** — Always return a localized fallback question. The user
   still gets a clarification experience, just not AI-generated.

2. **Invalid language** — Fall back to English. Better to clarify in English
   than not clarify at all.

3. **Missing context** — Use generic prompts that work without specific details.

### Escalation paths

- **High Gemini failure rate** → Check Vertex AI connectivity and quotas
- **Consistent low clarification response rate** → Review question quality
- **User abandonment after clarification** → Review question relevance

## Security Considerations

### PII handling

- **Never log raw user input** — Use hashed or truncated versions
- **Never include PII in clarification questions** — Questions should be generic
- **Sanitize agent names** — Remove special characters that could enable injection

### Permission requirements

- Vertex AI permissions for Gemini API
- No external API access required
- Service account needs AI Platform User role

### Audit logging

Log these events for compliance:
- Clarification questions generated (without user input)
- Fallback question usage
- Language detection results
- Cache hit/miss rates

### Prompt injection defense

- Sanitize agent names before injecting into prompts
- Validate generated questions don't contain injection patterns
- Limit question length to prevent overflow
- Use structured output format (JSON) for parsing

## Performance Characteristics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Question generation latency (p50) | < 1s | Gemini API call + parsing |
| Question generation latency (p99) | < 3s | Including retries |
| Cache hit rate | > 80% | In-memory LRU cache |
| Fallback usage rate | < 5% | When Gemini fails |
| Cache memory overhead | < 1MB | For 1000 entries |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CLARIFICATION_CACHE_TTL_MS` | `300000` | Cache TTL (5 minutes) |
| `CLARIFICATION_CACHE_MAX_SIZE` | `1000` | Max cache entries before LRU eviction |
| `CLARIFICATION_TEMPERATURE` | `0.3` | Gemini sampling temperature |
| `CLARIFICATION_MAX_TOKENS` | `128` | Max output tokens from Gemini |
| `FALLBACK_QUESTIONS_LANGUAGE` | `en` | Default fallback language |

## Supported Languages

The system supports clarification questions in 45+ languages:

**Major languages (highest traffic):**
- English (en), Spanish (es), French (fr), German (de), Italian (it)
- Portuguese (pt), Japanese (ja), Chinese (zh), Korean (ko)
- Russian (ru), Arabic (ar), Hindi (hi)

**European languages:**
- Dutch (nl), Polish (pl), Turkish (tr), Vietnamese (vi), Thai (th)
- Swedish (sv), Danish (da), Norwegian (no), Finnish (fi), Czech (cs)
- Hungarian (hu), Romanian (ro), Greek (el), Hebrew (he), Ukrainian (uk)
- Bulgarian (bg), Croatian (hr), Slovak (sk), Slovenian (sl)
- Lithuanian (lt), Latvian (lv), Estonian (et)

**Asian languages:**
- Indonesian (id), Malay (ms)

## Fallback Questions

Pre-translated fallback questions for all supported languages ensure users
always receive clarification in their language, even when Gemini fails:

| Language | Fallback Question |
|----------|------------------|
| English | "Could you provide more detail about what you need?" |
| Spanish | "¿Podrías proporcionar más detalles sobre lo que necesitas?" |
| French | "Pourriez-vous fournir plus de détails sur ce dont vous avez besoin ?" |
| German | "Könnten Sie mehr Details dazu angeben, was Sie benötigen?" |
| Japanese | "必要なものについて、もう少し詳しく教えていただけますか？" |
| Chinese | "您能提供更多关于您需要的内容的详细信息吗？" |

## Cache Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Clarification Question Cache                        │
│                                                                      │
│  Type: In-memory LRU cache                                          │
│  Key format: {agent_name}:{language}:{input_hash}                   │
│  Max size: 1000 entries                                             │
│  TTL: 5 minutes                                                      │
│                                                                      │
│  Eviction strategy:                                                 │
│  1. Remove expired entries first                                    │
│  2. If still over limit, remove LRU entries                         │
│                                                                      │
│  Deferred clearing:                                                 │
│  - SIGHUP triggers pending clear flag                               │
│  - Actual clear happens when active_requests = 0                    │
│  - Prevents race conditions with active Map operations              │
└─────────────────────────────────────────────────────────────────────┘
```

## Question Generation Prompt

The Gemini prompt for generating clarification questions:

```
You are a friendly enterprise assistant. A user sent the following request:
"{user_input or intent_summary}"

This might relate to {sanitized_agent_name}, but it is not clear enough to
route confidently.

Write a single clarification question to ask the user in the language with
ISO 639-1 code "{detected_language}". One sentence, conversational tone,
no preamble. Make sure your response is phrased as a question (ending with ?).
```

**Key design decisions:**
- Uses user's actual words when available (more context)
- Falls back to intent_summary if input is too short
- Specifies language explicitly for consistent output
- Requires question format (validates output ends with ?)
- Limits to one sentence for brevity

## Testing

### Unit tests

```typescript
describe('clarification', () => {
  it('should generate a clarification question', async () => {
    const result = await generate_clarification_question({
      agent_name: 'IT Helpdesk',
      user_input: 'My computer is slow',
      detected_language: 'en',
      intent_summary: 'Performance issue',
    });

    expect(result.question).toBeDefined();
    expect(result.question.length).toBeGreaterThan(10);
    expect(result.question.endsWith('?') || result.question.endsWith('？')).toBe(true);
    expect(result.language).toBe('en');
  });

  it('should return cached question for same input', async () => {
    const input = {
      agent_name: 'IT Helpdesk',
      user_input: 'My computer is slow',
      detected_language: 'en',
      intent_summary: 'Performance issue',
    };

    const first = await generate_clarification_question(input);
    const second = await generate_clarification_question(input);

    expect(first.question).toBe(second.question);
    expect(second.cached).toBe(true);
  });

  it('should return localized fallback when Gemini fails', async () => {
    // Mock Gemini to fail
    mockGeminiFailure();

    const result = await generate_clarification_question({
      agent_name: 'IT Helpdesk',
      user_input: 'Test',
      detected_language: 'es',
      intent_summary: 'Test',
    });

    expect(result.question).toBe(
      '¿Podrías proporcionar más detalles sobre lo que necesitas?'
    );
    expect(result.language).toBe('es');
  });

  it('should validate question format', async () => {
    const result = await generate_clarification_question({
      agent_name: 'IT Helpdesk',
      user_input: 'Test input',
      detected_language: 'en',
      intent_summary: 'Test',
    });

    // Should end with question mark
    expect(
      result.question.endsWith('?') ||
        result.question.endsWith('？') ||
        result.question.endsWith('¿')
    ).toBe(true);
  });

  it('should truncate long questions', async () => {
    // Mock Gemini to return very long text
    mockGeminiLongResponse();

    const result = await generate_clarification_question({
      agent_name: 'IT Helpdesk',
      user_input: 'Test',
      detected_language: 'en',
      intent_summary: 'Test',
    });

    expect(result.question.length).toBeLessThanOrEqual(200);
  });

  it('should get fallback question for invalid language', async () => {
    const result = await get_fallback_question({
      language: 'invalid',
    });

    // Should fall back to English
    expect(result.language).toBe('en');
    expect(result.question).toBeDefined();
  });

  it('should process clarification response', async () => {
    const result = await process_clarification_response({
      original_input: 'My computer is slow',
      clarification_response: 'The web browser is slow',
      agent_id: 'it-helpdesk',
    });

    expect(result.enhanced_input).toContain('My computer is slow');
    expect(result.enhanced_input).toContain('The web browser is slow');
    expect(result.should_reclassify).toBe(true);
  });
});
```

### Integration tests

```typescript
describe('clarification integration', () => {
  it('should handle full clarification flow', async () => {
    // 1. Generate clarification question
    const question = await generate_clarification_question({
      agent_name: 'IT Helpdesk',
      user_input: 'My computer is slow',
      detected_language: 'en',
      intent_summary: 'Performance issue',
    });

    expect(question.question).toBeDefined();

    // 2. Simulate user response
    const userResponse = 'The web browser is slow when I have many tabs';

    // 3. Process clarification response
    const processed = await process_clarification_response({
      original_input: 'My computer is slow',
      clarification_response: userResponse,
      agent_id: 'it-helpdesk',
    });

    expect(processed.enhanced_input).toContain('My computer is slow');
    expect(processed.enhanced_input).toContain(userResponse);
    expect(processed.should_reclassify).toBe(true);
  });

  it('should handle cache eviction', async () => {
    // Fill cache beyond limit
    for (let i = 0; i < 1100; i++) {
      await generate_clarification_question({
        agent_name: `Agent-${i}`,
        user_input: `Test ${i}`,
        detected_language: 'en',
        intent_summary: 'Test',
      });
    }

    // Cache should have evicted old entries
    const cacheSize = getCacheSize();
    expect(cacheSize).toBeLessThanOrEqual(1000);
  });

  it('should handle SIGHUP cache clear', async () => {
    // Generate some questions
    await generate_clarification_question({
      agent_name: 'Test Agent',
      user_input: 'Test',
      detected_language: 'en',
      intent_summary: 'Test',
    });

    // Simulate SIGHUP
    process.emit('SIGHUP');

    // Cache should be cleared (or pending clear if active requests)
    await sleep(100); // Wait for deferred clear
    const cacheSize = getCacheSize();
    expect(cacheSize).toBe(0);
  });
});
