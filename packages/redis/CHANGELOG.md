# @reaatech/agent-mesh-redis

## 0.2.0

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

### Patch Changes

- Updated dependencies [[`420c0f8`](https://github.com/reaatech/agent-mesh/commit/420c0f8be17446810124a4fb4073e455a6a4c900)]:
  - @reaatech/agent-mesh@1.2.0
