import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/api/errors/errors';
import type { PlanPageData } from '@/cms/parsePlanPage/parsePlanPage';
import type { FlowContext } from '@/flow/machine/machine';
import { createFlowStore } from '@/flow/store/store';

const {
  fetchMe: getMe,
  track,
  navigate,
} = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  track: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock('@/api/me/me', () => ({ fetchMe: getMe }));
vi.mock('@/analytics/analytics/analytics', () => ({ track, setCommonSource: vi.fn() }));
vi.mock('@/flow/navigate/navigate', () => ({ navigate }));

import type { PlansFlowStore } from '@/components/PlansController/PlansController';
import { PlansPage } from './PlansPage';

const text = {
  choose: 'Choose',
  perMonth: '/ month',
  trial: '30-day free trial',
  faqHeading: 'FAQ',
};
const pair = { market: 'ee', locale: 'en' } as const;
const controller = (reviewStep: boolean, store?: PlansFlowStore) => ({
  pair,
  reviewStep,
  accountUrl: 'https://account.test/',
  apiBase: 'http://api.test',
  store,
});
const price = '11,15 €';
const page: PlanPageData = {
  headline: 'Pick a plan',
  subhead: null,
  cards: (['basic', 'standard', 'premium'] as const).map((planKey) => ({
    planKey,
    planId: `id_${planKey}`,
    title: planKey,
    bullets: [],
    badge: null,
    priceText: price,
  })),
  legalText: ['Legal'],
  faq: [],
};

const ctx = (reviewStep: boolean): FlowContext => ({
  market: 'ee',
  locale: 'en',
  planId: null,
  reviewStep,
  identified: false,
  openOrderId: null,
  reverifyOrderId: null,
  conflictRetried: false,
});

const apiError = (kind: ApiError['kind'], status: number): ApiError =>
  ({ kind, status, code: kind, message: kind }) as ApiError;

const setup = async (
  me: 'anon' | 'identified' | 'eligible' | 'subscribed' | 'down',
  reviewStep = true,
) => {
  if (me === 'anon') getMe.mockRejectedValue(apiError('unauthenticated', 401));
  else if (me === 'down') getMe.mockRejectedValue(apiError('server', 500));
  else
    getMe.mockResolvedValue({
      customerId: 'c',
      trialEligible: me === 'eligible',
      activeSubscription:
        me === 'subscribed' ? { planId: 'plan_std_m', status: 'active', renewsAt: 'x' } : null,
    });
  const store = createFlowStore(ctx(reviewStep));
  render(<PlansPage page={page} text={text} controller={controller(reviewStep, store)} />);
  await act(async () => {});
  return store;
};

const choose = (title: string) =>
  fireEvent.click(screen.getByRole('button', { name: `Choose ${title}` }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PlansPage', () => {
  it('trial line rendered before /v1/me resolves', () => {
    const html = renderToString(
      <PlansPage page={page} text={text} controller={controller(true)} />,
    );
    expect(html.match(/30-day free trial/g)).toHaveLength(2);
    expect(html).toContain(price);
  });

  it('/v1/me activeSubscription → ACCOUNT_URL', async () => {
    const store = await setup('subscribed');
    expect(navigate).toHaveBeenCalledWith('https://account.test/');
    expect(store.getState().state.name).toBe('Account');
    expect(track).not.toHaveBeenCalledWith('plan_viewed', expect.anything());
  });

  it.each(['anon', 'down'] as const)(
    '401/5xx → anonymous, select → StartingEid (%s)',
    async (me) => {
      const store = await setup(me);
      expect(store.getState().state.name).toBe('Plans');
      choose('standard');
      expect(store.getState().state.name).toBe('StartingEid');
    },
  );

  it('identified select → Review', async () => {
    const store = await setup('identified');
    choose('standard');
    expect(store.getState().state.name).toBe('Review');
  });

  it('reviewStep off: identified select → Gate', async () => {
    const store = await setup('identified', false);
    choose('standard');
    expect(store.getState().state.name).toBe('Gate');
  });

  it('identified + not trialEligible hides the trial lines but keeps them in the DOM', async () => {
    await setup('identified');
    for (const line of screen.getAllByText(text.trial))
      expect(line).toHaveStyle({ visibility: 'hidden' });
  });

  it('identified + trialEligible keeps the trial lines visible', async () => {
    await setup('eligible');
    for (const line of screen.getAllByText(text.trial))
      expect(line).toHaveStyle({ visibility: 'visible' });
  });

  it('plan_viewed once after /v1/me resolves', async () => {
    getMe.mockResolvedValue({ customerId: 'c', trialEligible: true, activeSubscription: null });
    const store = createFlowStore(ctx(true));
    render(<PlansPage page={page} text={text} controller={controller(true, store)} />);
    expect(track).not.toHaveBeenCalled();
    await act(async () => {});
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('plan_viewed', { identified: true });
    choose('basic');
    expect(track.mock.calls.filter(([name]) => name === 'plan_viewed')).toHaveLength(1);
  });

  it('plan_selected on every select', async () => {
    const store = await setup('anon');
    choose('basic');
    expect(store.getState().state.name).toBe('StartingEid');
    store.getState().dispatch({ type: 'sessionFailed', error: apiError('server', 500) });
    store.getState().dispatch({ type: 'changePlan' });
    expect(store.getState().state.name).toBe('Plans');
    choose('premium');
    expect(track.mock.calls.filter(([name]) => name === 'plan_selected')).toEqual([
      ['plan_selected', { plan_id: 'id_basic' }],
      ['plan_selected', { plan_id: 'id_premium' }],
    ]);
  });

  it('clicks the machine ignores are not tracked', async () => {
    const store = await setup('anon');
    choose('basic');
    choose('basic');
    choose('standard');
    expect(store.getState().state.ctx.planId).toBe('id_basic');
    expect(track.mock.calls.filter(([name]) => name === 'plan_selected')).toHaveLength(1);
  });

  it('select before /v1/me settles is held, enabled, and applied once Plans is reached', async () => {
    let resolveMe!: (me: unknown) => void;
    getMe.mockReturnValue(new Promise((resolve) => (resolveMe = resolve)));
    const store = createFlowStore(ctx(true));
    render(<PlansPage page={page} text={text} controller={controller(true, store)} />);
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Choose standard' })).toBeEnabled();
    choose('standard');
    expect(store.getState().state.name).toBe('Entry');
    expect(track).not.toHaveBeenCalled();
    await act(async () =>
      resolveMe({ customerId: 'c', trialEligible: true, activeSubscription: null }),
    );
    expect(store.getState().state.name).toBe('Review');
    expect(track.mock.calls.map(([name]) => name)).toEqual(['plan_viewed', 'plan_selected']);
  });
});
