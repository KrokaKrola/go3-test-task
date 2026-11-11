import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setConsent } from '@/analytics/consent/consent';
import { resetAnalytics } from '@/analytics/analytics/analytics';
import { openOrder } from '@/flow/openOrder/openOrder';

const { fetchOrder, getPlans, navigateReplace, navigate } = vi.hoisted(() => ({
  fetchOrder: vi.fn(),
  getPlans: vi.fn(),
  navigateReplace: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock('@/api/order/order', () => ({ fetchOrder }));
vi.mock('@/api/client/client', () => ({ getPlans }));
vi.mock('@/api/identity/identity', () => ({ createIdentitySession: vi.fn() }));
vi.mock('@/flow/navigate/navigate', () => ({ navigate, navigateReplace }));

import {
  ACCOUNT_URL,
  OPEN_ORDER,
  en,
  heading,
  mount,
  order,
  visit,
} from '@/components/payment/paymentTestKit/paymentTestKit';

const purchases = () =>
  ((window.dataLayer ?? []) as Record<string, unknown>[]).filter((e) => e.event === 'purchase');

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.dataLayer = [];
  resetAnalytics();
  setConsent('granted');
  visit('orderId=o-open&plan=standard&market=ee&locale=en');
  fetchOrder.mockResolvedValue(order('paid', { orderId: 'o-open' }));
});

describe('Confirmed', () => {
  it('shows order id, plan, trial note from open order', async () => {
    openOrder.save(OPEN_ORDER);
    await mount();
    expect(heading()).toHaveTextContent(en['payment.confirmed.title']);
    expect(screen.getByText('o-open')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText(en['payment.confirmed.trial'])).toBeInTheDocument();
    expect(openOrder.read()).toBeNull();
  });

  it('purchase once per orderId, params from snapshot', async () => {
    openOrder.save(OPEN_ORDER);
    await mount();
    expect(purchases()).toHaveLength(1);
    expect(purchases()[0]).toMatchObject({
      transaction_id: 'o-open',
      value: 11.15,
      tax: 2.16,
      currency: 'EUR',
      plan_id: 'plan_std_m',
      trial: true,
    });
    expect(getPlans).not.toHaveBeenCalled();
  });

  it('reload → no second purchase', async () => {
    openOrder.save(OPEN_ORDER);
    const first = await mount();
    first.unmount();
    resetAnalytics(); // a reload loses memory; the localStorage guard stays
    await mount();
    expect(heading()).toHaveTextContent(en['payment.confirmed.title']);
    expect(screen.queryByText(en['payment.confirmed.trial'])).toBeNull();
    expect(screen.getByText('Standard')).toBeInTheDocument(); // plan from the order GET
    expect(purchases()).toHaveLength(1);
    expect(getPlans).not.toHaveBeenCalled();
  });

  it('no snapshot: value from /v1/plans, trial unknown', async () => {
    getPlans.mockResolvedValue({
      plans: [{ id: 'plan_std_m', name: 's', priceNet: 899, vatRate: 0.24, currency: 'EUR' }],
    });
    await mount();
    expect(purchases()).toHaveLength(1);
    expect(purchases()[0]).toMatchObject({ value: 11.15, trial: 'unknown', plan_id: 'plan_std_m' });
  });

  it('Go to account → account URL', async () => {
    await mount();
    act(() => screen.getByRole('button', { name: en['payment.action.goToAccount'] }).click());
    expect(navigateReplace).toHaveBeenCalledWith(ACCOUNT_URL);
  });
});
