import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openOrder } from '@/flow/openOrder/openOrder';

const { fetchOrder, navigateReplace, navigate } = vi.hoisted(() => ({
  fetchOrder: vi.fn(),
  navigateReplace: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock('@/api/order/order', () => ({ fetchOrder }));
vi.mock('@/api/client/client', () => ({ getPlans: vi.fn() }));
vi.mock('@/api/identity/identity', () => ({
  createIdentitySession: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/flow/navigate/navigate', () => ({ navigate, navigateReplace }));
vi.mock('@/analytics/analytics/analytics', () => ({
  track: vi.fn(),
  setCommonSource: vi.fn(),
  purchaseSent: () => false,
  trackThenRedirect: vi.fn(),
}));

import {
  OPEN_ORDER,
  en,
  heading,
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

describe('PaymentReturn', () => {
  it('orderId from open order beats URL', async () => {
    openOrder.save(OPEN_ORDER);
    fetchOrder.mockResolvedValue(order('pending', { orderId: 'o-open' }));
    visit('orderId=o-url&plan=standard&market=ee&locale=en');
    await mount();
    expect(fetchOrder).toHaveBeenCalledTimes(1);
    expect(fetchOrder.mock.calls[0]![1]).toBe('o-open');
  });

  it('no orderId anywhere → Plans', async () => {
    visit('plan=standard&market=ee&locale=en');
    await mount();
    expect(fetchOrder).not.toHaveBeenCalled();
    expect(lastNavigated(navigateReplace).pathname).toBe('/ee/en/');
  });

  it('paid → Confirmed', async () => {
    fetchOrder.mockResolvedValue(order('paid'));
    visit();
    await mount();
    expect(heading()).toHaveTextContent(en['payment.confirmed.title']);
  });

  it('failed + cancelled=1 → PaymentFailed(cancelled)', async () => {
    fetchOrder.mockResolvedValue(order('failed'));
    visit('orderId=o-url&plan=standard&market=ee&locale=en&cancelled=1');
    await mount();
    expect(lastNavigated(navigateReplace).searchParams.get('notice')).toBe('payment_cancelled');
  });

  it('failed → PaymentFailed(declined)', async () => {
    fetchOrder.mockResolvedValue(order('failed'));
    visit();
    await mount();
    expect(lastNavigated(navigateReplace).searchParams.get('notice')).toBe('payment_declined');
  });

  it.each(['pending', 'requires_action'])('other (%s) → Polling', async (status) => {
    fetchOrder.mockResolvedValue(order(status));
    visit();
    await mount();
    expect(heading()).toHaveTextContent(en['payment.polling.title']);
    expect(navigateReplace).not.toHaveBeenCalled();
  });
});
