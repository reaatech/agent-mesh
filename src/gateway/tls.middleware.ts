/**
 * TLS enforcement middleware
 * HTTPS redirect (production only) and security headers
 */

import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

/**
 * Check if request is over HTTPS
 */
function isHttps(req: Request): boolean {
  // Check various indicators of HTTPS
  if (req.secure) {
    return true;
  }
  if (req.headers['x-forwarded-proto'] === 'https') {
    return true;
  }
  if (req.headers['x-forwarded-ssl'] === 'on') {
    return true;
  }
  return false;
}

/**
 * Check if we should enforce HTTPS redirect
 */
function shouldEnforceHttps(req: Request): boolean {
  // Only enforce in production
  if (env.NODE_ENV !== 'production') {
    return false;
  }

  // Skip if already HTTPS
  if (isHttps(req)) {
    return false;
  }

  // Skip health check endpoints (often called by load balancers over HTTP)
  if (req.path === '/health' || req.path === '/health/deep') {
    return false;
  }

  return true;
}

/**
 * Redirect HTTP to HTTPS
 */
function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  if (shouldEnforceHttps(req)) {
    const host = req.get('Host');
    const url = `https://${host}${req.originalUrl}`;
    res.redirect(301, url);
    return;
  }
  next();
}

/**
 * Set HSTS header
 */
function hstsHeader(_req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV === 'production') {
    // 1 year max-age, include subdomains, allow preload
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
}

/**
 * Set security headers
 */
function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Prevent clickjacking
  res.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.set('X-Content-Type-Options', 'nosniff');

  // Enable XSS filter in browsers
  res.set('X-XSS-Protection', '1; mode=block');

  // Content Security Policy - restrict resource loading
  res.set(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'"
  );

  // Referrer Policy
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy - disable unnecessary features
  res.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  next();
}

/**
 * Combined TLS middleware that applies all security measures
 */
export function tlsMiddleware(req: Request, res: Response, next: NextFunction): void {
  httpsRedirect(req, res, () => {
    hstsHeader(req, res, () => {
      securityHeaders(req, res, next);
    });
  });
}

/**
 * HTTPS redirect middleware (standalone)
 */
export { httpsRedirect as httpsRedirectMiddleware };

/**
 * HSTS middleware (standalone)
 */
export { hstsHeader as hstsMiddleware };

/**
 * Security headers middleware (standalone)
 */
export { securityHeaders as securityHeadersMiddleware };
