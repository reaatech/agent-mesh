# Multi-stage build for agent-mesh orchestrator
# Target image size: <100MB

# Stage 1: Build
FROM node:26-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

# Copy workspace config files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.json ./
COPY .npmrc ./

# Copy all workspace packages and examples
COPY packages/ ./packages/
COPY examples/ ./examples/

# Copy agent configs
COPY agents/ ./agents/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm build

# Stage 2: Production
FROM node:26-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

# Copy workspace config
COPY --from=builder --chown=nodejs:nodejs /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=nodejs:nodejs /app/pnpm-lock.yaml ./
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/.npmrc ./

# Copy built packages
COPY --from=builder --chown=nodejs:nodejs /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=nodejs:nodejs /app/packages/core/dist/ ./packages/core/dist/
COPY --from=builder --chown=nodejs:nodejs /app/packages/observability/package.json ./packages/observability/
COPY --from=builder --chown=nodejs:nodejs /app/packages/observability/dist/ ./packages/observability/dist/
COPY --from=builder --chown=nodejs:nodejs /app/packages/utils/package.json ./packages/utils/
COPY --from=builder --chown=nodejs:nodejs /app/packages/utils/dist/ ./packages/utils/dist/
COPY --from=builder --chown=nodejs:nodejs /app/packages/registry/package.json ./packages/registry/
COPY --from=builder --chown=nodejs:nodejs /app/packages/registry/dist/ ./packages/registry/dist/
COPY --from=builder --chown=nodejs:nodejs /app/packages/session/package.json ./packages/session/
COPY --from=builder --chown=nodejs:nodejs /app/packages/session/dist/ ./packages/session/dist/
COPY --from=builder --chown=nodejs:nodejs /app/packages/classifier/package.json ./packages/classifier/
COPY --from=builder --chown=nodejs:nodejs /app/packages/classifier/dist/ ./packages/classifier/dist/
COPY --from=builder --chown=nodejs:nodejs /app/packages/confidence/package.json ./packages/confidence/
COPY --from=builder --chown=nodejs:nodejs /app/packages/confidence/dist/ ./packages/confidence/dist/
COPY --from=builder --chown=nodejs:nodejs /app/packages/router/package.json ./packages/router/
COPY --from=builder --chown=nodejs:nodejs /app/packages/router/dist/ ./packages/router/dist/
COPY --from=builder --chown=nodejs:nodejs /app/packages/gateway/package.json ./packages/gateway/
COPY --from=builder --chown=nodejs:nodejs /app/packages/gateway/dist/ ./packages/gateway/dist/
COPY --from=builder --chown=nodejs:nodejs /app/packages/mcp-server/package.json ./packages/mcp-server/
COPY --from=builder --chown=nodejs:nodejs /app/packages/mcp-server/dist/ ./packages/mcp-server/dist/

# Copy orchestrator example
COPY --from=builder --chown=nodejs:nodejs /app/examples/orchestrator/package.json ./examples/orchestrator/
COPY --from=builder --chown=nodejs:nodejs /app/examples/orchestrator/dist/ ./examples/orchestrator/dist/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy agent configs
COPY --from=builder --chown=nodejs:nodejs /app/agents ./agents

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start with dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "examples/orchestrator/dist/index.js"]
