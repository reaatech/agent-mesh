# Session Management

## Capability

Multi-turn conversation state management — maintains session context across
multiple exchanges, enabling agents to handle complex workflows that span
several back-and-forth messages with the user.

## MCP Tools

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `create_session` | `{ user_id: string, employee_id: string, display_name: string, detected_language: string, intent_summary: string, entities?: Record<string, string> }` | `{ session_id: string, status: 'active', created_at: string }` | 120 RPM |
| `get_session` | `{ session_id: string }` | `{ session_id, user_id, status, turn_history, workflow_state, active_agent, detected_language }` | 600 RPM |
| `append_turn` | `{ session_id: string, role: 'user' \| 'agent', content: string, intent_summary?: string }` | `{ success: boolean, turn_count: number, ttl_refreshed: boolean }` | 600 RPM |
| `update_workflow_state` | `{ session_id: string, workflow_state: Record<string, unknown> }` | `{ success: boolean, previous_state: Record<string, unknown> }` | 120 RPM |
| `close_session` | `{ session_id: string, status: 'COMPLETED' \| 'ABANDONED' \| 'ERROR', summary?: string }` | `{ success: boolean, closed_at: string }` | 120 RPM |
| `resume_session` | `{ prior_session_id: string, user_id: string }` | `{ new_session_id: string, carried_forward_turns: number }` | 30 RPM |

## Usage Examples

### Example 1: Create new session

**User intent:** Start a new conversation

**Tool call:**
```json
{
  "user_id": "U01ABC123",
  "employee_id": "emp123",
  "display_name": "John Doe",
  "detected_language": "en",
  "intent_summary": "User needs IT support for laptop issue",
  "entities": {
    "issue_type": "hardware",
    "device": "laptop"
  }
}
```

**Expected response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "created_at": "2026-04-15T22:00:00Z"
}
```

### Example 2: Append user turn

**User intent:** Send a message in an active session

**Tool call:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "role": "user",
  "content": "My laptop screen is flickering",
  "intent_summary": "Reporting screen flickering issue"
}
```

**Expected response:**
```json
{
  "success": true,
  "turn_count": 1,
  "ttl_refreshed": true
}
```

### Example 3: Append agent turn

**User intent:** Agent responds to user

**Tool call:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "role": "agent",
  "content": "I understand your screen is flickering. Let me help you troubleshoot. Can you tell me if this started recently or has it been happening for a while?"
}
```

**Expected response:**
```json
{
  "success": true,
  "turn_count": 2,
  "ttl_refreshed": true
}
```

### Example 4: Update workflow state

**User intent:** Agent stores context for multi-turn workflow

**Tool call:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "workflow_state": {
    "step": "troubleshooting",
    "issue_type": "screen_flicker",
    "questions_asked": ["onset"],
    "ticket_id": "TKT-12345"
  }
}
```

**Expected response:**
```json
{
  "success": true,
  "previous_state": {}
}
```

### Example 5: Close session

**User intent:** End the conversation

