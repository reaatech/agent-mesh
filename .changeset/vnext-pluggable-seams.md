---
'@reaatech/agent-mesh': minor
'@reaatech/agent-mesh-classifier': minor
'@reaatech/agent-mesh-session': minor
'@reaatech/agent-mesh-utils': minor
---

agent-mesh v-next groundwork — provider-agnostic, backend-agnostic, and host-embeddable, all additive and backward-compatible:

- **classifier:** pluggable `ClassifierProvider` (+ `createClassifier`) — inject any intent classifier (self-hosted, a different provider, or a host-resolved model) instead of the hard-wired Gemini classifier. Default (no provider) is unchanged: Gemini with a mock fallback.
- **session / utils:** pluggable `SessionStore` and `BreakerStore` with Firestore as the default implementation, dependency-free `InMemory*` adapters, and injection via `setSessionStore` / `setBreakerStore`. The exported service/module functions delegate to the active store; signatures unchanged. (Postgres/Redis adapters to follow.)
- **core:** optional `metadata` passthrough on `IncomingRequest` / `ContextPacket` / `SessionRecord` so an embedding host can carry its own identifiers (e.g. a multi-tenant `orgId`) without the HR-specific `employee_id`; plus the `SessionStore` / `BreakerStore` / `LeaderState` interfaces.

No breaking changes: the default behaviour (Gemini classifier, Firestore persistence, no metadata) is byte-for-byte unchanged.
