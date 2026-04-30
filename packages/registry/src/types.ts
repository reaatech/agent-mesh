import { z } from 'zod';
import { PRIVATE_IP_RANGES } from '@reaatech/agent-mesh';

function isSsrfSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(hostname)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

const ssrfSafeUrl = z.string().refine((url) => isSsrfSafeUrl(url), {
  message:
    'Endpoint URL is not allowed: localhost and private IP ranges are rejected for SSRF protection.',
});

export const AgentConfigSchema = z.object({
  agent_id: z
    .string()
    .min(1, 'agent_id is required')
    .regex(/^[a-z0-9-]+$/, 'agent_id must be lowercase alphanumeric with hyphens'),

  display_name: z.string().min(1, 'display_name is required').max(200),

  description: z
    .string()
    .min(1, 'description is required')
    .max(5000, 'description too long (max 5000 chars)'),

  endpoint: ssrfSafeUrl,

  type: z.literal('mcp'),

  is_default: z.boolean().default(false),

  confidence_threshold: z.number().min(0).max(1).default(0),

  clarification_required: z.boolean().default(false),

  clarification_context: z.string().max(500).optional(),

  examples: z
    .array(z.string().min(1).max(500))
    .min(1, 'at least one example is required')
    .max(20, 'maximum 20 examples allowed'),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const AgentRegistrySchema = z
  .array(AgentConfigSchema)
  .refine(
    (agents) => {
      const defaults = agents.filter((a) => a.is_default);
      return defaults.length === 1;
    },
    { message: 'Exactly one agent must have is_default: true' },
  )
  .refine(
    (agents) => {
      const ids = agents.map((a) => a.agent_id);
      return ids.length === new Set(ids).size;
    },
    { message: 'All agent_id values must be unique' },
  )
  .refine(
    (agents) => {
      const defaultAgent = agents.find((a) => a.is_default);
      return !defaultAgent || defaultAgent.confidence_threshold === 0;
    },
    { message: 'Default agent must have confidence_threshold: 0' },
  );

export type AgentRegistry = z.infer<typeof AgentRegistrySchema>;

export interface RegistryLoadResult {
  success: boolean;
  agentCount: number;
  agentIds: string[];
  defaultAgentId: string | null;
  errors: string[];
  warnings: string[];
}
