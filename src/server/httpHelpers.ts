import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function safeBodyObject(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function apiNotFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'API endpoint not found',
    method: req.method,
    path: req.originalUrl,
  });
}

export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const errObj = err as { type?: string; status?: number; statusCode?: number; message?: string } | null;

  if (errObj?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    res.status(400).json({ error: 'Invalid JSON request body' });
    return;
  }

  if (errObj?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request payload is too large' });
    return;
  }

  const status =
    typeof errObj?.status === 'number' && errObj.status >= 400 && errObj.status < 600
      ? errObj.status
      : typeof errObj?.statusCode === 'number' && errObj.statusCode >= 400 && errObj.statusCode < 600
        ? errObj.statusCode
        : 500;

  const message =
    status < 500 && typeof errObj?.message === 'string' && errObj.message.trim()
      ? errObj.message.trim()
      : 'Internal server error';

  if (status >= 500) {
    console.error('API unhandled error:', err);
  }

  res.status(status).json({ error: message });
}

export function parseAllowedCorsOrigins(
  corsOriginsEnv = process.env.CORS_ORIGINS,
  appUrlEnv = process.env.APP_URL
): string[] {
  const origins = new Set<string>();
  for (const raw of [corsOriginsEnv, appUrlEnv]) {
    if (!raw || typeof raw !== 'string') continue;
    for (const part of raw.split(',')) {
      const trimmed = part.trim().replace(/\/+$/, '');
      if (trimmed && /^https?:\/\//i.test(trimmed)) {
        origins.add(trimmed);
      }
    }
  }
  return [...origins];
}

export function buildCorsMiddleware(allowedOrigins: readonly string[] = parseAllowedCorsOrigins()): RequestHandler {
  return (req, res, next) => {
    const requestOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/+$/, '') : '';
    const isAllowedOrigin =
      Boolean(requestOrigin) &&
      (allowedOrigins.includes('*') ||
        allowedOrigins.includes(requestOrigin) ||
        requestOrigin.endsWith('.onrender.com'));

    if (isAllowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept');
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}
