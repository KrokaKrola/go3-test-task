import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/api/errors/errors';
import { createFlowStore } from '@/flow/store/store';
import type { FlowContext, FlowEffect } from '@/flow/machine/machine';
import { runGateEffect, type GateDeps } from './gate';

const apiError = (kind: ApiError['kind'], status: number): ApiError =>
  ({ kind, status, code: kind, message: kind }) as ApiError;

const ctx = (over: Partial<FlowContext> = {}): FlowContext => ({
  market: 'ee',
  locale: 'et',
  planId: 'plan_std_m',
  reviewStep: false,
  identified: true,
  openOrderId: null,
  reverifyOrderId: null,
  conflictRetried: false,
  ...over,
});

const me = { activeSubscription: null };
const subscribed = { activeSubscription: { planId: 'p', status: 'active', renewsAt: 'x' } };

const deps = {
  getMe: vi.fn(),
  getOrder: vi.fn(),
  clearOpenOrder: vi.fn(),
} satisfies GateDeps;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// Retry point = Plans (reviewStep off); Try again starts the Gate. Effects the Gate must not run
// (createOrder is W-11) are recorded, never executed.
async function tryAgain(over: Partial<FlowContext> = {}) {
  const store = createFlowStore(ctx(over), {
    name: 'Plans',
    ctx: ctx(over),
    view: { notice: 'payment_declined' },
  });
  const seen: FlowEffect[] = [];
  const abort = new AbortController();
  store.subscribe((next, previous) => {
    if (next.effects === previous.effects) return;
    for (const effect of next.effects) {
      seen.push(effect);
      runGateEffect(effect, store.getState().dispatch, abort.signal, deps);
    }
  });
  store.getState().dispatch({ type: 'tryAgain' });
  await flush();
  return { store, seen, posted: () => seen.some((effect) => effect.type === 'createOrder') };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('gate step 1: open order', () => {
  it.each(['pending', 'requires_action'] as const)(
    'step 1: pending/requires_action → Resume, no POST (%s)',
    async (status) => {
      deps.getOrder.mockResolvedValue({ status });
      const { store, posted } = await tryAgain({ openOrderId: 'o1' });
      expect(deps.getOrder).toHaveBeenCalledWith('o1', expect.any(AbortSignal));
      expect(store.getState().state).toMatchObject({ name: 'Resume', orderId: 'o1' });
      expect(deps.getMe).not.toHaveBeenCalled();
      expect(posted()).toBe(false);
    },
  );

  it('paid → Confirmed', async () => {
    deps.getOrder.mockResolvedValue({ status: 'paid' });
    const { store, posted } = await tryAgain({ openOrderId: 'o1' });
    expect(store.getState().state).toMatchObject({ name: 'Confirmed', orderId: 'o1' });
    expect(posted()).toBe(false);
  });

  it('failed/404 → cleared, continue', async () => {
    deps.getMe.mockResolvedValue(me);
    deps.getOrder.mockResolvedValueOnce({ status: 'failed' });
    const failed = await tryAgain({ openOrderId: 'o1' });
    expect(deps.clearOpenOrder).toHaveBeenCalledTimes(1);
    expect(failed.store.getState().state.name).toBe('CreatingOrder');
    expect(failed.store.getState().state.ctx.openOrderId).toBeNull();

    deps.getOrder.mockRejectedValueOnce(apiError('orderNotFound', 404));
    const missing = await tryAgain({ openOrderId: 'o1' });
    expect(deps.clearOpenOrder).toHaveBeenCalledTimes(2);
    expect(missing.store.getState().state.name).toBe('CreatingOrder');
  });

  it('401 → IdentityLost', async () => {
    deps.getOrder.mockRejectedValue(apiError('unauthenticated', 401));
    const { store, posted } = await tryAgain({ openOrderId: 'o1' });
    expect(store.getState().state).toMatchObject({ name: 'IdentityLost', orderId: 'o1' });
    expect(deps.clearOpenOrder).not.toHaveBeenCalled();
    expect(posted()).toBe(false);
  });

  it.each([
    ['5xx', apiError('server', 500)],
    ['network', apiError('network', 0)],
  ])('5xx/network → retry point error, no POST (%s)', async (_label, error) => {
    deps.getOrder.mockRejectedValue(error);
    const { store, posted } = await tryAgain({ openOrderId: 'o1' });
    expect(store.getState().state).toMatchObject({
      name: 'Plans',
      view: { errorKind: error.kind, payDisabled: true },
    });
    expect(deps.getMe).not.toHaveBeenCalled();
    expect(deps.clearOpenOrder).not.toHaveBeenCalled();
    expect(posted()).toBe(false);
  });
});

describe('gate step 3: /v1/me', () => {
  it('step 3: activeSubscription → Account', async () => {
    deps.getMe.mockResolvedValue(subscribed);
    const { store, posted } = await tryAgain();
    expect(store.getState().state.name).toBe('Account');
    expect(posted()).toBe(false);
  });

  it('401 → StartingEid, context kept', async () => {
    deps.getMe.mockRejectedValue(apiError('unauthenticated', 401));
    const { store, posted } = await tryAgain();
    const { state } = store.getState();
    expect(state.name).toBe('StartingEid');
    expect(state.ctx).toMatchObject({ planId: 'plan_std_m', market: 'ee', locale: 'et' });
    expect(posted()).toBe(false);
  });

  it.each([
    ['5xx', apiError('server', 500)],
    ['network', apiError('network', 0)],
  ])('5xx/network → retry point error, no POST (%s)', async (_label, error) => {
    deps.getMe.mockRejectedValue(error);
    const { store, posted } = await tryAgain();
    expect(store.getState().state).toMatchObject({
      name: 'Plans',
      view: { errorKind: error.kind },
    });
    expect(posted()).toBe(false);
  });

  it('200 → CreatingOrder', async () => {
    deps.getMe.mockResolvedValue(me);
    const { store, seen } = await tryAgain();
    expect(store.getState().state.name).toBe('CreatingOrder');
    // The machine asks for the POST; W-11 runs it.
    expect(seen).toContainEqual({ type: 'createOrder', planId: 'plan_std_m' });
    expect(deps.getOrder).not.toHaveBeenCalled();
  });

  it('aborted: late response is ignored', async () => {
    let resolveMe!: (value: unknown) => void;
    deps.getMe.mockReturnValue(new Promise((resolve) => (resolveMe = resolve)));
    const dispatch = vi.fn();
    const abort = new AbortController();
    runGateEffect({ type: 'fetchMe' }, dispatch, abort.signal, deps);
    abort.abort();
    resolveMe(me);
    await flush();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
