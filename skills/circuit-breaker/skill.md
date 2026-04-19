# Circuit Breaker

## Capability

Agent resilience and failure isolation — prevents cascading failures by stopping
requests to agents that are consistently failing, while providing a path to
recovery through controlled testing.

## MCP Tools

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `check_circuit_state` | `{ agent_id: string }` | `{ state: 'CLOSED' \| 'OPEN' \| 'HALF_OPEN', failure_count: number, last_failure_time?: number }` | Unlimited |
| `record_success` | `{ agent_id: string }` | `{ state: CircuitState, success: boolean }` | Unlimited |
| `record_failure` | `{ agent_id: string, error?: { code: string, message: string } }` | `{ state: CircuitState, opened: boolean }` | Unlimited |
| `reset_circuit` | `{ agent_id: string }` | `{ success: boolean, previous_state: CircuitState }` | 10 RPM |
| `get_all_states` | `{}` | `{ states: Map<agent_id, CircuitState> }` | 10 RPM |

## Usage Examples

### Example 1: Check circuit state before dispatch

**User intent:** Verify agent is available before sending request

**Tool call:**
```json
{
  "agent_id": "it-helpdesk"
}
```

**Expected response (healthy agent):**
```json
{
  "state": "CLOSED",
  "failure_count": 0,
  "last_failure_time": null
}
```

**Expected response (unhealthy agent):**
```json
{
  "state": "OPEN",
  "failure_count": 5,
  "last_failure_time": 1713225600000
}
```

### Example 2: Record successful agent response

**User intent:** Update circuit breaker after successful agent call

**Tool call:**
```json
{
  "agent_id": "it-helpdesk"
}
```

**Expected response:**
```json
{
  "state": "CLOSED",
  "success": true
}
```

### Example 3: Record agent failure

**User intent:** Update circuit breaker after agent error

**Tool call:**
```json
{
  "agent_id": "it-helpdesk",
  "error": {
    "code": "TIMEOUT",
    "message": "Agent did not respond within 30s"
  }
}
```

**Expected response (threshold reached):**
```json
{
  "state": "OPEN",
  "opened": true
}
```

**Expected response (below threshold):**
```json
{
  "state": "CLOSED",
  "opened": false
}
```

### Example 4: Manual circuit reset

**User intent:** Operator manually resets circuit after fixing agent

**Tool call:**
```json
{
  "agent_id": "it-helpdesk"
}
```

**Expected response:**
```json
{
  "success": true,
  "previous_state": "OPEN"
}
```

## Error Handling

### Known failure modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `AGENT_NOT_FOUND` | Agent ID not in registry | Return CLOSED state (allow traffic) |
| `FIRESTORE_UNAVAILABLE` | Firestore connection failed | Use in-memory state, log warning |
| `LEADER_ELECTION_FAILED` | Failed to acquire leadership | Continue as follower, skip persistence |
| `QUOTA_EXCEEDED` | Firestore write quota exceeded | Retry with exponential backoff |

### Recovery strategies

1. **Firestore failures** — Fall back to in-memory state. Circuit breaker
   continues to function but state won't persist across restarts.

2. **Leader election failures** — Continue operating as follower. In-memory
   state works normally; persistence handled by current leader.

3. **Quota exceeded** — Exponential backoff (1s, 2s, 4s) up to 3 retries.
   If all fail, continue with in-memory state.

### Escalation paths

- **Circuit OPEN for > 5 minutes** → Alert on-call engineer
- **Multiple agents OPEN** → Check infrastructure health
- **Persistent leader election failures** → Check Firestore connectivity

## Security Considerations

### PII handling

- **Never log agent response content** — Only log state transitions
- **Never include user data in circuit breaker events** — Use agent_id only
- **Hash request identifiers in logs** — Use one-way hash for correlation

### Permission requirements

- Firestore read/write for state persistence
- No external API access required
- Service account needs Datastore user role

### Audit logging

Log these events for compliance:
- Circuit state transitions (CLOSED → OPEN, OPEN → HALF_OPEN, etc.)
- Manual resets (with operator ID)
- Leader election changes
- Persistent failures (> 5 minutes OPEN)

### Rate limiting

- State checks are unlimited (needed for every request)
- Manual resets limited to 10 RPM (prevent accidental mass resets)
- State queries limited to 10 RPM (expensive operation)

## Performance Characteristics

| Metric | Target | Measurement |
|--------|--------|-------------|
| State check latency (p50) | < 1ms | In-memory lookup |
| State check latency (p99) | < 5ms | Including Firestore sync |
| State transition latency | < 10ms | In-memory update |
| Persistence latency | < 100ms | Firestore write (async) |
| Memory overhead | < 1KB per agent | In-memory state storage |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | `5` | Failures before opening circuit |
| `CIRCUIT_BREAKER_RESET_TIMEOUT_MS` | `30000` | Time before recovery attempt (30s) |
| `CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS` | `3` | Test calls in half-open state |
| `CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS` | `60000` | Max time in half-open state (60s) |
| `CIRCUIT_BREAKER_BACKOFF_MULTIPLIER` | `2` | Exponential backoff multiplier |
| `CIRCUIT_BREAKER_MAX_BACKOFF` | `8` | Maximum backoff multiplier |
| `CB_SYNC_INTERVAL_MS` | `5000` | Firestore sync interval (5s) |
| `CB_LEADER_LEASE_MS` | `15000` | Leader lease duration (15s) |
| `CB_LEADER_RENEWAL_MS` | `5000` | Leader renewal interval (5s) |

## State Machine

