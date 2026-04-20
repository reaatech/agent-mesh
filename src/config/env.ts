/**
 * Zod-validated environment configuration
 * Fail-fast on missing required vars, sensible defaults for non-secrets
 */

import { z } from 'zod';
import { logger } from '../observability/logger.js';

const EnvironmentSchema = z.object({
  // Server
  PORT: z.coerce.number().min(1).max(65535).default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // GCP
  GOOGLE_CLOUD_PROJECT: z.string().min(1),
  GOOGLE_CLOUD_REGION: z.string().default('us-central1'),

  // Firestore
  FIRESTORE_DATABASE: z.string().default('(default)'),

  // Vertex AI
  VERTEX_AI_LOCATION: z.string().default('us-central1'),
  VERTEX_AI_MODEL: z.string().default('gemini-2.0-flash'),

  // Secrets
  API_KEY: z.string().min(1),
  API_KEY_SECRET_NAME: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),

  // Observability
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Circuit Breaker
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().min(1).default(5),
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: z.coerce.number().min(1000).default(30000),
  CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS: z.coerce.number().min(1).default(3),
  CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS: z.coerce.number().min(1000).default(60000),
  CB_SYNC_INTERVAL_MS: z.coerce.number().min(1000).default(5000),
  CB_LEADER_LEASE_MS: z.coerce.number().min(1000).default(15000),
  CB_LEADER_RENEWAL_MS: z.coerce.number().min(1000).default(5000),

  // Session
  SESSION_TTL_MINUTES: z.coerce.number().min(1).max(1440).default(30),
  SESSION_MAX_TURNS: z.coerce.number().min(1).max(1000).default(100),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().min(1000).default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().min(1).default(100),

  // Agent Registry
  AGENT_REGISTRY_DIR: z.string().default('./agents'),

  // MCP
  MCP_REQUEST_TIMEOUT_MS: z.coerce.number().min(1000).default(30000),
  MCP_MAX_RETRIES: z.coerce.number().min(0).max(5).default(3),

  // Feature Flags
  ENABLE_SESSION_BYPASS: z.coerce.boolean().default(true),
  ENABLE_CLARIFICATION: z.coerce.boolean().default(true),
  ENABLE_CIRCUIT_BREAKER: z.coerce.boolean().default(true),
  ENABLE_RATE_LIMITING: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof EnvironmentSchema>;

function loadEnv(): Env {
  const result = EnvironmentSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n');
    logger.error('Environment validation failed', { errors });
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
