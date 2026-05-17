import { env } from '@reaatech/agent-mesh';
import type { NextFunction, Request, Response } from 'express';

function isHttps(req: Request): boolean {
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

function shouldEnforceHttps(req: Request): boolean {
  if (env.NODE_ENV !== 'production') {
    return false;
  }

  if (isHttps(req)) {
    return false;
  }

  if (req.path === '/health' || req.path === '/health/deep') {
    return false;
  }

  return true;
}

function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  if (shouldEnforceHttps(req)) {
    const host = req.get('Host');
    const url = `https://${host}${req.originalUrl}`;
    res.redirect(301, url);
    return;
  }
  next();
}

function hstsHeader(_req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
}

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set('X-Frame-Options', 'DENY');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-XSS-Protection', '1; mode=block');
  res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
}

export function tlsMiddleware(req: Request, res: Response, next: NextFunction): void {
  httpsRedirect(req, res, () => {
    hstsHeader(req, res, () => {
      securityHeaders(req, res, next);
    });
  });
}

export {
  hstsHeader as hstsMiddleware,
  httpsRedirect as httpsRedirectMiddleware,
  securityHeaders as securityHeadersMiddleware,
};