**Tool call:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "COMPLETED",
  "summary": "Resolved screen flickering by updating graphics driver"
}
```

**Expected response:**
```json
{
  "success": true,
  "closed_at": "2026-04-15T22:15:00Z"
}
```

### Example 6: Resume prior session

**User intent:** Continue a previous conversation

**Tool call:**
```json
{
  "prior_session_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "U01ABC123"
}
```

**Expected response:**
```json
{
  "new_session_id": "660e8400-e29b-41d4-a716-446655440001",
  "carried_forward_turns": 4
}
```

## Error Handling

### Known failure modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `SESSION_NOT_FOUND` | Session ID doesn't exist or expired | Create new session, continue without history |
| `FIRESTORE_UNAVAILABLE` | Firestore connection failed | Retry with exponential backoff, fail open |
| `TRANSACTION_CONFLICT` | Concurrent session update | Automatic retry by Firestore (up to 5 times) |
| `TTL_EXPIRED` | Session TTL expired before access | Treat as SESSION_NOT_FOUND |
| `INVALID_STATUS` | Invalid session status value | Return error, don't update |

### Recovery strategies

1. **Session not found** — Create a new session transparently. The user won't
   notice the history was lost if the session expired naturally.

2. **Firestore unavailable** — Retry with exponential backoff (100ms, 200ms,
   400ms). If all fail, create session in-memory only (with warning).

3. **Transaction conflicts** — Firestore handles automatic retries. If all
   retries fail, return error and let caller decide (usually retry the whole
   request).

### Escalation paths

- **High session creation failure rate** → Check Firestore connectivity
- **High TTL expiration rate** → Review TTL configuration (may be too short)
- **Frequent transaction conflicts** → Check for concurrent access patterns

## Security Considerations

### PII handling

- **Never log raw conversation content** — Use turn counts and metadata only
- **Hash user_id in logs** — Use one-way hash for correlation
- **Encrypt sensitive workflow_state** — If storing PII, use field-level encryption
- **Automatic TTL cleanup** — Firestore TTL policy ensures data deletion

### Permission requirements

- Firestore read/write for session data
- Pub/Sub publish for session events (closure)
- Service account needs Datastore user role

### Audit logging

Log these events for compliance:
- Session creation (without content)
- Session closure with status
- Session resume events
- Workflow state changes (metadata only)

### Session isolation

- Users can only access their own sessions (enforced by user_id lookup)
- Session IDs are UUIDs (not guessable)
- Expired sessions are automatically deleted by Firestore TTL

## Performance Characteristics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Session creation latency (p50) | < 50ms | Firestore write |
| Session lookup latency (p50) | < 30ms | Firestore read |
| Session lookup latency (p99) | < 100ms | Including retries |
| Turn append latency (p50) | < 50ms | Firestore transaction |
| TTL refresh overhead | < 10ms | Additional write time |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FIRESTORE_DATABASE` | `(default)` | Firestore database ID |
| `SESSION_TTL_MS` | `1800000` | Session TTL (30 minutes) |
| `SESSION_COLLECTION` | `sessions` | Firestore collection name |
| `MAX_TURNS_PER_SESSION` | `100` | Maximum turns before truncation |
| `PUBSUB_TOPIC` | `session-events` | Pub/Sub topic for closure events |

## Firestore Schema

```
Collection: sessions
Document ID: {session_id} (UUID)

Fields:
├── session_id: string (UUID)
├── user_id: string (Slack user ID or employee ID)
├── employee_id: string
├── display_name: string
├── active_agent: string (agent_id of current agent)
├── status: string ('active', 'COMPLETED', 'ABANDONED', 'ERROR')
├── workflow_state: map (agent-managed state)
├── turn_history: array
│   └── {
│       role: string ('user' | 'agent'),
│       content: string,
│       timestamp: string (ISO-8601),
│       intent_summary?: string
│     }
├── detected_language: string (ISO 639-1)
├── intent_summary: string (original classification summary)
├── entities: map (extracted entities from classification)
├── ttl: timestamp (Firestore TTL field)
├── created_at: timestamp
├── updated_at: timestamp
└── closed_at: timestamp (only when status != 'active')

Composite Index:
Collection: sessions
Fields: user_id ASC, status ASC, ttl ASC
Purpose: Fast lookup of active sessions by user
```

## Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Session Lifecycle                               │
│                                                                      │
│  1. CREATE                                                          │
│     User sends first message                                        │
│     → create_session()                                              │
│     → status: 'active', ttl: now + 30m                              │
│                                                                      │
│  2. ACTIVE                                                          │
│     User and agent exchange messages                                │
│     → append_turn() for each message                                │
│     → ttl refreshed on each append                                  │
│     → workflow_state updated as needed                              │
│                                                                      │
│  3. BYPASS                                                          │
│     Mid-turn messages skip classification                           │
│     → Session middleware detects active session                     │
│     → Sets bypass_classifier = true                                 │
│     → Routes directly to active_agent                               │
│                                                                      │
│  4. CLOSE                                                           │
│     Agent returns workflow_complete: true                           │
│     → close_session(status)                                         │
│     → status: COMPLETED | ABANDONED | ERROR                         │
│     → ttl field deleted (Firestore GCs document)                    │
│     → Event published to Pub/Sub                                    │
│                                                                      │
│  5. EXPIRE                                                          │
│     Session inactive for 30 minutes                                 │
│     → Firestore TTL policy deletes document                         │
│     → No action needed by application                               │
│                                                                      │
│  6. RESUME (optional)                                               │
│     User returns after session closed                               │
│     → resume_session(prior_session_id)                              │
│     → New session created with prior turn_history                   │
│     → New session_id generated                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Testing

