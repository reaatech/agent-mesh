# Contributing to agent-mesh

Thank you for your interest in contributing to agent-mesh! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/reaatech/agent-mesh.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature`

## Development Workflow

### Prerequisites

- Node.js 22 LTS (see `.nvmrc`)
- npm or pnpm
- Docker (for local testing with emulators)

### Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test

# Build
npm run build
```

### With Docker

```bash
# Build and run with emulators
docker compose up --build

# Access services:
# - Orchestrator: http://localhost:8080
# - Jaeger UI: http://localhost:16686
# - Firestore Emulator: http://localhost:8040
```

## Code Standards

### TypeScript

- Strict mode enabled
- No `any` types without justification
- All exports must have type definitions

### Linting

```bash
# Check linting
npm run lint

# Auto-fix
npm run lint:fix
```

### Formatting

```bash
# Check formatting
npm run format:check

# Auto-format
npm run format
```

## Testing

### Running Tests

```bash
# All tests
npm run test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Categories

- **Unit tests**: Test individual modules in isolation
- **Contract tests**: Validate API contracts and schemas
- **Integration tests**: Test component interactions

### Writing Tests

- Use descriptive test names
- Test both success and failure paths
- Mock external dependencies
- Aim for 80%+ coverage

## Pull Request Process

1. **Create PR**: Open a PR against `main` branch
2. **Fill template**: Complete the PR template
3. **Pass CI**: All checks must pass
4. **Review**: Address review feedback
5. **Merge**: Maintainers will merge when ready

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Tests added/updated and passing
- [ ] Documentation updated
- [ ] No proprietary references
- [ ] No hardcoded values
- [ ] Commit messages are descriptive

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add circuit breaker persistence
fix: resolve session TTL refresh issue
docs: update README with deployment guide
refactor: simplify confidence gate logic
test: add routing contract tests
```

## Reporting Issues

- Use the issue templates
- Include environment details
- Provide reproduction steps
- Add logs when relevant

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
