import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowContext } from '@/flow/machine/machine';
import { createFlowStore } from '@/flow/store/store';

const { trackThenRedirect } = vi.hoisted(() => ({ trackThenRedirect: vi.fn() }));
vi.mock('@/analytics/analytics/analytics', () => ({ trackThenRedirect }));

import { buildOrderSnapshot, createOrderRunner, type OrderSnapshot } from './createOrder';

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

const ctx: FlowContext = {
  market: 'ee',
  locale: 'en',
  planId: 'plan_std_m',
  reviewStep: true,
  identified: true,
  openOrderId: null,
  reverifyOrderId: null,
  conflictRetried: false,
};
const snapshot: OrderSnapshot = { value: 0, tax: 0, currency: 'EUR', trial: 'true' };
const plan = { id: 'plan_std_m', priceNet: 899, vatRate: 0.24, currency: 'EUR' };

const saveOpenOrder = vi.fn();
const navigate = vi.fn();

const setup = () => {
  const store = createFlowStore(ctx, { name: 'CreatingOrder', ctx });
  const run = createOrderRunner({
    attempt: () => ({ ctx: store.getState().state.ctx, utm: { utm_source: 'news' }, snapshot }),
    origin: 'http://app.test',
    saveOpenOrder,
    navigate,
  });
  store.subscribe((next, previous) => {
    if (next.effects !== previous.effects) next.effects.forEach((e) => run(e, next.dispatch));
  });
  run({ type: 'createOrder', planId: 'plan_std_m' }, store.getState().dispatch);
  return store;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE', 'http://api.test');
  vi.stubEnv('NEXT_PUBLIC_ACCOUNT_URL', 'http://account.test');
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  fetchMock.mockReset();
});

const CREATED = { orderId: 'o1', paymentUrl: 'https://pay.test/o1' };
const fail = (status: number, code: string) => reply(status, { errors: [{ code, message: code }] });

describe('createOrder', () => {
  it('body = {planId, market (uppercase), returnUrl}', async () => {
    reply(201, CREATED);
    setup();
    await settle();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/v1/orders');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(Object.keys(body).sort()).toEqual(['market', 'planId', 'returnUrl']);
    expect(body.planId).toBe('plan_std_m');
    expect(body.market).toBe('EE');
    const returnUrl = new URL(body.returnUrl!);
    expect(returnUrl.pathname).toBe('/payment/return');
    expect(Object.fromEntries(returnUrl.searchParams)).toEqual({
      plan: 'standard',
      market: 'ee',
      locale: 'en',
      utm_source: 'news',
    });
  });

  it('no attempt marker written (04 Slice)', async () => {
    reply(201, CREATED);
    const before = [localStorage.length, sessionStorage.length];
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    setup();
    await settle();
    expect(writes).not.toHaveBeenCalled();
    expect([localStorage.length, sessionStorage.length]).toEqual(before);
    writes.mockRestore();
  });

  it('201 → redirect to paymentUrl', async () => {
    reply(201, CREATED);
    setup();
    await settle();
    expect(trackThenRedirect).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    (trackThenRedirect.mock.calls[0]![2] as () => void)();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(CREATED.paymentUrl);
  });

  it('409 already_subscribed → Account', async () => {
    fail(409, 'already_subscribed');
    const store = setup();
    await settle();
    expect(store.getState().state.name).toBe('Account');
    expect(trackThenRedirect).not.toHaveBeenCalled();
  });

  it('401 → StartingEid', async () => {
    fail(401, 'unauthenticated');
    const store = setup();
    await settle();
    expect(store.getState().state).toMatchObject({
      name: 'StartingEid',
      ctx: { planId: 'plan_std_m', identified: false },
    });
  });

  it('invalid_plan → Plans + notice=plan_unavailable', async () => {
    fail(400, 'invalid_plan');
    const store = setup();
    await settle();
    expect(store.getState().state).toMatchObject({
      name: 'Plans',
      view: { notice: 'plan_unavailable' },
    });
  });

  it('5xx → focused error banner', async () => {
    fail(500, 'internal_error');
    const store = setup();
    await settle();
    expect(store.getState().state).toMatchObject({
      name: 'Review',
      view: { errorKind: 'server' },
    });
    expect(saveOpenOrder).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('payment_started on 201', async () => {
    reply(201, CREATED);
    setup();
    await settle();
    expect(trackThenRedirect).toHaveBeenCalledExactlyOnceWith(
      'payment_started',
      { plan_id: 'plan_std_m', transaction_id: 'o1' },
      expect.any(Function),
    );
  });

  it('open order saved with orderId, paymentUrl, plan, market, locale and price, tax, currency, trial snapshot', async () => {
    reply(201, CREATED);
    setup();
    await settle();
    expect(saveOpenOrder).toHaveBeenCalledExactlyOnceWith({
      orderId: 'o1',
      paymentUrl: CREATED.paymentUrl,
      planId: 'plan_std_m',
      market: 'ee',
      locale: 'en',
      snapshot,
    });
  });
});

describe('buildOrderSnapshot', () => {
  it('full price when no trial: gross and VAT part in euros', () => {
    expect(buildOrderSnapshot(plan, false)).toEqual({
      value: 11.15,
      tax: 2.16,
      currency: 'EUR',
      trial: 'false',
    });
  });

  it('trial on standard: value and tax 0', () => {
    expect(buildOrderSnapshot(plan, true)).toEqual({
      value: 0,
      tax: 0,
      currency: 'EUR',
      trial: 'true',
    });
  });

  it('basic never has a trial', () => {
    expect(buildOrderSnapshot({ ...plan, id: 'plan_basic_m' }, true).trial).toBe('false');
  });
});
