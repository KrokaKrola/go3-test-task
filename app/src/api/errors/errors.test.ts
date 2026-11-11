import { describe, expect, test } from 'vitest';
import {
  API_ERROR_KINDS,
  isApiError,
  toApiError,
  type ApiErrorKind,
  type Endpoint,
} from './errors';

const json = (status: number, body: unknown, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe('isApiError', () => {
  test('accepts adapter output, rejects other throws', async () => {
    expect(isApiError(await toApiError(json(500, {}), 'me'))).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError({ status: 500 })).toBe(false);
    expect(isApiError({ status: 500, code: 'x', message: 'm' })).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});

describe('toApiError', () => {
  test('{errors[]} → first entry', async () => {
    const error = await toApiError(
      json(409, {
        errors: [
          { code: 'already_subscribed', message: 'Has one' },
          { code: 'x', message: 'y' },
        ],
      }),
      'createOrder',
    );
    expect(error).toMatchObject({ status: 409, code: 'already_subscribed', message: 'Has one' });
  });

  test.each([
    ['{error}', json(400, { error: 'bad market' }), 400, 'invalid_request', 'bad market'],
    ['non-JSON', new Response('<html>', { status: 404 }), 404, 'not_found', 'not_found'],
    ['empty', new Response(null, { status: 503 }), 503, 'internal_error', 'internal_error'],
    ['401', json(401, { error: 'no' }), 401, 'unauthenticated', 'no'],
    ['409', new Response('', { status: 409 }), 409, 'conflict', 'conflict'],
  ])(
    '{error} / non-JSON / empty → code from status › %s',
    async (_n, res, status, code, message) => {
      expect(await toApiError(res, 'me')).toMatchObject({ status, code, message });
    },
  );

  test('fetch reject → status 0 network', async () => {
    expect(await toApiError(new TypeError('Failed to fetch'), 'me')).toMatchObject({
      status: 0,
      code: 'network',
      kind: 'network',
    });
  });

  test('Retry-After parsed, else 30', async () => {
    const withHeader = await toApiError(
      json(429, { error: 'slow' }, { 'Retry-After': '12' }),
      'identitySession',
    );
    const without = await toApiError(json(429, { error: 'slow' }), 'identitySession');
    const garbage = await toApiError(
      json(429, { error: 'slow' }, { 'Retry-After': 'soon' }),
      'identitySession',
    );
    expect(withHeader.retryAfterSec).toBe(12);
    expect(without.retryAfterSec).toBe(30);
    expect(garbage.retryAfterSec).toBe(30);
  });

  test('no retryAfterSec outside identity 429 (Q42)', async () => {
    expect(
      (await toApiError(json(429, {}, { 'Retry-After': '12' }), 'me')).retryAfterSec,
    ).toBeUndefined();
    expect((await toApiError(json(500, {}), 'me')).retryAfterSec).toBeUndefined();
  });
});

type KindRow = [string, Endpoint, number, unknown, ApiErrorKind];
const orderErr = (code: string) => ({ errors: [{ code, message: code }] });

const kindRows: KindRow[] = [
  ['0 network', 'me', 0, undefined, 'network'],
  ['5xx', 'plans', 500, orderErr('internal_error'), 'server'],
  ['401', 'me', 401, { error: 'no' }, 'unauthenticated'],
  [
    '409 already_subscribed',
    'createOrder',
    409,
    orderErr('already_subscribed'),
    'alreadySubscribed',
  ],
  ['409 other code', 'createOrder', 409, orderErr('pending_order'), 'conflict'],
  ['400 invalid_plan', 'createOrder', 400, orderErr('invalid_plan'), 'invalidPlan'],
  ['404 on orders/{id}', 'getOrder', 404, orderErr('order_not_found'), 'orderNotFound'],
  ['429 on identity', 'identitySession', 429, { error: 'slow' }, 'rateLimited'],
  ['429 outside identity', 'me', 429, { error: 'slow' }, 'server'],
  ['other 4xx', 'identitySession', 400, { error: 'bad' }, 'badRequest'],
  ['404 elsewhere', 'plans', 404, { error: 'nope' }, 'badRequest'],
  ['unknown code takes status kind', 'createOrder', 400, orderErr('weird'), 'badRequest'],
];

describe('kind', () => {
  test.each(kindRows)('%s', async (_name, endpoint, status, body, kind) => {
    const source = status === 0 ? new TypeError('x') : json(status, body);
    expect((await toApiError(source, endpoint)).kind).toBe(kind);
  });

  test('no kind is paymentFailed', async () => {
    const produced = new Set<ApiErrorKind>();
    for (const [, endpoint, status, body] of kindRows) {
      const source = status === 0 ? new TypeError('x') : json(status, body);
      produced.add((await toApiError(source, endpoint)).kind);
    }
    for (const kind of produced) expect(API_ERROR_KINDS).toContain(kind);
    expect(API_ERROR_KINDS).not.toContain('paymentFailed');
  });
});
