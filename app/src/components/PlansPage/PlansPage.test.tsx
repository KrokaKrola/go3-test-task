import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/api/errors/errors';
import type { PlanPageData } from '@/cms/parsePlanPage/parsePlanPage';
import type { FlowContext } from '@/flow/machine/machine';
import { createFlowStore } from '@/flow/store/store';
import { pickEidMessages } from '@/components/eid/eidMessages/eidMessages';
import { pickRetryMessages } from '@/components/RetryPoint/retryMessages/retryMessages';
import { planIdFor } from '@/domain/plans/plans';
import { openOrder } from '@/flow/openOrder/openOrder';
import { sessionStore } from '@/flow/browserStorage/browserStorage';
import { issueRunGateToken } from '@/flow/runGateToken/runGateToken';
import { HANDOFF_ATTR, endHandoff, isHandoffActive } from '@/flow/paymentHandoff/paymentHandoff';
import { getMessages } from '@/i18n/messages/messages';

const {
  fetchMe: getMe,
  fetchOrder,
  track,
  navigate,
  createOrder,
  trackThenRedirect,
} = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  fetchOrder: vi.fn(),
  track: vi.fn(),
  navigate: vi.fn(),
  createOrder: vi.fn(),
  trackThenRedirect: vi.fn((_event: string, _params: unknown, go: () => void) => go()),
}));
vi.mock('@/api/client/client', () => ({ createOrder }));
vi.mock('@/api/me/me', () => ({ fetchMe: getMe }));
vi.mock('@/api/order/order', () => ({ fetchOrder }));
vi.mock('@/api/identity/identity', () => ({
  createIdentitySession: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/analytics/analytics/analytics', () => ({
  track,
  trackThenRedirect,
  setCommonSource: vi.fn(),
}));
vi.mock('@/flow/navigate/navigate', () => ({ navigate }));

import type { PlansFlowStore } from '@/components/PlansController/PlansController';
import { PlansPage } from './PlansPage';

