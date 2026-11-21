import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import {
  apiErrorHandler,
  apiNotFoundHandler,
  asyncHandler,
  parseAllowedCorsOrigins,
  safeBodyObject,
} from './httpHelpers';
import { resolveApiUrl, safeParseJsonResponse, type JsonResponseLike } from '../utils/apiResponse';

function makeMockRes() {
  const state: {
    statusCode: number;
    jsonBody: unknown;
    headersSent: boolean;
  } = {
    statusCode: 200,
    jsonBody: null,
    headersSent: false,
  };
  const res = {
    get headersSent() {
      return state.headersSent;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.jsonBody = payload;
      state.headersSent = true;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

function makeMockFetchResponse(opts: {
  ok: boolean;
  status: number;
  body: string;
  contentType?: string;
}): JsonResponseLike {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: {
      get(name: string) {
        return name.toLowerCase() === 'content-type' ? (opts.contentType ?? null) : null;
      },
    },
    async text() {
      return opts.body;
    },
  };
}

test('safeParseJsonResponse parses valid JSON and handles empty, HTML, and truncated responses without SyntaxError', async () => {
  const okData = await safeParseJsonResponse<{ ok: boolean }>(
    makeMockFetchResponse({
      ok: true,
      status: 200,
      body: JSON.stringify({ ok: true }),
      contentType: 'application/json',
    }),
    'Fallback'
  );
  assert.deepEqual(okData, { ok: true });

  await assert.rejects(
    () =>
      safeParseJsonResponse(
        makeMockFetchResponse({ ok: true, status: 200, body: '' }),
        'Fallback'
      ),
    (err: Error) =>
      err.message.includes('খালি উত্তর') &&
      err.message.includes('HTTP 200') &&
      err.message.includes('Web Service') &&
      !err.message.includes('Unexpected end of JSON input')
  );

  await assert.rejects(
    () =>
      safeParseJsonResponse(
        makeMockFetchResponse({ ok: false, status: 502, body: '' }),
        'Fallback'
      ),
    (err: Error) => err.message.includes('502')
  );

  await assert.rejects(
    () =>
      safeParseJsonResponse(
        makeMockFetchResponse({
          ok: true,
          status: 200,
          body: '<!doctype html><html><body>SPA</body></html>',
          contentType: 'text/html',
        }),
        'Fallback'
      ),
    (err: Error) => err.message.includes('JSON উত্তর দেয়নি')
  );

  await assert.rejects(
    () =>
      safeParseJsonResponse(
        makeMockFetchResponse({
          ok: false,
          status: 400,
          body: JSON.stringify({ error: 'Invalid transaction amount' }),
          contentType: 'application/json',
        }),
        'Fallback'
      ),
    (err: Error) => err.message === 'Invalid transaction amount'
  );
});

test('resolveApiUrl supports same-origin relative paths and optional VITE_API_BASE_URL', () => {
  assert.equal(resolveApiUrl('/api/health', ''), '/api/health');
  assert.equal(resolveApiUrl('api/rewards/sign', 'https://api.example.com/'), 'https://api.example.com/api/rewards/sign');
});

test('safeBodyObject, asyncHandler, apiNotFoundHandler, and apiErrorHandler always produce JSON errors', async () => {
  assert.deepEqual(safeBodyObject(undefined), {});
  assert.deepEqual(safeBodyObject(null), {});
  assert.deepEqual(safeBodyObject(['a']), {});
  assert.deepEqual(safeBodyObject({ action: 'checkin' }), { action: 'checkin' });

  const { res: nfRes, state: nfState } = makeMockRes();
  apiNotFoundHandler({ method: 'POST', originalUrl: '/api/missing' } as Request, nfRes);
  assert.equal(nfState.statusCode, 404);
  assert.deepEqual(nfState.jsonBody, {
    error: 'API endpoint not found',
    method: 'POST',
    path: '/api/missing',
  });

  let forwardedErr: unknown = null;
  const wrapped = asyncHandler(async () => {
    throw new Error('Async failure');
  });
  await new Promise<void>((resolve) => {
    wrapped(
      {} as Request,
      {} as Response,
      ((err?: unknown) => {
        forwardedErr = err;
        resolve();
      }) as NextFunction
    );
  });
  assert.ok(forwardedErr instanceof Error);

  const { res: errRes1, state: errState1 } = makeMockRes();
  apiErrorHandler(new SyntaxError('Unexpected token'), {} as Request, errRes1, (() => {}) as NextFunction);
  assert.equal(errState1.statusCode, 400);
  assert.deepEqual(errState1.jsonBody, { error: 'Invalid JSON request body' });

  const { res: errRes2, state: errState2 } = makeMockRes();
  apiErrorHandler({ type: 'entity.too.large' }, {} as Request, errRes2, (() => {}) as NextFunction);
  assert.equal(errState2.statusCode, 413);
  assert.deepEqual(errState2.jsonBody, { error: 'Request payload is too large' });

  const { res: errRes3, state: errState3 } = makeMockRes();
  apiErrorHandler(new Error('Boom'), {} as Request, errRes3, (() => {}) as NextFunction);
  assert.equal(errState3.statusCode, 500);
  assert.deepEqual(errState3.jsonBody, { error: 'Internal server error' });

  assert.deepEqual(
    parseAllowedCorsOrigins('https://a.onrender.com/, https://b.example.com', 'https://c.example.com/'),
    ['https://a.onrender.com', 'https://b.example.com', 'https://c.example.com']
  );
});
