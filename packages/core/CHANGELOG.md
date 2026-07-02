# @reaatech/agent-mesh

## 1.2.0

### Minor Changes

- [#39](https://github.com/reaatech/agent-mesh/pull/39) [`420c0f8`](https://github.com/reaatech/agent-mesh/commit/420c0f8be17446810124a4fb4073e455a6a4c900) Thanks [@reaatech](https://github.com/reaatech)! - agent-mesh v-next, part 2 — in-process transport and Postgres/Redis persistence:

  - **router / core: in-process transport.** Agents can now be dispatched in-process
    (`type: 'inprocess'`, no HTTP hop) via `registerInProcessAgent`, alongside the MCP
    transport. `dispatchToAgent` routes by `agent.type` and threads an optional
    `metadata` passthrough (e.g. a tenant `orgId`) into the `ContextPacket`. Existing
    `type: 'mcp'` agents are unchanged.
  - **core: consolidate the duplicated `AgentConfig`.** It was defined in both core and
    the registry; it now lives once in core (with the SSRF-safe endpoint check) and the
    registry re-exports it. `type` is `enum(['mcp','inprocess'])` and `endpoint` is
    optional (required for mcp via a refine).
  - **new `@reaatech/agent-mesh-postgres`** — Postgres-backed `SessionStore` +
    `BreakerStore` adapters (+ `ensureSchema` / `SCHEMA_SQL`), leader election via a
    single-row lease with `SELECT … FOR UPDATE`.
  - **new `@reaatech/agent-mesh-redis`** — Redis-backed `SessionStore` + `BreakerStore`
    adapters, leader election via a `SET NX PX` lease.

  Docs, examples, and package READMEs updated for the pluggable classifier/persistence
  and the in-process transport.

## 1.1.0

### Minor Changes

- [#37](https://github.com/reaatech/agent-mesh/pull/37) [`00427b3`](https://github.com/reaatech/agent-mesh/commit/00427b32ce7da4ab1037d7a20d1b071dc6a3279e) Thanks [@reaatech](https://github.com/reaatech)! - agent-mesh v-next groundwork — provider-agnostic, backend-agnostic, and host-embeddable, all additive and backward-compatible:

  - **classifier:** pluggable `ClassifierProvider` (+ `createClassifier`) — inject any intent classifier (self-hosted, a different provider, or a host-resolved model) instead of the hard-wired Gemini classifier. Default (no provider) is unchanged: Gemini with a mock fallback.
  - **session / utils:** pluggable `SessionStore` and `BreakerStore` with Firestore as the default implementation, dependency-free `InMemory*` adapters, and injection via `setSessionStore` / `setBreakerStore`. The exported service/module functions delegate to the active store; signatures unchanged. (Postgres/Redis adapters to follow.)
  - **core:** optional `metadata` passthrough on `IncomingRequest` / `ContextPacket` / `SessionRecord` so an embedding host can carry its own identifiers (e.g. a multi-tenant `orgId`) without the HR-specific `employee_id`; plus the `SessionStore` / `BreakerStore` / `LeaderState` interfaces.

  No breaking changes: the default behaviour (Gemini classifier, Firestore persistence, no metadata) is byte-for-byte unchanged.