const text = {
  choose: 'Choose',
  perMonth: '/ month',
  trial: '30-day free trial',
  faqHeading: 'FAQ',
  handoff: 'Opening payment…',
};
const pair = { market: 'ee', locale: 'en' } as const;
const controller = (reviewStep: boolean, store?: PlansFlowStore) => ({
  pair,
  reviewStep,
  accountUrl: 'https://account.test/',
  apiBase: 'http://api.test',
  eidMessages: pickEidMessages(getMessages('en')),
  retryMessages: pickRetryMessages(getMessages('en')),
  store,
});
const price = '11,15 €';
const page: PlanPageData = {
  headline: 'Pick a plan',
  subhead: null,
  cards: (['basic', 'standard', 'premium'] as const).map((planKey) => ({
    planKey,
    planId: planIdFor(planKey) ?? planKey,
    title: planKey,
    bullets: [],
    badge: null,
    priceText: price,
    priceNet: 900,
    vatRate: 0.24,
    currency: 'EUR',
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
  createOrder.mockReturnValue(new Promise(() => {}));
  endHandoff();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
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

  it('identified select with reviewStep on navigates to the Review route', async () => {
    await setup('identified');
    choose('standard');
    const url = new URL(navigate.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/ee/en/review/');
  });

  it('bfcache restore of Plans frozen in Review → Plans, select works again', async () => {
    const store = await setup('identified');
    choose('standard');
    act(() => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });
    expect(store.getState().state.name).toBe('Plans');
    choose('basic');
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
    act(() => {
      store.getState().dispatch({ type: 'sessionFailed', error: apiError('server', 500) });
      store.getState().dispatch({ type: 'changePlan' });
    });
    expect(store.getState().state.name).toBe('Plans');
    choose('premium');
    expect(track.mock.calls.filter(([name]) => name === 'plan_selected')).toEqual([
      ['plan_selected', { plan_id: 'plan_basic_m' }],
      ['plan_selected', { plan_id: 'plan_prem_m' }],
    ]);
  });

  it('clicks the machine ignores are not tracked', async () => {
    const store = await setup('anon');
    // One act batch: the DOM still shows the cards, as with a fast double tap.
    act(() => {
      choose('basic');
      choose('basic');
      choose('standard');
    });
    expect(store.getState().state.ctx.planId).toBe('plan_basic_m');
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

  it('bfcache restore while StartingEid → Plans, cards back (Q69)', async () => {
    const store = await setup('anon');
    choose('basic');
    expect(screen.queryByRole('button', { name: 'Choose standard' })).toBeNull();
    act(() => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });
    expect(store.getState().state.name).toBe('Plans');
    expect(screen.getByRole('button', { name: 'Choose standard' })).toBeInTheDocument();
  });

  it('document.title returns to the page title after StartError → Change plan', async () => {
    document.title = 'Plans page';
    const store = await setup('anon');
    choose('basic');
    act(() => store.getState().dispatch({ type: 'sessionFailed', error: apiError('server', 500) }));
    expect(document.title).not.toBe('Plans page');
    fireEvent.click(
      screen.getByRole('button', { name: getMessages('en')['eid.action.changePlan'] }),
    );
    expect(document.title).toBe('Plans page');
  });

  describe('retry point on Plans (reviewStep off)', () => {
    const en = getMessages('en');

    it('reviewStep off: retry point shows the chosen plan preselected + banner; Try again → Gate', async () => {
      window.history.replaceState(null, '', '/ee/en/?plan=standard&notice=payment_declined');
      getMe.mockResolvedValue({ customerId: 'c', trialEligible: false, activeSubscription: null });
      const store = createFlowStore({ ...ctx(false), planId: 'plan_std_m', identified: true });
      render(<PlansPage page={page} text={text} controller={controller(false, store)} />);
      await act(async () => {});
      const banner = screen.getByRole('alert');
      expect(banner).toHaveTextContent(en['retry.notice.payment_declined']);
      expect(banner).toHaveFocus();
      expect(screen.getByText('standard', { selector: 'strong' })).toBeInTheDocument();
      expect(window.location.search).toBe('?plan=standard');

      fireEvent.click(screen.getByRole('button', { name: en['retry.action.tryAgain'] }));
      expect(store.getState().state.name).toBe('Gate');
    });

    it('Try again stays mounted, aria-disabled and focused while the Gate runs, with a status', async () => {
      window.history.replaceState(null, '', '/ee/en/?notice=payment_declined');
      getMe.mockResolvedValueOnce({
        customerId: 'c',
        trialEligible: false,
        activeSubscription: null,
      });
      const store = createFlowStore({ ...ctx(false), planId: 'plan_std_m', identified: true });
      render(<PlansPage page={page} text={text} controller={controller(false, store)} />);
      await act(async () => {});
      getMe.mockReturnValue(new Promise(() => {}));
      const button = screen.getByRole('button', { name: en['retry.action.tryAgain'] });
      button.focus();
      fireEvent.click(button);
      expect(store.getState().state.name).toBe('Gate');
      const busyButton = screen.getByRole('button', { name: en['retry.busy'] });
      expect(busyButton).toBe(button);
      expect(busyButton).toHaveAttribute('aria-disabled', 'true');
      expect(busyButton).toHaveFocus();
      expect(screen.getByRole('status')).toHaveTextContent(en['retry.busy']);
      expect(screen.getByRole('alert')).toHaveTextContent(en['retry.notice.payment_declined']);
      fireEvent.click(busyButton);
      expect(getMe).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['step 1 (open order, Pay disabled)', true],
      ['step 3 (/v1/me)', false],
    ])('Gate fails at %s → error banner gets focus', async (_label, atOrder) => {
      window.history.replaceState(null, '', '/ee/en/?notice=payment_declined');
      getMe.mockResolvedValueOnce({
        customerId: 'c',
        trialEligible: false,
        activeSubscription: null,
      });
      const store = createFlowStore({ ...ctx(false), planId: 'plan_std_m', identified: true });
      render(<PlansPage page={page} text={text} controller={controller(false, store)} />);
      await act(async () => {});
      const banner = screen.getByRole('alert');
      expect(banner).toHaveTextContent(en['retry.notice.payment_declined']);
      if (atOrder) {
        openOrder.save({
          orderId: 'o1',
          paymentUrl: 'http://pay.test/o1',
          planId: 'plan_std_m',
          market: 'ee',
          locale: 'en',
          snapshot: { value: 1, tax: 0, currency: 'EUR', trial: 'false' },
        });
        fetchOrder.mockRejectedValue(apiError('server', 500));
      } else getMe.mockRejectedValue(apiError('server', 500));
      const button = screen.getByRole('button', { name: en['retry.action.tryAgain'] });
      button.focus();
      fireEvent.click(button);
      await act(async () => {});
      expect(store.getState().state.name).toBe('Plans');
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(en['retry.error.other']);
      expect(alert).toHaveFocus();
    });

    it('chosen plan comes from the URL when nothing is stored', async () => {
      window.history.replaceState(
        null,
        '',
        '/ee/en/?market=ee&locale=en&plan=premium&notice=payment_cancelled',
      );
      getMe.mockResolvedValue({ customerId: 'c', trialEligible: false, activeSubscription: null });
      const realIdPage = {
        ...page,
        cards: page.cards.map((card) => ({ ...card, planId: planIdFor(card.planKey)! })),
      };
      render(<PlansPage page={realIdPage} text={text} controller={controller(false)} />);
      await act(async () => {});
      expect(screen.getByText('premium', { selector: 'strong' })).toBeInTheDocument();
    });

    it('Try again checks the open order another tab wrote: pending → Resume, Check status only', async () => {
      window.history.replaceState(null, '', '/ee/en/?notice=payment_declined');
      getMe.mockResolvedValue({ customerId: 'c', trialEligible: false, activeSubscription: null });
      fetchOrder.mockResolvedValue({ status: 'pending' });
      const store = createFlowStore({ ...ctx(false), planId: 'plan_std_m', identified: true });
      render(<PlansPage page={page} text={text} controller={controller(false, store)} />);
      await act(async () => {});
      openOrder.save({
        orderId: 'o1',
        paymentUrl: 'http://pay.test/o1',
        planId: 'plan_std_m',
        market: 'ee',
        locale: 'en',
        snapshot: { value: 1, tax: 0, currency: 'EUR', trial: 'false' },
      });
      fireEvent.click(screen.getByRole('button', { name: en['retry.action.tryAgain'] }));
      await act(async () => {});
      expect(fetchOrder).toHaveBeenCalledWith('http://api.test', 'o1', expect.any(AbortSignal));
      expect(store.getState().state.name).toBe('Resume');
      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
        en['retry.action.checkStatus'],
      ]);
    });

    it('reviewStep on: no Try again on Plans', async () => {
      window.history.replaceState(null, '', '/ee/en/?notice=plan_unavailable');
      await setup('identified', true);
      expect(screen.getByRole('alert')).toHaveTextContent(en['retry.notice.plan_unavailable']);
      expect(screen.queryByRole('button', { name: en['retry.action.tryAgain'] })).toBeNull();
    });

    it('rungate=1 (Q68): runs the Gate once for the URL plan, then strips the marker', async () => {
      issueRunGateToken(sessionStore, 'standard');
      window.history.replaceState(null, '', '/ee/en/?plan=standard&rungate=1');
      const store = await setup('identified', false);
      expect(store.getState().state.name).toBe('CreatingOrder');
      expect(track).not.toHaveBeenCalledWith('plan_selected', expect.anything());
      expect(window.location.search).toBe('?plan=standard');
    });

    it('reviewStep off (Q32): Gate → one POST with market → open order saved → payment redirect', async () => {
      createOrder.mockResolvedValue({ orderId: 'ord_1', paymentUrl: 'http://pay.test/ord_1' });
      issueRunGateToken(sessionStore, 'standard');
      window.history.replaceState(null, '', '/ee/en/?plan=standard&rungate=1&utm_source=x');
      await setup('eligible', false);
      await act(async () => {});
      expect(createOrder).toHaveBeenCalledTimes(1);
      const [body] = createOrder.mock.lastCall ?? [];
      expect(body).toMatchObject({ planId: 'plan_std_m', market: 'ee' });
      const returnUrl = new URL(body.returnUrl);
      expect(returnUrl.pathname).toBe('/payment/return');
      expect(returnUrl.searchParams.get('market')).toBe('ee');
      expect(returnUrl.searchParams.get('utm_source')).toBe('x');
      // Plan card price + trial (07 `purchase` snapshot).
      expect(openOrder.read()).toMatchObject({
        orderId: 'ord_1',
        planId: 'plan_std_m',
        snapshot: { value: 0, tax: 0, currency: 'EUR', trial: 'true' },
      });
      expect(trackThenRedirect).toHaveBeenCalledWith(
        'payment_started',
        { plan_id: 'plan_std_m', transaction_id: 'ord_1' },
        expect.any(Function),
      );
      expect(navigate).toHaveBeenLastCalledWith('http://pay.test/ord_1');
    });

    describe('payment handoff (Q77)', () => {
      // What the inline boot script does for `rungate=1`.
      const visitAfterCallback = (planKey = 'standard', token: string | null = planKey) => {
        if (token) issueRunGateToken(sessionStore, token);
        window.history.replaceState(null, '', `/ee/en/?plan=${planKey}&rungate=1`);
        document.documentElement.setAttribute(HANDOFF_ATTR, '');
      };

      it('stays on the handoff screen through Gate and order up to the payment redirect', async () => {
        createOrder.mockResolvedValue({ orderId: 'ord_1', paymentUrl: 'http://pay.test/ord_1' });
        visitAfterCallback();
        await setup('identified', false);
        await act(async () => {});
        expect(navigate).toHaveBeenLastCalledWith('http://pay.test/ord_1');
        expect(isHandoffActive()).toBe(true);
      });

      it('order fails → handoff ends, retry point shows', async () => {
        createOrder.mockRejectedValueOnce(apiError('server', 500));
        visitAfterCallback();
        await setup('identified', false);
        await act(async () => {});
        expect(isHandoffActive()).toBe(false);
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      it('no Gate intent (crafted link) → handoff ends at once', async () => {
        visitAfterCallback('standard', null);
        await setup('identified', false);
        expect(isHandoffActive()).toBe(false);
      });

      it('bfcache restore from payment → Plans, handoff ends (inv. 6)', async () => {
        createOrder.mockResolvedValue({ orderId: 'ord_1', paymentUrl: 'http://pay.test/ord_1' });
        visitAfterCallback();
        const store = await setup('identified', false);
        await act(async () => {});
        act(() => {
          window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        });
        expect(store.getState().state).toMatchObject({
          name: 'Plans',
          ctx: { openOrderId: 'ord_1' },
        });
        expect(isHandoffActive()).toBe(false);
      });
    });

    it('reviewStep off: snapshot uses the card gross price when there is no trial', async () => {
      createOrder.mockResolvedValue({ orderId: 'ord_2', paymentUrl: 'http://pay.test/ord_2' });
      await setup('identified', false);
      choose('basic');
      await act(async () => {});
      expect(openOrder.read()?.snapshot).toEqual({
        value: 11.16,
        tax: 2.16,
        currency: 'EUR',
        trial: 'false',
      });
      expect(navigate).toHaveBeenLastCalledWith('http://pay.test/ord_2');
    });

    it('reviewStep off: POST fails → retry point banner; Try again → new POST', async () => {
      createOrder.mockRejectedValueOnce(apiError('server', 500));
      const store = await setup('identified', false);
      choose('standard');
      await act(async () => {});
      expect(store.getState().state).toMatchObject({
        name: 'Plans',
        view: { errorKind: 'server' },
      });
      createOrder.mockResolvedValueOnce({ orderId: 'ord_3', paymentUrl: 'http://pay.test/ord_3' });
      fireEvent.click(screen.getByRole('button', { name: en['retry.action.tryAgain'] }));
      await act(async () => {});
      expect(createOrder).toHaveBeenCalledTimes(2);
      expect(navigate).toHaveBeenLastCalledWith('http://pay.test/ord_3');
    });

    it('reviewStep off: Gate finds the open order paid → payment return page', async () => {
      openOrder.save({
        orderId: 'ord_9',
        paymentUrl: 'http://pay.test/ord_9',
        planId: 'plan_std_m',
        market: 'ee',
        locale: 'en',
        snapshot: { value: 0, tax: 0, currency: 'EUR', trial: 'true' },
      });
      fetchOrder.mockResolvedValue({ status: 'paid', actionUrl: null });
      await setup('identified', false);
      choose('standard');
      await act(async () => {});
      expect(createOrder).not.toHaveBeenCalled();
      const target = new URL(String(navigate.mock.calls.at(-1)?.[0]));
      expect(target.pathname).toBe('/payment/return/');
      expect(target.searchParams.get('orderId')).toBe('ord_9');
    });

    it.each([
      ['no token (crafted link)', null],
      ['token for another plan', 'basic'],
    ])('rungate=1 with %s → Plans, no Gate, marker stripped (inv. 1)', async (_, tokenPlan) => {
      if (tokenPlan) issueRunGateToken(sessionStore, tokenPlan);
      window.history.replaceState(null, '', '/ee/en/?plan=premium&rungate=1');
      const store = await setup('identified', false);
      expect(store.getState().state.name).toBe('Plans');
      expect(getMe).toHaveBeenCalledTimes(1); // Entry only, no Gate step 3
      expect(window.location.search).toBe('?plan=premium');
    });
  });
});