```
                    ┌─────────────┐
              ┌────▶│   CLOSED    │◀────┐
              │     │  (healthy)  │     │
              │     └──────┬──────┘     │
              │            │            │
              │     failures >= 5       │ successes >= expected
              │            │            │
              │            ▼            │
              │     ┌──────────────┐    │
              │     │    OPEN      │    │
              │     │ (unhealthy)  │    │
              │     └──────┬───────┘    │
              │            │            │
              │   timeout * backoff     │
              │            │            │
              │            ▼            │
              └─────┌──────────────┐    │
                    │  HALF_OPEN   │────┘
                    │  (testing)   │
                    └──────────────┘

Rules:
- CLOSED: All requests allowed
- OPEN: All requests rejected immediately
- HALF_OPEN: Limited test requests (3), must all succeed to close
- Exponential backoff on each OPEN → HALF_OPEN transition
- Timeout in HALF_OPEN forces back to OPEN
```

## Persistence Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Firestore Persistence                             │
│                                                                      │
│  Collection: circuit_breaker_states                                 │
│  Document ID: {agent_id}                                            │
│                                                                      │
│  Fields:                                                            │
│  - agent_id: string                                                 │
│  - state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'                           │
│  - failure_count: number                                            │
│  - success_count: number                                            │
│  - last_failure_time: timestamp | null                              │
│  - last_state_change: timestamp                                     │
│  - total_calls: number                                              │
│  - total_failures: number                                           │
│  - total_successes: number                                          │
│  - half_open_calls: number                                          │
│  - backoff_multiplier: number                                       │
│  - updated_at: timestamp                                            │
│                                                                      │
│  Leader Election Collection: circuit_breaker_leaders                │
│  Document ID: 'circuit_breaker_sync'                                │
│                                                                      │
│  Fields:                                                            │
│  - leader_id: string (instance ID)                                  │
│  - acquired_at: timestamp                                           │
│  - lease_expires_at: timestamp                                      │
│  - fencing_token: number                                            │
│  - updated_at: timestamp                                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Testing

### Unit tests

```typescript
describe('circuit_breaker', () => {
  it('should start in CLOSED state', () => {
    const state = check_circuit_state({ agent_id: 'test-agent' });
    expect(state.state).toBe('CLOSED');
    expect(state.failure_count).toBe(0);
  });

  it('should open after threshold failures', () => {
    for (let i = 0; i < 5; i++) {
      record_failure({ agent_id: 'test-agent' });
    }
    const state = check_circuit_state({ agent_id: 'test-agent' });
    expect(state.state).toBe('OPEN');
  });

  it('should reject requests when OPEN', () => {
    // Open the circuit
    for (let i = 0; i < 5; i++) {
      record_failure({ agent_id: 'test-agent' });
    }

    const state = check_circuit_state({ agent_id: 'test-agent' });
    expect(state.state).toBe('OPEN');
  });

  it('should transition to HALF_OPEN after timeout', async () => {
    // Open the circuit
    for (let i = 0; i < 5; i++) {
      record_failure({ agent_id: 'test-agent' });
    }

    // Wait for reset timeout
    await sleep(35000); // 35s > 30s default

    // Should transition to HALF_OPEN on next check
    const state = check_circuit_state({ agent_id: 'test-agent' });
    expect(state.state).toBe('HALF_OPEN');
  });

  it('should close after successful HALF_OPEN tests', () => {
    // Set up HALF_OPEN state
    setManualState('test-agent', 'HALF_OPEN', { expectedCalls: 3 });

    // Record 3 successes
    for (let i = 0; i < 3; i++) {
      record_success({ agent_id: 'test-agent' });
    }

    const state = check_circuit_state({ agent_id: 'test-agent' });
    expect(state.state).toBe('CLOSED');
  });

  it('should reopen on failure during HALF_OPEN', () => {
    // Set up HALF_OPEN state
    setManualState('test-agent', 'HALF_OPEN', { expectedCalls: 3 });

    // Record 2 successes
    record_success({ agent_id: 'test-agent' });
    record_success({ agent_id: 'test-agent' });

    // Record 1 failure
    record_failure({ agent_id: 'test-agent' });

    const state = check_circuit_state({ agent_id: 'test-agent' });
    expect(state.state).toBe('OPEN');
  });

  it('should apply exponential backoff', () => {
    // Open circuit multiple times
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < 5; i++) {
        record_failure({ agent_id: 'test-agent' });
      }
      // Reset for next cycle
      reset_circuit({ agent_id: 'test-agent' });
    }

    // Backoff multiplier should increase
    const state = getInternalState('test-agent');
    expect(state.backoffMultiplier).toBeGreaterThan(1);
  });
});
```

### Integration tests

```typescript
describe('circuit_breaker persistence', () => {
  it('should persist state to Firestore', async () => {
    // Open circuit
    for (let i = 0; i < 5; i++) {
      record_failure({ agent_id: 'persist-test' });
    }

    // Persist to Firestore
    await persistCircuitBreakerState();

    // Verify in Firestore
    const doc = await getFirestore()
      .collection('circuit_breaker_states')
      .doc('persist-test')
      .get();

    expect(doc.exists).toBe(true);
    expect(doc.data().state).toBe('OPEN');
  });

  it('should restore state from Firestore on startup', async () => {
    // Set up Firestore state
    await getFirestore()
      .collection('circuit_breaker_states')
      .doc('restore-test')
      .set({
        agent_id: 'restore-test',
        state: 'OPEN',
        failure_count: 5,
        last_state_change: Timestamp.now(),
      });

    // Load state
    await loadCircuitBreakerState();

    // Verify restored
    const state = check_circuit_state({ agent_id: 'restore-test' });
    expect(state.state).toBe('OPEN');
  });
});
