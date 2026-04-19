import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

vi.mock('../../src/config/env.js', () => ({
  env: {
    AGENT_REGISTRY_DIR: '/tmp/test-agents-extensibility',
  },
}));

vi.mock('../../src/classifier/classifier.service.js', () => ({
  classifierService: {
    classify: vi.fn(),
  },
}));

const { loadRegistry, registryState, reloadRegistry } = await import(
  '../../src/registry/registry.loader.js'
);

describe('Registry Extensibility Contract', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-extensibility-'));
    vi.mocked(await import('../../src/config/env.js')).env.AGENT_REGISTRY_DIR = tmpDir;
    registryState.swap([]);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('Agent Addition Without Code Changes', () => {
    it('can add a new agent by creating a YAML file', async () => {
      const defaultYaml = `
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
      await fs.writeFile(path.join(tmpDir, 'default.yaml'), defaultYaml);

      let registry = await loadRegistry();
      expect(registry).toHaveLength(1);
      expect(registry[0]!.agent_id).toBe('default');

      const newAgentYaml = `
agent_id: "new-specialist"
display_name: "New Specialist"
description: "A new specialist agent for testing extensibility"
endpoint: "https://new-specialist.example.com"
type: mcp
is_default: false
confidence_threshold: 0.7
clarification_required: false
examples:
  - "Add a new task"
  - "Create something new"
  - "New functionality request"
`;
      await fs.writeFile(path.join(tmpDir, 'new-specialist.yaml'), newAgentYaml);

      registry = await loadRegistry();
      expect(registry).toHaveLength(2);

      const newAgent = registry.find((a) => a.agent_id === 'new-specialist');
      expect(newAgent).toBeDefined();
      expect(newAgent?.display_name).toBe('New Specialist');
      expect(newAgent?.confidence_threshold).toBe(0.7);
    });

    it('registry reload picks up new agents', async () => {
      const defaultYaml = `
agent_id: "default"
display_name: "Default"
description: "Default"
endpoint: "https://default.example.com"
type: mcp
is_default: true
confidence_threshold: 0
clarification_required: false
examples:
  - "General"
`;
      await fs.writeFile(path.join(tmpDir, 'default.yaml'), defaultYaml);

      let result = await reloadRegistry();
      expect(result.success).toBe(true);
      expect(result.agentCount).toBe(1);

      const specialistYaml = `
agent_id: "specialist"
display_name: "Specialist"
description: "Specialist"
endpoint: "https://specialist.example.com"
type: mcp
is_default: false
confidence_threshold: 0.7
clarification_required: false
examples:
  - "Specialized task"
`;
      await fs.writeFile(path.join(tmpDir, 'specialist.yaml'), specialistYaml);

      result = await reloadRegistry();
      expect(result.success).toBe(true);
      expect(result.agentCount).toBe(2);
      expect(result.agentIds).toContain('specialist');
    });
  });

  describe('Classifier Prompt Integration', () => {
    it('new agent examples are included in registry', async () => {
      const defaultYaml = `
agent_id: "default"
display_name: "Default"
description: "Default agent"
endpoint: "https://default.example.com"
type: mcp
is_default: true
confidence_threshold: 0
clarification_required: false
examples:
  - "General question"
`;
      await fs.writeFile(path.join(tmpDir, 'default.yaml'), defaultYaml);

      const newAgentYaml = `
agent_id: "weather"
display_name: "Weather Agent"
description: "Handles weather-related queries"
endpoint: "https://weather.example.com"
type: mcp
is_default: false
confidence_threshold: 0.6
clarification_required: false
examples:
  - "What's the weather in Boston?"
  - "Will it rain tomorrow?"
  - "Temperature forecast for next week"
`;
      await fs.writeFile(path.join(tmpDir, 'weather.yaml'), newAgentYaml);

      const registry = await loadRegistry();

      const weatherAgent = registry.find((a) => a.agent_id === 'weather');
      expect(weatherAgent).toBeDefined();
      expect(weatherAgent?.examples).toHaveLength(3);
      expect(weatherAgent?.examples).toContain("What's the weather in Boston?");
    });

    it('classifier prompt builder can access all agent descriptions', async () => {
      const defaultYaml = `
agent_id: "default"
display_name: "Default"
description: "Handles general requests"
endpoint: "https://default.example.com"
type: mcp
is_default: true
confidence_threshold: 0
clarification_required: false
examples:
  - "Help me"
`;
      await fs.writeFile(path.join(tmpDir, 'default.yaml'), defaultYaml);

      const agent1Yaml = `
agent_id: "agent-1"
display_name: "Agent One"
description: "First specialist agent"
endpoint: "https://agent1.example.com"
type: mcp
is_default: false
confidence_threshold: 0.7
clarification_required: false
examples:
  - "Agent 1 task"
`;
      await fs.writeFile(path.join(tmpDir, 'agent1.yaml'), agent1Yaml);

      const agent2Yaml = `
agent_id: "agent-2"
display_name: "Agent Two"
description: "Second specialist agent"
endpoint: "https://agent2.example.com"
type: mcp
is_default: false
confidence_threshold: 0.8
clarification_required: true
examples:
  - "Agent 2 task"
`;
      await fs.writeFile(path.join(tmpDir, 'agent2.yaml'), agent2Yaml);

      const registry = await loadRegistry();

      expect(registry).toHaveLength(3);
      expect(registry.find((a) => a.agent_id === 'agent-1')).toBeDefined();
      expect(registry.find((a) => a.agent_id === 'agent-2')).toBeDefined();

      registryState.swap(registry);
      expect(registryState.getAgentIds()).toHaveLength(3);
    });
  });

  describe('Atomic Swap Behavior', () => {
    it('readers see consistent snapshot during reload', async () => {
      const defaultYaml = `
agent_id: "default"
display_name: "Default"
description: "Default"
endpoint: "https://default.example.com"
type: mcp
is_default: true
confidence_threshold: 0
clarification_required: false
examples:
  - "Help"
`;
      await fs.writeFile(path.join(tmpDir, 'default.yaml'), defaultYaml);

      await reloadRegistry();
      const initialSnapshot = registryState.registry;

      const newAgentYaml = `
agent_id: "new-agent"
display_name: "New Agent"
description: "New agent added later"
endpoint: "https://new.example.com"
type: mcp
is_default: false
confidence_threshold: 0.6
clarification_required: false
examples:
  - "New task"
`;
      await fs.writeFile(path.join(tmpDir, 'new-agent.yaml'), newAgentYaml);

      await reloadRegistry();
      const newSnapshot = registryState.registry;

      expect(initialSnapshot).toHaveLength(1);
      expect(newSnapshot).toHaveLength(2);

      expect(initialSnapshot?.find((a) => a.agent_id === 'new-agent')).toBeUndefined();
      expect(newSnapshot?.find((a) => a.agent_id === 'new-agent')).toBeDefined();
    });
  });

  describe('Validation Invariants', () => {
    it('rejects new agent with duplicate ID', async () => {
      const yaml1 = `
agent_id: "unique-id"
display_name: "First"
description: "First agent"
endpoint: "https://first.example.com"
type: mcp
is_default: true
confidence_threshold: 0
clarification_required: false
examples:
  - "Test"
`;
      await fs.writeFile(path.join(tmpDir, 'first.yaml'), yaml1);
      await reloadRegistry();

      const duplicateYaml = `
agent_id: "unique-id"
display_name: "Duplicate"
description: "Duplicate ID agent"
endpoint: "https://dup.example.com"
type: mcp
is_default: false
confidence_threshold: 0.7
clarification_required: false
examples:
  - "Test 2"
`;
      await fs.writeFile(path.join(tmpDir, 'dup.yaml'), duplicateYaml);

      const result = await reloadRegistry();
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('maintains exactly one default agent', async () => {
      const default1Yaml = `
agent_id: "default-1"
display_name: "Default One"
description: "First default"
endpoint: "https://default1.example.com"
type: mcp
is_default: true
confidence_threshold: 0
clarification_required: false
examples:
  - "Help"
`;
      await fs.writeFile(path.join(tmpDir, 'default1.yaml'), default1Yaml);
      await reloadRegistry();

      const default2Yaml = `
agent_id: "default-2"
display_name: "Default Two"
description: "Second default (should fail)"
endpoint: "https://default2.example.com"
type: mcp
is_default: true
confidence_threshold: 0
clarification_required: false
examples:
  - "Help 2"
`;
      await fs.writeFile(path.join(tmpDir, 'default2.yaml'), default2Yaml);

      const result = await reloadRegistry();
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('default'))).toBe(true);
    });
  });
});