/**
 * Agent registry loader with atomic swap and SIGHUP hot-reload support
 */

import fs from 'fs/promises';
import { glob } from 'glob';
import { parse as parseYaml } from 'yaml';
import {
  AgentConfigSchema,
  AgentRegistrySchema,
  type AgentRegistry,
  type RegistryLoadResult,
} from './types.js';
import { MAX_YAML_FILE_SIZE } from '../config/constants.js';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';

/**
 * Sentinel value for missing environment variables during ${ENV_VAR} expansion
 */
const ENV_VAR_SENTINEL = '__UNSET_ENV_VAR__';

/**
 * Expand ${ENV_VAR} and ${ENV_VAR:-default} placeholders in YAML content
 * Missing variables are replaced with a sentinel value that will cause validation to fail
 */
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

/**
 * Parse and validate a single YAML file
 */
async function parseAgentFile(
  filePath: string,
): Promise<
  { config: AgentRegistry[number]; warnings: string[] } | { error: string; warnings: string[] }
> {
  const warnings: string[] = [];

  // Check file size
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

  // Read and parse YAML
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return { error: `Cannot read file: ${filePath}`, warnings };
  }

  // Expand environment variables
  const expanded = expandEnvVars(content);

  // Check for unset env vars
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

  // Validate against schema
  const result = AgentConfigSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { error: `Validation error in ${filePath}: ${errors}`, warnings };
  }

  return { config: result.data, warnings };
}

/**
 * Load all agent configurations from the registry directory
 * Returns a validated registry or throws on validation failure
 */
export async function loadRegistry(): Promise<AgentRegistry> {
  const registryDir = env.AGENT_REGISTRY_DIR;

  // Find all YAML files
  const files = await glob('**/*.{yaml,yml}', {
    cwd: registryDir,
    absolute: true,
    nodir: true,
  });

  if (files.length === 0) {
    throw new Error(`No agent YAML files found in ${registryDir}`);
  }

  // Parse all files in parallel
  const results = await Promise.all(files.map((f) => parseAgentFile(f)));

  // Collect configs and errors
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

  // Validate cross-agent invariants
  const validationResult = AgentRegistrySchema.safeParse(configs);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.errors.map((e) => e.message).join('; ');
    throw new Error(`Registry invariant validation failed: ${errorMessages}`);
  }

  // Log warnings
  for (const warning of warnings) {
    logger.warn('Registry warning', { warning });
  }

  return validationResult.data;
}

/**
 * Registry state holder with atomic swap semantics
 * Readers always get a consistent snapshot
 */
class RegistryState {
  private _registry: AgentRegistry | null = null;
  private _defaultAgent: AgentRegistry[number] | null = null;
  private _agentMap: Map<string, AgentRegistry[number]> = new Map();
  private _loadError: Error | null = null;
  private _lastLoadTime: number = 0;

  /** Get the current registry (may be null if not yet loaded) */
  get registry(): AgentRegistry | null {
    return this._registry;
  }

  /** Get the default agent */
  get defaultAgent(): AgentRegistry[number] | null {
    return this._defaultAgent;
  }

  /** Get the last load error */
  get loadError(): Error | null {
    return this._loadError;
  }

  /** Get the last successful load time */
  get lastLoadTime(): number {
    return this._lastLoadTime;
  }

  /** Check if registry is loaded */
  get isLoaded(): boolean {
    return this._registry !== null;
  }

  /** Atomically swap in a new registry */
  swap(newRegistry: AgentRegistry): void {
    this._registry = newRegistry;
    this._defaultAgent = newRegistry.find((a) => a.is_default) ?? null;
    this._agentMap = new Map(newRegistry.map((a) => [a.agent_id, a]));
    this._loadError = null;
    this._lastLoadTime = Date.now();
  }

  /** Set load error (registry remains unchanged) */
  setError(error: Error): void {
    this._loadError = error;
  }

  /** Get an agent by ID */
  getAgent(agentId: string): AgentRegistry[number] | undefined {
    return this._agentMap.get(agentId);
  }

  /** Get all agent IDs */
  getAgentIds(): string[] {
    return Array.from(this._agentMap.keys());
  }
}

/** Singleton registry state */
export const registryState = new RegistryState();

/**
 * Load registry and atomically swap on success
 * On failure, the old registry remains active
 */
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

/**
 * Initialize the registry (first load)
 * Throws on failure - fail-fast startup
 */
export async function initRegistry(): Promise<void> {
  const newRegistry = await loadRegistry();
  registryState.swap(newRegistry);
  logger.info('Registry initialized', { agentCount: newRegistry.length });
}
