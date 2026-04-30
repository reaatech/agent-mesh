import fs from 'node:fs/promises';
import { MAX_YAML_FILE_SIZE } from '@reaatech/agent-mesh';
import { env } from '@reaatech/agent-mesh';
import { logger } from '@reaatech/agent-mesh-observability';
import { glob } from 'glob';
import { parse as parseYaml } from 'yaml';
import {
  AgentConfigSchema,
  type AgentRegistry,
  AgentRegistrySchema,
  type RegistryLoadResult,
} from './types.js';

const ENV_VAR_SENTINEL = '__UNSET_ENV_VAR__';

function expandEnvVars(content: string): string {
  return content.replace(
    /\$\{(\w+)(?::-(.+?))?\}/g,
    (_match, varName: string, defaultValue?: string) => {
      const value = process.env[varName];
      if (value !== undefined) {
        return value;
      }

      if (defaultValue !== undefined) {
        return defaultValue;
      }

      return ENV_VAR_SENTINEL;
    },
  );
}

async function parseAgentFile(
  filePath: string,
): Promise<
  { config: AgentRegistry[number]; warnings: string[] } | { error: string; warnings: string[] }
> {
  const warnings: string[] = [];

  try {
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_YAML_FILE_SIZE) {
      return {
        error: `File exceeds size limit (${stats.size} > ${MAX_YAML_FILE_SIZE}): ${filePath}`,
        warnings,
      };
    }
  } catch {
    return { error: `Cannot stat file: ${filePath}`, warnings };
  }

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return { error: `Cannot read file: ${filePath}`, warnings };
  }

  const expanded = expandEnvVars(content);

  if (expanded.includes(ENV_VAR_SENTINEL)) {
    return { error: `Unset environment variable in: ${filePath}`, warnings };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(expanded);
  } catch (err) {
    return {
      error: `YAML parse error in ${filePath}: ${err instanceof Error ? err.message : 'unknown'}`,
      warnings,
    };
  }

  const result = AgentConfigSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { error: `Validation error in ${filePath}: ${errors}`, warnings };
  }

  return { config: result.data, warnings };
}

export async function loadRegistry(): Promise<AgentRegistry> {
  const registryDir = env.AGENT_REGISTRY_DIR;

  const files = await glob('**/*.{yaml,yml}', {
    cwd: registryDir,
    absolute: true,
    nodir: true,
  });

  if (files.length === 0) {
    throw new Error(`No agent YAML files found in ${registryDir}`);
  }

  const results = await Promise.all(files.map((f) => parseAgentFile(f)));

  const configs: AgentRegistry = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const result of results) {
    if ('error' in result) {
      errors.push(result.error);
    } else {
      configs.push(result.config);
    }
    warnings.push(...result.warnings);
  }

  if (errors.length > 0) {
    throw new Error(`Registry load errors:\n${errors.join('\n')}`);
  }

  const validationResult = AgentRegistrySchema.safeParse(configs);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.issues.map((e) => e.message).join('; ');
    throw new Error(`Registry invariant validation failed: ${errorMessages}`);
  }

  for (const warning of warnings) {
    logger.warn('Registry warning', { warning });
  }

  return validationResult.data;
}

class RegistryState {
  private _registry: AgentRegistry | null = null;
  private _defaultAgent: AgentRegistry[number] | null = null;
  private _agentMap: Map<string, AgentRegistry[number]> = new Map();
  private _loadError: Error | null = null;
  private _lastLoadTime = 0;

  get registry(): AgentRegistry | null {
    return this._registry;
  }

  get defaultAgent(): AgentRegistry[number] | null {
    return this._defaultAgent;
  }

  get loadError(): Error | null {
    return this._loadError;
  }

  get lastLoadTime(): number {
    return this._lastLoadTime;
  }

  get isLoaded(): boolean {
    return this._registry !== null;
  }

  swap(newRegistry: AgentRegistry): void {
    this._registry = newRegistry;
    this._defaultAgent = newRegistry.find((a) => a.is_default) ?? null;
    this._agentMap = new Map(newRegistry.map((a) => [a.agent_id, a]));
    this._loadError = null;
    this._lastLoadTime = Date.now();
  }

  setError(error: Error): void {
    this._loadError = error;
  }

  getAgent(agentId: string): AgentRegistry[number] | undefined {
    return this._agentMap.get(agentId);
  }

  getAgentIds(): string[] {
    return Array.from(this._agentMap.keys());
  }
}

export const registryState = new RegistryState();

export async function reloadRegistry(): Promise<RegistryLoadResult> {
  const result: RegistryLoadResult = {
    success: false,
    agentCount: 0,
    agentIds: [],
    defaultAgentId: null,
    errors: [],
    warnings: [],
  };

  try {
    const newRegistry = await loadRegistry();
    registryState.swap(newRegistry);

    result.success = true;
    result.agentCount = newRegistry.length;
    result.agentIds = newRegistry.map((a) => a.agent_id);
    result.defaultAgentId = newRegistry.find((a) => a.is_default)?.agent_id ?? null;

    logger.info('Registry loaded', {
      agentCount: result.agentCount,
      defaultAgentId: result.defaultAgentId,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    registryState.setError(error);
    result.errors = [error.message];

    logger.error('Registry reload failed', { error: error.message });
  }

  return result;
}

export async function initRegistry(): Promise<void> {
  const newRegistry = await loadRegistry();
  registryState.swap(newRegistry);
  logger.info('Registry initialized', { agentCount: newRegistry.length });
}
