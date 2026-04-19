# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- (No changes yet)

### Changed
- (No changes yet)

### Deprecated
- (No changes yet)

### Removed
- (No changes yet)

### Fixed
- (No changes yet)

### Security
- (No changes yet)

## [1.0.0] - 2026-04-18

### Added

- **YAML Agent Registry** — Hot-reload agent configs via SIGHUP, no restart needed
- **Confidence-Gated Routing** — Gemini-powered intent classification with clarification fallback
- **Per-Agent Circuit Breakers** — Prevents cascading failures with persisted state
- **Session Bypass** — Active sessions skip classification for mid-turn consistency
- **MCP Protocol** — Standard Model Context Protocol for agent communication
- **SSRF Protection** — Endpoint URL validation rejects private IPs
- **Rate Limiting** — Token bucket per-client with configurable limits
- **Slack Profile Resolution** — Employee identity from Slack user IDs
- **OpenTelemetry Observability** — Tracing, metrics, and structured logging with PII redaction

### Architecture

- **Stateless Core** — All session state in Firestore, horizontal scaling enabled
- **Gateway Middleware** — Auth → Rate Limit → Session → TLS pipeline
- **Classifier Service** — Gemini Flash with rate limit retry and exponential backoff
- **Circuit Breaker Persistence** — Leader-elected Firestore storage with cross-instance sync
- **Clarification Cache** — LRU cache for generated questions with localized fallbacks

### Infrastructure

- **Docker Multi-stage Build** — <100MB target image
- **docker-compose** — Local dev with Firestore and Pub/Sub emulators
- **Terraform Modules** — AWS ECS, Azure Container Apps, GCP Cloud Run, OCI OKE, Netlify, Vercel
- **GitHub Actions CI/CD** — PR checks, release workflow

### Documentation

- **README.md** — Quick start and feature overview
- **AGENTS.md** — Agent development and integration guide
- **ARCHITECTURE.md** — System design deep dive
- **DEV_PLAN.md** — Complete development checklist
- **Skill Definitions** — routing, circuit-breaker, session-management, clarification

### Testing

- **Contract Tests** — Registry, protocol, and routing compliance
- **Unit Tests** — 79%+ coverage with Vitest
- **E2E Tests** — Full pipeline integration tests
- **Security Tests** — Auth bypass, rate limit evasion, SSRF, prompt injection
- **Performance Tests** — Session lookup latency, classifier benchmarks