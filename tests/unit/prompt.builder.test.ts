import { describe, it, expect } from 'vitest';
import {
  buildClassifierPrompt,
  parseClassifierOutput,
} from '../../src/classifier/prompt.builder.js';
import type { AgentRegistry } from '../../src/registry/types.js';

const mockRegistry: AgentRegistry = [
  {
    agent_id: 'default',
    display_name: 'Default Agent',
    description: 'Handles general requests',
    endpoint: 'https://default.example.com',
    type: 'mcp',
    is_default: true,
    confidence_threshold: 0,
    clarification_required: false,
    examples: ['General query'],
    clarification_context: 'I can help with general tasks',
  },
  {
    agent_id: 'specialist',
    display_name: 'Specialist Agent',
    description: 'Handles specialized tasks',
    endpoint: 'https://specialist.example.com',
    type: 'mcp',
    is_default: false,
    confidence_threshold: 0.7,
    clarification_required: false,
    examples: ['Specialist query one', 'Specialist query two'],
  },
];

describe('buildClassifierPrompt', () => {
  it('should include system prompt text', () => {
    const prompt = buildClassifierPrompt(mockRegistry, 'Hello');
    expect(prompt).toContain('intent classifier');
    expect(prompt).toContain('agent_id');
    expect(prompt).toContain('confidence');
  });

  it('should include all agent sections', () => {
    const prompt = buildClassifierPrompt(mockRegistry, 'Hello');
    expect(prompt).toContain('Default Agent');
    expect(prompt).toContain('default');
    expect(prompt).toContain('Specialist Agent');
    expect(prompt).toContain('specialist');
  });

  it('should include agent descriptions', () => {
    const prompt = buildClassifierPrompt(mockRegistry, 'Hello');
    expect(prompt).toContain('Handles general requests');
    expect(prompt).toContain('Handles specialized tasks');
  });

  it('should include agent examples', () => {
    const prompt = buildClassifierPrompt(mockRegistry, 'Hello');
    expect(prompt).toContain('General query');
    expect(prompt).toContain('Specialist query one');
    expect(prompt).toContain('Specialist query two');
  });

  it('should include user input', () => {
    const prompt = buildClassifierPrompt(mockRegistry, 'Reset my password');
    expect(prompt).toContain('Reset my password');
  });

  it('should include language hint when detectedLanguage is provided', () => {
    const prompt = buildClassifierPrompt(mockRegistry, 'Hola', 'es');
    expect(prompt).toContain('prefer es');
  });

  it('should not include language hint when detectedLanguage is undefined', () => {
    const prompt = buildClassifierPrompt(mockRegistry, 'Hello');
    expect(prompt).not.toContain('prefer');
  });

  it('should include clarification_context when present', () => {
    const prompt = buildClassifierPrompt(mockRegistry, 'Hello');
    expect(prompt).toContain('Clarification context: I can help with general tasks');
  });

  it('should not include clarification_context when absent', () => {
    const prompt = buildClassifierPrompt(mockRegistry, 'Hello');
    const specialistSection = prompt.split('Specialist Agent')[1];
    expect(specialistSection).not.toContain('Clarification context');
  });

  it('should include JSON response schema', () => {
    const prompt = buildClassifierPrompt(mockRegistry, 'Hello');
    expect(prompt).toContain('"agent_id"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('"ambiguous"');
    expect(prompt).toContain('"detected_language"');
    expect(prompt).toContain('"intent_summary"');
    expect(prompt).toContain('"entities"');
  });
});

describe('parseClassifierOutput', () => {
  it('should parse valid JSON output', () => {
    const json = JSON.stringify({
      agent_id: 'specialist',
      confidence: 0.85,
      ambiguous: false,
      detected_language: 'en',
      intent_summary: 'User wants a specialist',
      entities: { key: 'value' },
    });

    const result = parseClassifierOutput(json);
    expect(result.agent_id).toBe('specialist');
    expect(result.confidence).toBe(0.85);
    expect(result.ambiguous).toBe(false);
    expect(result.detected_language).toBe('en');
    expect(result.intent_summary).toBe('User wants a specialist');
    expect(result.entities).toEqual({ key: 'value' });
  });

  it('should parse JSON wrapped in markdown code block', () => {
    const output =
      '```json\n{"agent_id":"default","confidence":0.5,"detected_language":"en","intent_summary":"test","entities":{}}\n```';
    const result = parseClassifierOutput(output);
    expect(result.agent_id).toBe('default');
    expect(result.confidence).toBe(0.5);
  });

  it('should default ambiguous to false when missing', () => {
    const json = JSON.stringify({
      agent_id: 'default',
      confidence: 0.5,
      detected_language: 'en',
      intent_summary: 'test',
    });

    const result = parseClassifierOutput(json);
    expect(result.ambiguous).toBe(false);
  });

  it('should default entities to empty object when missing', () => {
    const json = JSON.stringify({
      agent_id: 'default',
      confidence: 0.5,
      detected_language: 'en',
      intent_summary: 'test',
    });

    const result = parseClassifierOutput(json);
    expect(result.entities).toEqual({});
  });

  it('should throw on missing agent_id', () => {
    const json = JSON.stringify({
      confidence: 0.5,
      detected_language: 'en',
      intent_summary: 'test',
    });

    expect(() => parseClassifierOutput(json)).toThrow('Missing or invalid agent_id');
  });

  it('should throw on invalid confidence type', () => {
    const json = JSON.stringify({
      agent_id: 'default',
      confidence: 'high',
      detected_language: 'en',
      intent_summary: 'test',
    });

    expect(() => parseClassifierOutput(json)).toThrow('Missing or invalid confidence');
  });

  it('should throw on confidence below 0', () => {
    const json = JSON.stringify({
      agent_id: 'default',
      confidence: -0.1,
      detected_language: 'en',
      intent_summary: 'test',
    });

    expect(() => parseClassifierOutput(json)).toThrow('Missing or invalid confidence');
  });

  it('should throw on confidence above 1', () => {
    const json = JSON.stringify({
      agent_id: 'default',
      confidence: 1.5,
      detected_language: 'en',
      intent_summary: 'test',
    });

    expect(() => parseClassifierOutput(json)).toThrow('Missing or invalid confidence');
  });

  it('should throw on missing detected_language', () => {
    const json = JSON.stringify({
      agent_id: 'default',
      confidence: 0.5,
      intent_summary: 'test',
    });

    expect(() => parseClassifierOutput(json)).toThrow('Missing or invalid detected_language');
  });

  it('should throw on missing intent_summary', () => {
    const json = JSON.stringify({
      agent_id: 'default',
      confidence: 0.5,
      detected_language: 'en',
    });

    expect(() => parseClassifierOutput(json)).toThrow('Missing or invalid intent_summary');
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseClassifierOutput('not json')).toThrow();
  });

  it('should handle JSON with surrounding whitespace', () => {
    const json = `  \n  {"agent_id":"default","confidence":0.5,"detected_language":"en","intent_summary":"test"}  \n  `;
    const result = parseClassifierOutput(json);
    expect(result.agent_id).toBe('default');
  });
});
