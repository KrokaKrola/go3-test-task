import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openOrder } from '@/flow/openOrder/openOrder';
import { pickEidMessages } from '@/components/eid/eidMessages/eidMessages';
import { pickRetryMessages } from '@/components/RetryPoint/retryMessages/retryMessages';
import { pickReviewMessages } from '@/components/review/reviewMessages/reviewMessages';

const { fetchOrder, navigateReplace, navigate, getPlans, createOrder, fetchMe } = vi.hoisted(
  () => ({
    fetchOrder: vi.fn(),
    navigateReplace: vi.fn(),
    navigate: vi.fn(),
    getPlans: vi.fn(),
    createOrder: vi.fn(),
    fetchMe: vi.fn(),
  }),
);
vi.mock('@/api/order/order', () => ({ fetchOrder }));
vi.mock('@/api/client/client', () => ({ getPlans, createOrder }));
vi.mock('@/api/me/me', () => ({ fetchMe }));
vi.mock('@/api/identity/identity', () => ({
  createIdentitySession: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/flow/navigate/navigate', () => ({ navigate, navigateReplace }));
vi.mock('@/analytics/analytics/analytics', () => ({
  track: vi.fn(),
  setCommonSource: vi.fn(),
  purchaseSent: () => false,
  trackThenRedirect: vi.fn((_e: string, _p: unknown, go: () => void) => go()),
}));

import { Review } from '@/components/review/Review/Review';
import {
  OPEN_ORDER,
  en,
  lastNavigated,
  mount,
  order,
  visit,
} from '@/components/payment/paymentTestKit/paymentTestKit';

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe('PaymentFailed', () => {
  it.each([
    ['orderId=o-open&plan=standard&market=ee&locale=en&cancelled=1', 'payment_cancelled'],
    ['orderId=o-open&plan=standard&market=ee&locale=en', 'payment_declined'],
  ])(
    'clears open order, goes to retry point with notice=payment_cancelled|payment_declined (Review) (%s)',
    async (query, notice) => {
      openOrder.save(OPEN_ORDER);
      fetchOrder.mockResolvedValue(order('failed', { orderId: 'o-open' }));
      visit(query);
      await mount(true);
      expect(openOrder.read()).toBeNull();
      const url = lastNavigated(navigateReplace);
      expect(url.pathname).toBe('/ee/en/review/');
      expect(url.searchParams.get('notice')).toBe(notice);
      expect(url.searchParams.get('plan')).toBe('standard');
    },
  );

  it('reviewStep off → Plans with the notice and the plan preselected', async () => {
    openOrder.save(OPEN_ORDER);
    fetchOrder.mockResolvedValue(order('failed', { orderId: 'o-open' }));
    visit('orderId=o-open&plan=standard&market=ee&locale=en&cancelled=1');
    await mount(false);
    expect(openOrder.read()).toBeNull();
    const url = lastNavigated(navigateReplace);
    expect(url.pathname).toBe('/ee/en/');
    expect(url.searchParams.get('notice')).toBe('payment_cancelled');
    expect(url.searchParams.get('plan')).toBe('standard');
  });

  it('Try again → Gate → new order', async () => {
    openOrder.save(OPEN_ORDER);
    fetchOrder.mockResolvedValue(order('failed', { orderId: 'o-open' }));
    visit('orderId=o-open&plan=standard&market=ee&locale=en');
    await mount(true);
    const landing = lastNavigated(navigateReplace);

    // The retry point is Review: the same URL, with the notice, then Pay.
    getPlans.mockResolvedValue({
      plans: [{ id: 'plan_std_m', name: 's', priceNet: 899, vatRate: 0.24, currency: 'EUR' }],
    });
    fetchMe.mockResolvedValue({ customerId: 'c', trialEligible: true, activeSubscription: null });
    createOrder.mockResolvedValue({ orderId: 'o-new', paymentUrl: 'https://pay.test/o-new' });
    window.history.replaceState(null, '', landing.pathname + landing.search);
    const messages = en;
    render(
      <Review
        pair={{ market: 'ee', locale: 'en' }}
        accountUrl="https://account.test/"
        apiBase="http://api.test"
        messages={pickReviewMessages(messages)}
        eidMessages={pickEidMessages(messages)}
        retryMessages={pickRetryMessages(messages)}
        legalText={[]}
        planTitles={{ plan_std_m: 'Standard' }}
      />,
    );
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent(en['retry.notice.payment_declined']);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: en['review.pay'] }));
    await act(async () => {});
    expect(fetchOrder).toHaveBeenCalledTimes(1); // only the return GET: the cleared order is not re-checked
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(openOrder.read()?.orderId).toBe('o-new');
  });
});
