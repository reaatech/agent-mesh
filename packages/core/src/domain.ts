import { z } from 'zod';

export const IncomingRequestSchema = z.object({
  input: z.string().min(1, 'input is required').max(10000, 'input too long'),
  employee_id: z.string().optional(),
  display_name: z.string().optional(),
  entry_point: z.string().optional(),
  session_id: z.string().uuid().optional(),
  locale: z.string().optional(),
  user_id: z.string().optional(),
  slack_user_id: z.string().optional(),
});

export type IncomingRequest = z.infer<typeof IncomingRequestSchema>;

export const EmployeeProfileSchema = z.object({
  employee_id: z.string(),
  display_name: z.string(),
  email: z.string().email(),
  department: z.string().optional(),
  title: z.string().optional(),
  locale: z.string().optional(),
});

export type EmployeeProfile = z.infer<typeof EmployeeProfileSchema>;

export const ClassifierOutputSchema = z.object({
  agent_id: z.string(),
  confidence: z.number().min(0).max(1),
  ambiguous: z.boolean().default(false),
  detected_language: z.string().default('en'),
  intent_summary: z.string(),
  entities: z.record(z.string(), z.unknown()).default({}),
});

export type ClassifierOutput = z.infer<typeof ClassifierOutputSchema>;

export const AgentConfigSchema = z.object({
  agent_id: z.string().regex(/^[a-z0-9-]+$/, 'agent_id must be lowercase with hyphens'),
  display_name: z.string().min(1),
  description: z.string().min(1),
  endpoint: z.string().url(),
  type: z.literal('mcp'),
  is_default: z.boolean().default(false),
  confidence_threshold: z.number().min(0).max(1).default(0),
  clarification_required: z.boolean().default(false),
  clarification_context: z.string().optional(),
  examples: z.array(z.string()).min(1),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const ContextPacketSchema = z.object({
  session_id: z.string().uuid(),
  request_id: z.string().uuid(),
  employee_id: z.string(),
  display_name: z.string(),
  raw_input: z.string(),
  intent_summary: z.string(),
  entities: z.record(z.string(), z.unknown()).default({}),
  detected_language: z.string(),
  turn_history: z
    .array(
      z.object({
        role: z.enum(['user', 'agent']),
        content: z.string(),
        timestamp: z.string().datetime(),
        intent_summary: z.string().optional(),
      }),
    )
    .default([]),
  workflow_state: z.record(z.string(), z.unknown()).default({}),
});

export type ContextPacket = z.infer<typeof ContextPacketSchema>;

export const AgentResponseSchema = z.object({
  content: z.string().min(1, 'content is required'),
  workflow_complete: z.boolean().default(false),
  workflow_state: z.record(z.string(), z.unknown()).optional(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export type ConfidenceAction = 'route' | 'clarify' | 'fallback';

export const ConfidenceDecisionSchema = z.object({
  action: z.enum(['route', 'clarify', 'fallback']),
  agent_id: z.string(),
  clarification_question: z.string().optional(),
  confidence: z.number(),
  reason: z.string(),
});

export type ConfidenceDecision = z.infer<typeof ConfidenceDecisionSchema>;

export type SessionStatus = 'active' | 'completed' | 'abandoned' | 'error';

export const TurnEntrySchema = z.object({
  role: z.enum(['user', 'agent']),
  content: z.string(),
  timestamp: z.string().datetime(),
  intent_summary: z.string().optional(),
});

export type TurnEntry = z.infer<typeof TurnEntrySchema>;

export const SessionRecordSchema = z.object({
  session_id: z.string().uuid(),
  user_id: z.string(),
  employee_id: z.string(),
  status: z.enum(['active', 'completed', 'abandoned', 'error']),
  active_agent: z.string(),
  turn_history: z.array(TurnEntrySchema).default([]),
  workflow_state: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  ttl: z.date(),
});

export type SessionRecord = z.infer<typeof SessionRecordSchema>;

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export const CircuitBreakerStateSchema = z.object({
  agent_id: z.string(),
  state: z.enum(['CLOSED', 'OPEN', 'HALF_OPEN']),
  failure_count: z.number().default(0),
  success_count: z.number().default(0),
  last_failure_time: z.number().optional(),
  last_state_change: z.number(),
  half_open_calls: z.number().default(0),
  backoff_multiplier: z.number().default(1),
});

export type CircuitBreakerState = z.infer<typeof CircuitBreakerStateSchema>;

export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  version: z.string(),
  uptime_ms: z.number(),
  checks: z
    .record(
      z.string(),
      z.object({
        status: z.enum(['pass', 'fail', 'warn']),
        message: z.string().optional(),
        latency_ms: z.number().optional(),
      }),
    )
    .default({}),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
