import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentConfig } from '../../src/registry/types.js';

const mockClientConnect = vi.fn();
const mockClientCallTool = vi.fn();
const mockClientClose = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockClientConnect,
    callTool: mockClientCallTool,
    close: mockClientClose,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/config/constants.js', () => ({
  MCP: {
    HANDLE_MESSAGE_TOOL: 'handle_message',
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    MCP_REQUEST_TIMEOUT_MS: 5000,
    MCP_MAX_RETRIES: 1,
  },
}));

const { McpClient, mcpClientFactory } = await import('../../src/router/mcp.client.js');

const testAgent: AgentConfig = {
  agent_id: 'test-agent',
  display_name: 'Test Agent',
  description: 'Test',
  endpoint: 'https://test.example.com',
  type: 'mcp',
  is_default: false,
  confidence_threshold: 0.7,
  clarification_required: false,
  examples: ['test'],
};

describe('McpClient', () => {
  let client: InstanceType<typeof McpClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new McpClient(testAgent);
    mockClientConnect.mockResolvedValue(undefined);
  });

  it('parses structured response from content array', async () => {
    mockClientCallTool.mockResolvedValue({
      content: [
        { type: 'text', text: JSON.stringify({ content: 'hello', workflow_complete: true }) },
      ],
    });

    const result = await client.sendMessage({
      session_id: 's1',
      request_id: 'r1',
      employee_id: 'e1',
      display_name: 'Test',
      raw_input: 'Hello',
      intent_summary: 'Test',
      entities: {},
      detected_language: 'en',
      turn_history: [],
      workflow_state: {},
    });

    expect(result.content).toBe('hello');
    expect(result.workflow_complete).toBe(true);
  });

  it('parses plain text response from content', async () => {
    mockClientCallTool.mockResolvedValue({
      content: [{ type: 'text', text: 'Simple text response' }],
    });

    const result = await client.sendMessage({
      session_id: 's1',
      request_id: 'r1',
      employee_id: 'e1',
      display_name: 'Test',
      raw_input: 'Hello',
      intent_summary: 'Test',
      entities: {},
      detected_language: 'en',
      turn_history: [],
      workflow_state: { step: 'init' },
    });

    expect(result.content).toBe('Simple text response');
    expect(result.workflow_complete).toBe(false);
  });

  it('parses structuredContent', async () => {
    mockClientCallTool.mockResolvedValue({
      structuredContent: { content: 'structured', workflow_complete: true },
    });

    const result = await client.sendMessage({
      session_id: 's1',
      request_id: 'r1',
      employee_id: 'e1',
      display_name: 'Test',
      raw_input: 'Hello',
      intent_summary: 'Test',
      entities: {},
      detected_language: 'en',
      turn_history: [],
      workflow_state: {},
    });

    expect(result.content).toBe('structured');
  });

  it('retries on failure', async () => {
    mockClientCallTool.mockRejectedValueOnce(new Error('transient')).mockResolvedValue({
      structuredContent: { content: 'ok', workflow_complete: true },
    });

    const result = await client.sendMessage({
      session_id: 's1',
      request_id: 'r1',
      employee_id: 'e1',
      display_name: 'Test',
      raw_input: 'Hello',
      intent_summary: 'Test',
      entities: {},
      detected_language: 'en',
      turn_history: [],
      workflow_state: {},
    });

    expect(result.content).toBe('ok');
  });

  it('throws after max retries', async () => {
    mockClientCallTool.mockRejectedValue(new Error('persistent failure'));

    await expect(
      client.sendMessage({
        session_id: 's1',
        request_id: 'r1',
        employee_id: 'e1',
        display_name: 'Test',
        raw_input: 'Hello',
        intent_summary: 'Test',
        entities: {},
        detected_language: 'en',
        turn_history: [],
        workflow_state: {},
      }),
    ).rejects.toThrow('persistent failure');
  });

  it('reports isConnected status', () => {
    expect(client.isConnected()).toBe(false);
  });

  it('closes cleanly after connection', async () => {
    mockClientCallTool.mockResolvedValue({
      structuredContent: { content: 'ok', workflow_complete: true },
    });

    await client.sendMessage({
      session_id: 's1',
      request_id: 'r1',
      employee_id: 'e1',
      display_name: 'Test',
      raw_input: 'Hello',
      intent_summary: 'Test',
      entities: {},
      detected_language: 'en',
      turn_history: [],
      workflow_state: {},
    });

    await client.close();
    expect(mockClientClose).toHaveBeenCalled();
  });
});

describe('McpClientFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientCallTool.mockResolvedValue({
      structuredContent: { content: 'ok', workflow_complete: true },
    });
    mockClientConnect.mockResolvedValue(undefined);
  });

  it('returns same client for same agent', () => {
    const c1 = mcpClientFactory.getClient(testAgent);
    const c2 = mcpClientFactory.getClient(testAgent);
    expect(c1).toBe(c2);
  });

  it('removes a client', () => {
    const c = mcpClientFactory.getClient(testAgent);
    mcpClientFactory.removeClient(testAgent.agent_id);
    const c2 = mcpClientFactory.getClient(testAgent);
    expect(c2).not.toBe(c);
  });

  it('closes all clients', async () => {
    const c = mcpClientFactory.getClient(testAgent);
    mockClientCallTool.mockResolvedValue({
      structuredContent: { content: 'ok', workflow_complete: true },
    });
    await c.sendMessage({
      session_id: 's1',
      request_id: 'r1',
      employee_id: 'e1',
      display_name: 'Test',
      raw_input: 'Hi',
      intent_summary: 'Test',
      entities: {},
      detected_language: 'en',
      turn_history: [],
      workflow_state: {},
    });
    await mcpClientFactory.closeAll();
    expect(mockClientClose).toHaveBeenCalled();
  });
});
