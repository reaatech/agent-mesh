/**
 * SSE MCP Transport - Legacy client compatibility
 * GET /mcp/sse — establish SSE stream
 * POST /mcp/messages?sessionId=<id> — message delivery
 */

import type { Request, Response } from 'express';
import { logger } from '../observability/logger.js';
import crypto from 'crypto';

/** Active SSE connections */
const sseConnections = new Map<string, Response>();

/**
 * Establish SSE stream for MCP messages
 */
export async function sseHandler(req: Request, res: Response): Promise<void> {
  const sessionId = (req.query.sessionId as string) || crypto.randomUUID();

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Store connection
  sseConnections.set(sessionId, res);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  logger.info(`SSE connection established: ${sessionId}`);

  // Handle client disconnect
  req.on('close', () => {
    sseConnections.delete(sessionId);
    logger.info(`SSE connection closed: ${sessionId}`);
  });
}

/**
 * Send message to client via SSE
 */
export function sendToClient(sessionId: string, message: unknown): boolean {
  const connection = sseConnections.get(sessionId);
  if (!connection) {
    return false;
  }

  connection.write(`data: ${JSON.stringify(message)}\n\n`);
  return true;
}

/**
 * Handle incoming MCP message via POST
 */
export async function messageHandler(req: Request, res: Response): Promise<void> {
  const sessionId = req.query.sessionId as string;
  const message = req.body;

  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }

  logger.info(`MCP message received: sessionId=${sessionId}, method=${req.method}`);

  // Process message and send response via SSE
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

/**
 * Close SSE connection for a session
 */
export function closeSseConnection(sessionId: string): boolean {
  const connection = sseConnections.get(sessionId);
  if (connection) {
    connection.end();
    sseConnections.delete(sessionId);
    return true;
  }
  return false;
}

/**
 * Get count of active SSE connections
 */
export function getActiveConnectionCount(): number {
  return sseConnections.size;
}
