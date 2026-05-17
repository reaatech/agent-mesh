/**
 * agent-mesh — Multi-agent orchestrator
 * Main entry point
 */

import './otel.js';
import { env, MAX_REQUEST_BODY_SIZE, SERVICE_NAME, SERVICE_VERSION } from '@reaatech/agent-mesh';
import {
  authMiddleware,
  deepHealthCheck,
  handleRequest,
  healthCheck,
  rateLimiterMiddleware,
  tlsMiddleware,
} from '@reaatech/agent-mesh-gateway';
import { mcpMiddleware, messageHandler, sseHandler } from '@reaatech/agent-mesh-mcp-server';
import { logger } from '@reaatech/agent-mesh-observability';
import { initRegistry, setupSighupHandler } from '@reaatech/agent-mesh-registry';
import {
  startCircuitBreakerPersistence,
  stopCircuitBreakerPersistence,
} from '@reaatech/agent-mesh-utils';
import express from 'express';

async function main(): Promise<void> {
  logger.info('Starting agent-mesh', { service: SERVICE_NAME, version: SERVICE_VERSION });

  await initRegistry();

  setupSighupHandler();

  if (env.ENABLE_CIRCUIT_BREAKER) {
    startCircuitBreakerPersistence().catch((err: Error) => {
      logger.error('Failed to start circuit breaker persistence', { err, service: SERVICE_NAME });
    });
  }

  const app = express();

  app.set('trust proxy', 1);
  app.use(tlsMiddleware);

  app.use(express.json({ limit: MAX_REQUEST_BODY_SIZE }));
  app.use(express.urlencoded({ extended: true, limit: MAX_REQUEST_BODY_SIZE }));
  app.use(rateLimiterMiddleware);
  app.use(mcpMiddleware);

  app.get('/health', healthCheck);
  app.get('/health/deep', deepHealthCheck);

  app.get('/mcp/sse', authMiddleware, sseHandler);
  app.post('/mcp/messages', authMiddleware, messageHandler);

  app.post('/v1/request', authMiddleware, handleRequest);

  app.use((_req, res) => {
    res.status(404).json({
      error: 'Not found',
      path: _req.path,
    });
  });

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled error', { err, service: SERVICE_NAME });
      res.status(500).json({
        error: 'Internal server error',
        message: env.NODE_ENV === 'development' ? err.message : 'An error occurred',
      });
    },
  );

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
