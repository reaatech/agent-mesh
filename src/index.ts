/**
 * agent-mesh — Multi-agent orchestrator
 * Main entry point
 */

import './observability/otel.js';
import express from 'express';
import { env } from './config/env.js';
import { initRegistry } from './registry/registry.loader.js';
import { setupSighupHandler } from './registry/sighup.js';
import { authMiddleware } from './gateway/auth.middleware.js';
import { healthCheck, deepHealthCheck, handleRequest } from './gateway/entry.handler.js';
import { SERVICE_NAME, SERVICE_VERSION, MAX_REQUEST_BODY_SIZE } from './config/constants.js';
import { rateLimiterMiddleware } from './gateway/rateLimiter.middleware.js';
import { tlsMiddleware } from './gateway/tls.middleware.js';
import { mcpMiddleware } from './mcp-server/mcpServer.js';
import { messageHandler, sseHandler } from './mcp-server/orchestrator.mcp.js';
import {
  startCircuitBreakerPersistence,
  stopCircuitBreakerPersistence,
} from './utils/circuitBreaker.persistence.js';
import { logger } from './observability/logger.js';

async function main(): Promise<void> {
  logger.info('Starting agent-mesh', { service: SERVICE_NAME, version: SERVICE_VERSION });

  await initRegistry();

  setupSighupHandler();

  if (env.ENABLE_CIRCUIT_BREAKER) {
    startCircuitBreakerPersistence().catch((err: Error) => {
      logger.error('Failed to start circuit breaker persistence', { err, service: SERVICE_NAME });
    });
  }

  // Create Express app
  const app = express();

  // Trust proxy for rate limiting
  app.set('trust proxy', 1);
  app.use(tlsMiddleware);

  // Body parsing
  app.use(express.json({ limit: MAX_REQUEST_BODY_SIZE }));
  app.use(express.urlencoded({ extended: true, limit: MAX_REQUEST_BODY_SIZE }));
  app.use(rateLimiterMiddleware);
  app.use(mcpMiddleware);

  // Health endpoints (no auth required)
  app.get('/health', healthCheck);
  app.get('/health/deep', deepHealthCheck);

  // MCP endpoints (auth required)
  app.get('/mcp/sse', authMiddleware, sseHandler);
  app.post('/mcp/messages', authMiddleware, messageHandler);

  // API routes (auth required)
  app.post('/v1/request', authMiddleware, handleRequest);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      error: 'Not found',
      path: _req.path,
    });
  });

  // Error handler
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled error', { err, service: SERVICE_NAME });
      res.status(500).json({
        error: 'Internal server error',
        message: env.NODE_ENV === 'development' ? err.message : 'An error occurred',
      });
    },
  );

  // Start server
  const server = app.listen(env.PORT, () => {
    logger.info('Listening', {
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
    });
    logger.info(`Health: http://localhost:${env.PORT}/health`, { service: SERVICE_NAME });
    logger.info(`Deep health: http://localhost:${env.PORT}/health/deep`, { service: SERVICE_NAME });
    logger.info(`API: POST http://localhost:${env.PORT}/v1/request`, { service: SERVICE_NAME });
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Shutting down gracefully', { service: SERVICE_NAME, signal });
    stopCircuitBreakerPersistence();
    server.close(() => {
      logger.info('Server closed', { service: SERVICE_NAME });
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout', { service: SERVICE_NAME });
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: Error) => {
  logger.error('Failed to start', { err, service: SERVICE_NAME });
  process.exit(1);
});
