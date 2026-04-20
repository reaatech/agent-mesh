import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

vi.mock('../../src/config/env.js', () => ({
  env: {
    AGENT_REGISTRY_DIR: '/tmp/test-agents',
  },
}));

const { loadRegistry, registryState, reloadRegistry } =
  await import('../../src/registry/registry.loader.js');

const validDefaultYaml = `
agent_id: "default"
display_name: "Default Agent"
description: "Default fallback agent"
endpoint: "https://default.example.com"
type: mcp
is_default: true
confidence_threshold: 0
clarification_required: false
examples:
  - "General query"
`;

const validSpecialistYaml = `
agent_id: "specialist"
display_name: "Specialist Agent"
description: "Specialist agent"
endpoint: "https://specialist.example.com"
type: mcp
is_default: false
confidence_threshold: 0.7
clarification_required: false
examples:
  - "Specialist query"
`;

describe('loadRegistry', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    vi.mocked(await import('../../src/config/env.js')).env.AGENT_REGISTRY_DIR = tmpDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('loads a valid registry with default agent', async () => {
    await fs.writeFile(path.join(tmpDir, 'default.yaml'), validDefaultYaml);
    const registry = await loadRegistry();
    expect(registry.length).toBe(1);
    expect(registry[0]!.agent_id).toBe('default');
    expect(registry[0]!.is_default).toBe(true);
  });

  it('loads multiple agents', async () => {
    await fs.writeFile(path.join(tmpDir, 'default.yaml'), validDefaultYaml);
    await fs.writeFile(path.join(tmpDir, 'specialist.yaml'), validSpecialistYaml);
    const registry = await loadRegistry();
    expect(registry).toHaveLength(2);
    expect(registry.map((a) => a.agent_id).sort()).toEqual(['default', 'specialist']);
  });

  it('throws when no YAML files found', async () => {
    await expect(loadRegistry()).rejects.toThrow('No agent YAML files found');
  });

  it('throws on YAML parse error', async () => {
    await fs.writeFile(path.join(tmpDir, 'bad.yaml'), '{{invalid yaml');
    await expect(loadRegistry()).rejects.toThrow();
  });

  it('throws on schema validation error', async () => {
    const badYaml = `
agent_id: "bad"
display_name: "Bad"
description: "Missing fields"
endpoint: "not-a-url"
type: mcp
is_default: false
confidence_threshold: 5
clarification_required: false
examples: []
`;
    await fs.writeFile(path.join(tmpDir, 'bad.yaml'), badYaml);
    await expect(loadRegistry()).rejects.toThrow();
  });

  it('throws on multiple default agents', async () => {
    const dup = validDefaultYaml.replace('"default"', '"default2"');
    await fs.writeFile(path.join(tmpDir, 'a.yaml'), validDefaultYaml);
    await fs.writeFile(path.join(tmpDir, 'b.yaml'), dup);
    await expect(loadRegistry()).rejects.toThrow();
  });

  it('expands environment variables in YAML', async () => {
    process.env.TEST_AGENT_ENDPOINT = 'https://from-env.example.com';
    const yamlWithEnv = `
agent_id: "env-agent"
display_name: "Env Agent"
description: "Agent with env var endpoint"
endpoint: "\${TEST_AGENT_ENDPOINT}"
type: mcp
is_default: true
confidence_threshold: 0
clarification_required: false
examples:
  - "Test"
`;
    await fs.writeFile(path.join(tmpDir, 'env.yaml'), yamlWithEnv);
    const registry = await loadRegistry();
    expect(registry[0]!.endpoint).toBe('https://from-env.example.com');
    delete process.env.TEST_AGENT_ENDPOINT;
  });

  it('uses default value for env var when provided', async () => {
    delete process.env.NONEXISTENT_VAR;
    const yamlWithDefault = `
agent_id: "default-val-agent"
display_name: "Default Val Agent"
description: "Agent with default env var"
endpoint: "\${NONEXISTENT_VAR:-https://fallback.example.com}"
type: mcp
is_default: true
confidence_threshold: 0
clarification_required: false
examples:
  - "Test"
`;
    await fs.writeFile(path.join(tmpDir, 'def.yaml'), yamlWithDefault);
    const registry = await loadRegistry();
    expect(registry[0]!.endpoint).toBe('https://fallback.example.com');
  });

  it('throws on unset env var without default', async () => {
    delete process.env.TOTALLY_MISSING_VAR;
    const yamlNoDefault = `
agent_id: "unset-agent"
display_name: "Unset Agent"
description: "Agent with unset env var"
endpoint: "\${TOTALLY_MISSING_VAR}"
type: mcp
is_default: true
confidence_threshold: 0
clarification_required: false
examples:
  - "Test"
`;
    await fs.writeFile(path.join(tmpDir, 'unset.yaml'), yamlNoDefault);
    await expect(loadRegistry()).rejects.toThrow();
  });

  it('handles .yml extension', async () => {
    await fs.writeFile(path.join(tmpDir, 'agent.yml'), validDefaultYaml);
    const registry = await loadRegistry();
    expect(registry).toHaveLength(1);
  });
});

describe('RegistryState', () => {
  it('swaps registry and finds agents', () => {
    const registry = [
      {
        agent_id: 'a',
        display_name: 'A',
        description: 'A',
        endpoint: 'https://a.example.com',
        type: 'mcp' as const,
        is_default: true,
        confidence_threshold: 0,
        clarification_required: false,
        examples: [],
      },
      {
        agent_id: 'b',
        display_name: 'B',
        description: 'B',
        endpoint: 'https://b.example.com',
        type: 'mcp' as const,
        is_default: false,
        confidence_threshold: 0.5,
        clarification_required: false,
        examples: [],
      },
    ];

    registryState.swap(registry);
    expect(registryState.isLoaded).toBe(true);
    expect(registryState.getAgent('a')).toBeDefined();
    expect(registryState.getAgent('b')).toBeDefined();
    expect(registryState.getAgent('c')).toBeUndefined();
    expect(registryState.defaultAgent?.agent_id).toBe('a');
    expect(registryState.getAgentIds()).toEqual(['a', 'b']);
    expect(registryState.lastLoadTime).toBeGreaterThan(0);
    expect(registryState.loadError).toBeNull();
  });

  it('sets load error', () => {
    registryState.setError(new Error('test error'));
    expect(registryState.loadError).not.toBeNull();
    expect(registryState.loadError?.message).toBe('test error');
  });
});

describe('reloadRegistry', () => {
  it('returns result with success false on load failure', async () => {
    const result = await reloadRegistry();
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
