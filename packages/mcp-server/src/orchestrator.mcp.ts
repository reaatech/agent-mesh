import type { Request, Response } from 'express';
import { logger } from '@reaatech/agent-mesh-observability';
import crypto from 'crypto';

const sseConnections = new Map<string, Response>();

export async function sseHandler(req: Request, res: Response): Promise<void> {
  const sessionId = (req.query.sessionId as string) || crypto.randomUUID();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  sseConnections.set(sessionId, res);

  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  logger.info(`SSE connection established: ${sessionId}`);

  req.on('close', () => {
    sseConnections.delete(sessionId);
    logger.info(`SSE connection closed: ${sessionId}`);
  });
}

export function sendToClient(sessionId: string, message: unknown): boolean {
  const connection = sseConnections.get(sessionId);
  if (!connection) {
    return false;
  }

  connection.write(`data: ${JSON.stringify(message)}\n\n`);
  return true;
}

export async function messageHandler(req: Request, res: Response): Promise<void> {
  const sessionId = req.query.sessionId as string;
  const message = req.body;

  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }

  logger.info(`MCP message received: sessionId=${sessionId}, method=${req.method}`);

  const response = {
    type: 'message',
    sessionId,
    timestamp: new Date().toISOString(),
    payload: message,
  };

  const delivered = sendToClient(sessionId, response);

  res.json({
    success: true,
    delivered,
    sessionId,
  });
}

export function closeSseConnection(sessionId: string): boolean {
  const connection = sseConnections.get(sessionId);
  if (connection) {
    connection.end();
    sseConnections.delete(sessionId);
    return true;
  }
  return false;
}

export function getActiveConnectionCount(): number {
  return sseConnections.size;
}
