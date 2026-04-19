/**
 * Agent registry types and Zod schemas with SSRF protection
 */

import { z } from 'zod';
import { PRIVATE_IP_RANGES } from '../config/constants.js';

/**
 * Custom Zod refinement for SSRF-safe URL validation
 * Rejects localhost, private IPs, and link-local addresses
 */
function isSsrfSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow HTTP and HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check against private IP patterns
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

const ssrfSafeUrl = z.string().refine(
  (url) => isSsrfSafeUrl(url),
  (url) => ({
    message: `Endpoint URL is not allowed: ${url}. localhost and private IP ranges are rejected for SSRF protection.`,
  })
);

/**
 * Agent configuration schema with SSRF-safe endpoint validation
 */
export const AgentConfigSchema = z.object({
  /** Unique identifier for the agent (lowercase, hyphens allowed) */
  agent_id: z
    .string()
    .min(1, 'agent_id is required')
    .regex(/^[a-z0-9-]+$/, 'agent_id must be lowercase alphanumeric with hyphens'),

  /** Human-readable name for UI and prompts */
  display_name: z.string().min(1, 'display_name is required').max(200),

  /**
   * Detailed description of agent capabilities.
   * Injected verbatim into the Gemini classifier prompt.
   */
  description: z
    .string()
    .min(1, 'description is required')
    .max(5000, 'description too long (max 5000 chars)'),

  /**
   * MCP server endpoint URL.
   * Must be a valid HTTP/HTTPS URL.
   * SSRF protection: localhost and private IPs are rejected.
   */
  endpoint: ssrfSafeUrl,

  /** Agent type - always "mcp" */
  type: z.literal('mcp'),

  /** Whether this is the default/fallback agent */
  is_default: z.boolean().default(false),

  /**
   * Confidence threshold (0.0-1.0).
   * Default agent must have threshold 0.
   */
  confidence_threshold: z.number().min(0).max(1).default(0),

  /** Whether to ask clarifying questions when confidence is low */
  clarification_required: z.boolean().default(false),

  /**
   * Context shown to users when clarification is needed.
   * Helps users understand what this agent can do.
   */
  clarification_context: z.string().max(500).optional(),

  /**
   * Few-shot examples for the classifier.
   * More examples = better routing accuracy.
   */
  examples: z
    .array(z.string().min(1).max(500))
    .min(1, 'at least one example is required')
    .max(20, 'maximum 20 examples allowed'),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Schema for validating the entire registry after loading
 * Enforces cross-agent invariants
 */
export const AgentRegistrySchema = z
  .array(AgentConfigSchema)
  .refine(
    (agents) => {
      const defaults = agents.filter((a) => a.is_default);
      return defaults.length === 1;
    },
    { message: 'Exactly one agent must have is_default: true' }
  )
  .refine(
    (agents) => {
      const ids = agents.map((a) => a.agent_id);
      return ids.length === new Set(ids).size;
    },
    { message: 'All agent_id values must be unique' }
  )
  .refine(
    (agents) => {
      const defaultAgent = agents.find((a) => a.is_default);
      return !defaultAgent || defaultAgent.confidence_threshold === 0;
    },
    { message: 'Default agent must have confidence_threshold: 0' }
  );

export type AgentRegistry = z.infer<typeof AgentRegistrySchema>;

/**
 * Result of a registry load operation
 */
export interface RegistryLoadResult {
  /** Whether the load was successful */
  success: boolean;
  /** Number of agents loaded */
  agentCount: number;
  /** List of agent IDs */
  agentIds: string[];
  /** Default agent ID */
  defaultAgentId: string | null;
  /** Errors encountered during load */
  errors: string[];
  /** Warnings (non-fatal issues) */
  warnings: string[];
}
