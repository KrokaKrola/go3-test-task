import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openOrder } from '@/flow/openOrder/openOrder';

const { fetchOrder, navigateReplace, navigate, createIdentitySession } = vi.hoisted(() => ({
  fetchOrder: vi.fn(),
  navigateReplace: vi.fn(),
  navigate: vi.fn(),
  createIdentitySession: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/api/order/order', () => ({ fetchOrder }));
vi.mock('@/api/client/client', () => ({ getPlans: vi.fn() }));
vi.mock('@/api/identity/identity', () => ({ createIdentitySession }));
vi.mock('@/flow/navigate/navigate', () => ({ navigate, navigateReplace }));
vi.mock('@/analytics/analytics/analytics', () => ({
  track: vi.fn(),
  setCommonSource: vi.fn(),
  purchaseSent: () => false,
  trackThenRedirect: vi.fn((_e: string, _p: unknown, go: () => void) => go()),
}));

import {
  OPEN_ORDER,
  apiError,
  en,
  heading,
  liveRegion,
  mount,
  order,
  visit,
} from '@/components/payment/paymentTestKit/paymentTestKit';

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const pendingForever = () => fetchOrder.mockResolvedValue(order('pending'));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  visit();
});
afterEach(() => vi.useRealTimers());

describe('Polling', () => {
  it('"Still confirming" at 20 s', async () => {
    pendingForever();
    await mount();
    expect(liveRegion()).toHaveTextContent(en['payment.polling.status']);
    await advance(19_000);
    expect(liveRegion()).toHaveTextContent(en['payment.polling.status']);
    await advance(1_000);
    expect(liveRegion()).toHaveTextContent(en['payment.polling.stillConfirming']);
  });

  it('polls every 2 s for 20 s, then every 5 s', async () => {
    pendingForever();
    await mount();
    expect(fetchOrder).toHaveBeenCalledTimes(1); // PaymentReturn's GET
    await advance(20_000);
    expect(fetchOrder).toHaveBeenCalledTimes(1 + 10);
    await advance(10_000);
    expect(fetchOrder).toHaveBeenCalledTimes(1 + 10 + 2);
  });

  it('5xx keeps polling, "Connection issue"', async () => {
    fetchOrder.mockResolvedValueOnce(order('pending'));
    fetchOrder.mockRejectedValue(apiError('server', 500));
    await mount();
    await advance(2_000);
    expect(liveRegion()).toHaveTextContent(en['payment.polling.connectionIssue']);
    await advance(4_000);
    expect(fetchOrder).toHaveBeenCalledTimes(4);
    expect(heading()).toHaveTextContent(en['payment.polling.title']);
    fetchOrder.mockResolvedValue(order('pending'));
    await advance(2_000);
    expect(liveRegion()).toHaveTextContent(en['payment.polling.status']);
  });

  it('requires_action → actionUrl once per cycle', async () => {
    fetchOrder.mockResolvedValueOnce(order('pending'));
    fetchOrder.mockResolvedValue(order('requires_action', { actionUrl: 'https://3ds.test/c' }));
    await mount();
    await advance(10_000);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('https://3ds.test/c');
  });

  it('live region changes only on status change', async () => {
    pendingForever();
    await mount();
    const mutations: string[] = [];
    const observer = new MutationObserver((records) =>
      records.forEach((r) => mutations.push(r.type)),
    );
    observer.observe(liveRegion(), { childList: true, characterData: true, subtree: true });
    await advance(15_000);
    expect(mutations).toEqual([]);
    await advance(5_000);
    expect(mutations.length).toBeGreaterThan(0);
    observer.takeRecords();
    mutations.length = 0;
    await advance(30_000);
    expect(mutations).toEqual([]);
  });

  it('180 s → Unconfirmed with order id; Check again = one GET', async () => {
    pendingForever();
    await mount();
    await advance(180_000);
    expect(heading()).toHaveTextContent(en['payment.unconfirmed.title']);
    expect(screen.getByText('o-url')).toBeInTheDocument();
    const calls = fetchOrder.mock.calls.length;
    await advance(60_000);
    expect(fetchOrder).toHaveBeenCalledTimes(calls); // polling stopped
    click(en['payment.action.checkAgain']);
    await act(async () => {});
    expect(fetchOrder).toHaveBeenCalledTimes(calls + 1);
    expect(heading()).toHaveTextContent(en['payment.unconfirmed.title']);
    await advance(30_000);
    expect(fetchOrder).toHaveBeenCalledTimes(calls + 1);
  });

  it('Check again after a polling redirect redirects again', async () => {
    fetchOrder.mockResolvedValueOnce(order('pending'));
    fetchOrder.mockResolvedValue(order('requires_action', { actionUrl: 'https://3ds.test/c' }));
    await mount();
    await advance(180_000);
    expect(navigate).toHaveBeenCalledTimes(1);
    click(en['payment.action.checkAgain']);
    await act(async () => {});
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('Unconfirmed: Check again sees paid → Confirmed', async () => {
    pendingForever();
    await mount();
    await advance(180_000);
    fetchOrder.mockResolvedValue(order('paid'));
    click(en['payment.action.checkAgain']);
    await act(async () => {});
    expect(heading()).toHaveTextContent(en['payment.confirmed.title']);
  });

  it('401 → IdentityLost; Verify → StartingEid with orderId in returnUrl', async () => {
    fetchOrder.mockResolvedValueOnce(order('pending'));
    fetchOrder.mockRejectedValue(apiError('unauthenticated', 401));
    await mount();
    await advance(2_000);
    expect(heading()).toHaveTextContent(en['payment.identityLost.title']);
    expect(screen.getByText('o-url')).toBeInTheDocument();
    const calls = fetchOrder.mock.calls.length;
    await advance(30_000);
    expect(fetchOrder).toHaveBeenCalledTimes(calls); // leaving Polling stops it
    click(en['payment.action.verify']);
    await act(async () => {});
    expect(createIdentitySession).toHaveBeenCalledTimes(1);
    const returnUrl = new URL((createIdentitySession.mock.calls[0] as unknown[])[1] as string);
    expect(returnUrl.pathname).toBe('/auth/callback');
    expect(returnUrl.searchParams.get('orderId')).toBe('o-url');
  });

  it('401 keeps the open order', async () => {
    openOrder.save(OPEN_ORDER);
    fetchOrder.mockRejectedValue(apiError('unauthenticated', 401));
    await mount();
    await advance(2_000);
    expect(openOrder.read()?.orderId).toBe('o-open');
  });

  it('404 → OrderNotFound, open order cleared', async () => {
    openOrder.save(OPEN_ORDER);
    fetchOrder.mockResolvedValueOnce(order('pending'));
    fetchOrder.mockRejectedValue(apiError('orderNotFound', 404));
    await mount();
    await advance(2_000);
    expect(heading()).toHaveTextContent(en['payment.orderNotFound.title']);
    expect(screen.getByText('o-open')).toBeInTheDocument();
    expect(openOrder.read()).toBeNull();
    click(en['payment.action.backToPlans']);
    expect(navigateReplace).toHaveBeenCalled();
  });

  it('unmount stops polling', async () => {
    pendingForever();
    const view = await mount();
    view.unmount();
    const calls = fetchOrder.mock.calls.length;
    await advance(30_000);
    expect(fetchOrder).toHaveBeenCalledTimes(calls);
  });
});
