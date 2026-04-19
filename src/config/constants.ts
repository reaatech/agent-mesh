/**
 * Shared constants used across the application
 */

export const SERVICE_NAME = 'agent-mesh';
export const SERVICE_VERSION = '1.0.0';

/** Maximum size for YAML agent config files (1MB) */
export const MAX_YAML_FILE_SIZE = 1024 * 1024;

/** Maximum request body size */
export const MAX_REQUEST_BODY_SIZE = '1mb';

/** Default session TTL in milliseconds */
export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

/** Maximum turn history length */
export const MAX_TURN_HISTORY = 100;

/** Timeout for health check requests */
export const HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Cache TTL for various lookups */
export const CACHE_TTL = {
  /** API key cache: 5 minutes */
  API_KEY_MS: 5 * 60 * 1000,
  /** Slack profile cache: 10 minutes */
  SLACK_PROFILE_MS: 10 * 60 * 1000,
  /** Clarification question cache: 5 minutes */
  CLARIFICATION_MS: 5 * 60 * 1000,
} as const;

/** Rate limit headers */
export const RATE_LIMIT_HEADERS = {
  LIMIT: 'X-RateLimit-Limit',
  REMAINING: 'X-RateLimit-Remaining',
  RESET: 'X-RateLimit-Reset',
  RETRY_AFTER: 'Retry-After',
} as const;

/** SSRF protection: private IP ranges to reject */
export const PRIVATE_IP_RANGES = [
  /^127\..*/,           // Loopback
  /^10\..*/,            // Private Class A
  /^172\.(1[6-9]|2\d|3[0-1])\..*/,  // Private Class B
  /^192\.168\..*/,      // Private Class C
  /^169\.254\..*/,      // Link-local
  /^::1$/,              // IPv6 loopback
  /^fc00:.*/i,          // IPv6 unique local
  /^fe80:.*/i,          // IPv6 link-local
  /^localhost$/i,
  /^\[::1\]$/,
  /^::ffff:/i,          // IPv4-mapped IPv6 (::ffff:192.168.1.1)
] as const;

/** Supported languages for clarification questions */
export const SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'ja',
  'zh', 'ko', 'ar', 'hi', 'tr', 'vi', 'th', 'id', 'ms', 'tl',
  'sv', 'no', 'da', 'fi', 'cs', 'hu', 'ro', 'uk', 'el', 'he',
  'bn', 'ta', 'te', 'mr', 'ur', 'fa', 'sw', 'am', 'ne', 'si',
  'my', 'km', 'lo', 'ka', 'hy', 'az', 'uz', 'kk', 'mn', 'bo',
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

/** Default language when detection fails */
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/** Pub/Sub topic names */
export const PUBSUB_TOPICS = {
  SESSION_EVENTS: 'session-events',
} as const;

/** Firestore collection names */
export const FIRESTORE_COLLECTIONS = {
  SESSIONS: 'sessions',
  CIRCUIT_BREAKERS: 'circuit-breakers',
  LEADER_ELECTION: 'leader-election',
} as const;

/** MCP protocol constants */
export const MCP = {
  PROTOCOL_VERSION: '2024-11-05',
  TOOLS_CALL_METHOD: 'tools/call',
  HANDLE_MESSAGE_TOOL: 'handle_message',
} as const;

/** Confidence threshold boundaries */
export const CONFIDENCE = {
  MIN: 0,
  MAX: 1,
  DEFAULT_THRESHOLD: 0.7,
  DEFAULT_AGENT_THRESHOLD: 0,
} as const;

/** Session configuration */
export const SESSION = {
  /** Default TTL: 30 minutes */
  TTL_MS: 30 * 60 * 1000,
  /** Maximum turns in history */
  MAX_TURNS: 100,
} as const;

export const HEALTH_CHECK_COLLECTION = '__health__';
