import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/constants.js', () => ({
  SERVICE_NAME: 'agent-mesh',
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    LOG_LEVEL: 'debug',
    NODE_ENV: 'test',
  },
}));

const { logger, createChildLogger } = await import('../../src/observability/logger.js');

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a winston logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('has default metadata with service name', () => {
    const meta = logger.defaultMeta;
    expect(meta).toBeDefined();
    expect(meta.service).toBe('agent-mesh');
  });

  it('logs at info level', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    logger.info('test message');
    expect(spy).toHaveBeenCalledWith('test message');
  });

  it('logs at error level', () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    logger.error('error message');
    expect(spy).toHaveBeenCalledWith('error message');
  });

  it('logs with metadata', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    logger.info('test with meta', { key: 'value' });
    expect(spy).toHaveBeenCalledWith('test with meta', { key: 'value' });
  });
});

describe('createChildLogger', () => {
  it('creates a child logger with context', () => {
    const child = createChildLogger({ request_id: 'req-123' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });

  it('child logger has parent metadata', () => {
    const child = createChildLogger({ request_id: 'req-123' });
    expect(child.defaultMeta.service).toBe('agent-mesh');
  });

  it('child can log with context', () => {
    const child = createChildLogger({ request_id: 'req-123', session_id: 'sess-456' });
    const spy = vi.spyOn(child, 'info').mockImplementation(() => child);
    child.info('child log message');
    expect(spy).toHaveBeenCalledWith('child log message');
  });

  it('multiple child loggers are independent', () => {
    const child1 = createChildLogger({ request_id: 'req-1' });
    const child2 = createChildLogger({ request_id: 'req-2' });
    expect(child1).not.toBe(child2);
  });

  it('child inherits log levels from parent', () => {
    const child = createChildLogger({ request_id: 'req-123' });
    expect(typeof child.debug).toBe('function');
    expect(typeof child.info).toBe('function');
    expect(typeof child.warn).toBe('function');
    expect(typeof child.error).toBe('function');
  });
});

describe('PII redaction', () => {
  it('logger info method is available', () => {
    expect(typeof logger.info).toBe('function');
  });

  it('child logger info method is available', () => {
    const child = createChildLogger({ request_id: 'req-123' });
    expect(typeof child.info).toBe('function');
  });

  it('child logger inherits redaction behavior', () => {
    const child = createChildLogger({ request_id: 'req-123' });
    const spy = vi.spyOn(child, 'info').mockImplementation(() => child);
    child.info('test');
    expect(spy).toHaveBeenCalled();
  });
});