### Unit tests

```typescript
describe('session_management', () => {
  it('should create a new session', async () => {
    const result = await create_session({
      user_id: 'U01ABC123',
      employee_id: 'emp123',
      display_name: 'John Doe',
      detected_language: 'en',
      intent_summary: 'IT support request',
    });

    expect(result.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(result.status).toBe('active');
  });

  it('should append turns to a session', async () => {
    const session = await create_session({
      user_id: 'U01ABC123',
      employee_id: 'emp123',
      display_name: 'John Doe',
      detected_language: 'en',
      intent_summary: 'Test',
    });

    const userTurn = await append_turn({
      session_id: session.session_id,
      role: 'user',
      content: 'My laptop is broken',
      intent_summary: 'Hardware issue',
    });

    expect(userTurn.success).toBe(true);
    expect(userTurn.turn_count).toBe(1);

    const agentTurn = await append_turn({
      session_id: session.session_id,
      role: 'agent',
      content: 'I can help with that.',
    });

    expect(agentTurn.success).toBe(true);
    expect(agentTurn.turn_count).toBe(2);
  });

  it('should update workflow state', async () => {
    const session = await create_session({
      user_id: 'U01ABC123',
      employee_id: 'emp123',
      display_name: 'John Doe',
      detected_language: 'en',
      intent_summary: 'Test',
    });

    const result = await update_workflow_state({
      session_id: session.session_id,
      workflow_state: { step: 'collecting_info', ticket_id: 'TKT-123' },
    });

    expect(result.success).toBe(true);
    expect(result.previous_state).toEqual({});
  });

  it('should close a session', async () => {
    const session = await create_session({
      user_id: 'U01ABC123',
      employee_id: 'emp123',
      display_name: 'John Doe',
      detected_language: 'en',
      intent_summary: 'Test',
    });

    const result = await close_session({
      session_id: session.session_id,
      status: 'COMPLETED',
      summary: 'Issue resolved',
    });

    expect(result.success).toBe(true);
    expect(result.closed_at).toBeDefined();
  });

  it('should not find expired sessions', async () => {
    const session = await create_session({
      user_id: 'U01ABC123',
      employee_id: 'emp123',
      display_name: 'John Doe',
      detected_language: 'en',
      intent_summary: 'Test',
    });

    // Close the session
    await close_session({
      session_id: session.session_id,
      status: 'COMPLETED',
    });

    // Should not find it as active
    const result = await get_session({ session_id: session.session_id });
    expect(result.status).toBe('COMPLETED');
  });

  it('should resume a closed session', async () => {
    const session = await create_session({
      user_id: 'U01ABC123',
      employee_id: 'emp123',
      display_name: 'John Doe',
      detected_language: 'en',
      intent_summary: 'Test',
    });

    // Add some turns
    await append_turn({
      session_id: session.session_id,
      role: 'user',
      content: 'Hello',
    });
    await append_turn({
      session_id: session.session_id,
      role: 'agent',
      content: 'Hi there!',
    });

    // Close the session
    await close_session({
      session_id: session.session_id,
      status: 'COMPLETED',
    });

    // Resume
    const resumed = await resume_session({
      prior_session_id: session.session_id,
      user_id: 'U01ABC123',
    });

    expect(resumed.new_session_id).toBeDefined();
    expect(resumed.new_session_id).not.toBe(session.session_id);
    expect(resumed.carried_forward_turns).toBe(2);
  });
});
```

### Integration tests

```typescript
describe('session_management integration', () => {
  it('should handle concurrent turn appends', async () => {
    const session = await create_session({
      user_id: 'U01ABC123',
      employee_id: 'emp123',
      display_name: 'John Doe',
      detected_language: 'en',
      intent_summary: 'Test',
    });

    // Append turns concurrently
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        append_turn({
          session_id: session.session_id,
          role: 'user',
          content: `Message ${i}`,
        })
      );
    }

    const results = await Promise.all(promises);
    expect(results.every(r => r.success)).toBe(true);

    // Verify final turn count
    const finalSession = await get_session({
      session_id: session.session_id,
    });
    expect(finalSession.turn_history.length).toBe(10);
  });
});
