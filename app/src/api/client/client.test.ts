import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { isApiError } from '../errors/errors';
import {
  REQUEST_TIMEOUT_MS,
  createIdentitySession,
  createOrder,
  getMe,
  getOrder,
  getPlans,
  request,
} from './client';
import { createOrderResponseSchema } from '../schemas/schemas';

vi.stubEnv('NEXT_PUBLIC_API_BASE', 'http://localhost:4010');
vi.stubEnv('NEXT_PUBLIC_ACCOUNT_URL', 'http://localhost:3000/account');

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

describe('client', () => {
  test('every request sends credentials: include and JSON content-type', async () => {
    reply(200, { market: 'EE', plans: [] });
    reply(201, { sessionId: 's', redirectUrl: 'r' });
    reply(200, { customerId: 'c', activeSubscription: null, trialEligible: true });
    reply(201, { orderId: 'o', paymentUrl: 'p' });
    reply(200, { orderId: 'o', planId: 'x', status: 'paid', createdAt: 't' });

    await getPlans('ee');
    await createIdentitySession('/auth/callback');
    await getMe();
    await createOrder({ planId: 'plan_std_m', market: 'ee', returnUrl: '/payment/return' });
    await getOrder('o');

    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [, init] of fetchMock.mock.calls as [
      string,
      RequestInit & { headers: Record<string, string> },
    ][]) {
      expect(init.credentials).toBe('include');
      expect(init.headers['content-type']).toBe('application/json');
    }
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/v1\/plans\?market=EE$/);
    expect(JSON.parse(fetchMock.mock.calls[3]?.[1].body)).toEqual({
      planId: 'plan_std_m',
      market: 'EE',
      returnUrl: '/payment/return',
    });
  });

  test.each([200, 201, 202])('any 2xx parses as success › %i', async (status) => {
    reply(status, { orderId: 'o', paymentUrl: 'p' });
    const result = await request({
      endpoint: 'createOrder',
      path: '/v1/orders',
      schema: createOrderResponseSchema,
    });
    expect(result).toEqual({ orderId: 'o', paymentUrl: 'p' });
  });

  test('any 2xx parses as success', async () => {
    reply(201, { orderId: 'o', paymentUrl: 'p' });
    await expect(createOrder({ planId: 'a', market: 'ee', returnUrl: 'r' })).resolves.toEqual({
      orderId: 'o',
      paymentUrl: 'p',
    });
  });

  test('non-2xx rejects with ApiError', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'no' }), { status: 401 }));
    await expect(getMe()).rejects.toMatchObject({ status: 401, kind: 'unauthenticated' });
  });

  test('fetch reject → network error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(getMe()).rejects.toMatchObject({ status: 0, kind: 'network' });
  });

  test('2xx with drifted body → invalid_response (Q56)', async () => {
    reply(200, { customerId: 1 });
    await expect(getMe()).rejects.toMatchObject({ code: 'invalid_response', kind: 'server' });
  });

  test('rejections are ApiErrors (guard)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    expect(isApiError(await getMe().catch((e: unknown) => e))).toBe(true);
  });

  test('sends a timeout signal; timeout abort → network', async () => {
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Promise.reject(new DOMException('timed out', 'TimeoutError'));
    });
    await expect(getMe()).rejects.toMatchObject({ code: 'network', kind: 'network' });
    expect(REQUEST_TIMEOUT_MS).toBe(15_000);
  });

  test('caller signal is combined and its abort → code aborted', async () => {
    const controller = new AbortController();
    let sentSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      sentSignal = init.signal;
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    await expect(getPlans('ee', controller.signal)).rejects.toMatchObject({
      status: 0,
      code: 'aborted',
      kind: 'network',
    });
    expect(sentSignal?.aborted).toBe(true);
  });

  test('market uppercased at the boundary for plans and orders', async () => {
    reply(200, { market: 'LT', plans: [] });
    reply(201, { orderId: 'o', paymentUrl: 'p' });
    await getPlans('lt');
    await createOrder({ planId: 'p', market: 'lt', returnUrl: 'r' });
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/market=LT$/);
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body).market).toBe('LT');
  });

  describe('abort during body read (Q57)', () => {
    const erroringBody = (fail: () => void) =>
      new Response(
        new ReadableStream({
          start(controller) {
            fail();
            controller.error(new DOMException('aborted', 'AbortError'));
          },
        }),
        { status: 200 },
      );

    test('caller abort → aborted', async () => {
      const controller = new AbortController();
      fetchMock.mockResolvedValueOnce(erroringBody(() => controller.abort()));
      await expect(getPlans('ee', controller.signal)).rejects.toMatchObject({
        code: 'aborted',
        kind: 'network',
      });
    });

    test('timeout → network', async () => {
      const timeout = new AbortController();
      vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(timeout.signal);
      fetchMock.mockResolvedValueOnce(erroringBody(() => timeout.abort()));
      await expect(getMe()).rejects.toMatchObject({ status: 0, code: 'network', kind: 'network' });
    });
  });

  test.each([
    [
      'getMe',
      (signal: AbortSignal) => getMe(signal),
      { customerId: 'c', activeSubscription: null, trialEligible: true },
    ],
    [
      'getOrder',
      (signal: AbortSignal) => getOrder('o', signal),
      { orderId: 'o', planId: 'x', status: 'paid', createdAt: 't' },
    ],
  ])('%s passes the caller signal on', async (_name, call, body) => {
    const controller = new AbortController();
    let sentSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      sentSignal = init.signal;
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    await call(controller.signal);
    controller.abort();
    expect(sentSignal?.aborted).toBe(true);
  });

  test('createOrder takes no signal (Q34)', () => {
    expect(createOrder.length).toBe(1);
  });
});
