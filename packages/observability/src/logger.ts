import { SERVICE_NAME } from '@reaatech/agent-mesh';
import { env } from '@reaatech/agent-mesh';
import winston from 'winston';

const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /\d{3}-\d{2}-\d{4}/g,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  /\+?[\d\s-()]{10,}/g,
];

function redactPii(value: string): string {
  let redacted = value;
  for (const pattern of PII_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = redactPii(value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const structuredFormat = winston.format.combine(
  winston.format.timestamp({
    format: () => new Date().toISOString(),
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(
    ({ timestamp, level, message, service, request_id, session_id, ...meta }) => {
      const logEntry: Record<string, unknown> = {
        timestamp,
        level,
        service: service || SERVICE_NAME,
        message,
      };

      if (request_id) {
        logEntry.request_id = request_id;
      }
      if (session_id) {
        logEntry.session_id = session_id;
      }

      const redactedMeta = redactObject(meta as Record<string, unknown>);
      Object.assign(logEntry, redactedMeta);

      return JSON.stringify(logEntry);
    },
  ),
);

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: structuredFormat,
  defaultMeta: {
    service: SERVICE_NAME,
  },
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error', 'warn'],
    }),
  ],
});

export function createChildLogger(context: Record<string, string>): winston.Logger {
  return logger.child(context);
}

export { logger };
export type { winston };
