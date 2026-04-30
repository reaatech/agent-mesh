export const SERVICE_NAME = 'agent-mesh';
export const SERVICE_VERSION = '1.0.0';

export const MAX_YAML_FILE_SIZE = 1024 * 1024;

export const MAX_REQUEST_BODY_SIZE = '1mb';

export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

export const MAX_TURN_HISTORY = 100;

export const HEALTH_CHECK_TIMEOUT_MS = 5000;

export const CACHE_TTL = {
  API_KEY_MS: 5 * 60 * 1000,
  SLACK_PROFILE_MS: 10 * 60 * 1000,
  CLARIFICATION_MS: 5 * 60 * 1000,
} as const;

export const RATE_LIMIT_HEADERS = {
  LIMIT: 'X-RateLimit-Limit',
  REMAINING: 'X-RateLimit-Remaining',
  RESET: 'X-RateLimit-Reset',
  RETRY_AFTER: 'Retry-After',
} as const;

export const PRIVATE_IP_RANGES = [
  /^127\..*/,
  /^10\..*/,
  /^172\.(1[6-9]|2\d|3[0-1])\..*/,
  /^192\.168\..*/,
  /^169\.254\..*/,
  /^::1$/,
  /^fc00:.*/i,
  /^fe80:.*/i,
  /^localhost$/i,
  /^\[::1\]$/,
  /^::ffff:/i,
] as const;

export const SUPPORTED_LANGUAGES = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'pl',
  'ru',
  'ja',
  'zh',
  'ko',
  'ar',
  'hi',
  'tr',
  'vi',
  'th',
  'id',
  'ms',
  'tl',
  'sv',
  'no',
  'da',
  'fi',
  'cs',
  'hu',
  'ro',
  'uk',
  'el',
  'he',
  'bn',
  'ta',
  'te',
  'mr',
  'ur',
  'fa',
  'sw',
  'am',
  'ne',
  'si',
  'my',
  'km',
  'lo',
  'ka',
  'hy',
  'az',
  'uz',
  'kk',
  'mn',
  'bo',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const PUBSUB_TOPICS = {
  SESSION_EVENTS: 'session-events',
} as const;

export const FIRESTORE_COLLECTIONS = {
  SESSIONS: 'sessions',
  CIRCUIT_BREAKERS: 'circuit-breakers',
  LEADER_ELECTION: 'leader-election',
} as const;

export const MCP = {
  PROTOCOL_VERSION: '2024-11-05',
  TOOLS_CALL_METHOD: 'tools/call',
  HANDLE_MESSAGE_TOOL: 'handle_message',
} as const;

export const CONFIDENCE = {
  MIN: 0,
  MAX: 1,
  DEFAULT_THRESHOLD: 0.7,
  DEFAULT_AGENT_THRESHOLD: 0,
} as const;

export const SESSION = {
  TTL_MS: 30 * 60 * 1000,
  MAX_TURNS: 100,
} as const;

export const HEALTH_CHECK_COLLECTION = '__health__';
