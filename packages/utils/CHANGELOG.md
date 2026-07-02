# @reaatech/agent-mesh-utils

## 1.1.1

### Patch Changes

- Updated dependencies [[`420c0f8`](https://github.com/reaatech/agent-mesh/commit/420c0f8be17446810124a4fb4073e455a6a4c900)]:
  - @reaatech/agent-mesh@1.2.0
  - @reaatech/agent-mesh-observability@1.0.2
  - @reaatech/agent-mesh-session@1.1.1

## 1.1.0

### Minor Changes

- [#37](https://github.com/reaatech/agent-mesh/pull/37) [`00427b3`](https://github.com/reaatech/agent-mesh/commit/00427b32ce7da4ab1037d7a20d1b071dc6a3279e) Thanks [@reaatech](https://github.com/reaatech)! - agent-mesh v-next groundwork — provider-agnostic, backend-agnostic, and host-embeddable, all additive and backward-compatible:

  - **classifier:** pluggable `ClassifierProvider` (+ `createClassifier`) — inject any intent classifier (self-hosted, a different provider, or a host-resolved model) instead of the hard-wired Gemini classifier. Default (no provider) is unchanged: Gemini with a mock fallback.
  - **session / utils:** pluggable `SessionStore` and `BreakerStore` with Firestore as the default implementation, dependency-free `InMemory*` adapters, and injection via `setSessionStore` / `setBreakerStore`. The exported service/module functions delegate to the active store; signatures unchanged. (Postgres/Redis adapters to follow.)
  - **core:** optional `metadata` passthrough on `IncomingRequest` / `ContextPacket` / `SessionRecord` so an embedding host can carry its own identifiers (e.g. a multi-tenant `orgId`) without the HR-specific `employee_id`; plus the `SessionStore` / `BreakerStore` / `LeaderState` interfaces.

  No breaking changes: the default behaviour (Gemini classifier, Firestore persistence, no metadata) is byte-for-byte unchanged.

### Patch Changes

- Updated dependencies [[`00427b3`](https://github.com/reaatech/agent-mesh/commit/00427b32ce7da4ab1037d7a20d1b071dc6a3279e)]:
  - @reaatech/agent-mesh@1.1.0
  - @reaatech/agent-mesh-session@1.1.0
  - @reaatech/agent-mesh-observability@1.0.1
