import { AgentConfigSchema } from '@reaatech/agent-mesh';
import { z } from 'zod';

export type { AgentConfig } from '@reaatech/agent-mesh';
// AgentConfig is defined once, in core (`@reaatech/agent-mesh`). It is re-exported
// here for back-compat with consumers that import it from the registry package.
// The registry package owns only the AgentRegistry array schema + its invariants.
export { AgentConfigSchema } from '@reaatech/agent-mesh';

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
