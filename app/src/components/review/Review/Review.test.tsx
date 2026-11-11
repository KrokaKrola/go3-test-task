import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pickEidMessages } from '@/components/eid/eidMessages/eidMessages';
import { pickRetryMessages } from '@/components/RetryPoint/retryMessages/retryMessages';
import { pickReviewMessages } from '@/components/review/reviewMessages/reviewMessages';
import { openOrder } from '@/flow/openOrder/openOrder';
import { formatMoney } from '@/domain/money/money';
import { getMessages } from '@/i18n/messages/messages';

const { getPlans, createOrder, fetchMe, fetchOrder, navigate } = vi.hoisted(() => ({
  getPlans: vi.fn(),
  createOrder: vi.fn(),
  fetchMe: vi.fn(),
  fetchOrder: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock('@/api/client/client', () => ({ getPlans, createOrder }));
vi.mock('@/api/me/me', () => ({ fetchMe }));
vi.mock('@/api/order/order', () => ({ fetchOrder }));
vi.mock('@/api/identity/identity', () => ({
  createIdentitySession: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/analytics/analytics/analytics', () => ({
  track: vi.fn(),
  trackThenRedirect: vi.fn(),
  setCommonSource: vi.fn(),
}));
vi.mock('@/flow/navigate/navigate', () => ({ navigate }));

import { Review, type ReviewProps } from './Review';

const en = getMessages('en');
const messages = pickReviewMessages(en);
const PLANS = [
  { id: 'plan_basic_m', name: 'b', priceNet: 500, vatRate: 0.24, currency: 'EUR' },
  { id: 'plan_std_m', name: 's', priceNet: 899, vatRate: 0.24, currency: 'EUR' },
  { id: 'plan_prem_m', name: 'p', priceNet: 1499, vatRate: 0.24, currency: 'EUR' },
];
const props: ReviewProps = {
  pair: { market: 'ee', locale: 'en' },
  accountUrl: 'https://account.test/',
  apiBase: 'http://api.test',
  messages,
  eidMessages: pickEidMessages(en),
  retryMessages: pickRetryMessages(en),
  legalText: ['Legal terms'],
  planTitles: { plan_basic_m: 'Basic', plan_std_m: 'Standard', plan_prem_m: 'Premium' },
};

const retryMessages = pickRetryMessages(en);
const serverError = { status: 500, code: 'internal_error', message: 'x', kind: 'server' };
const OPEN_ORDER = {
  orderId: 'o9',
  paymentUrl: 'https://pay.test/o9',
  planId: 'plan_std_m',
  market: 'ee',
  locale: 'en',
  snapshot: { value: 11.15, tax: 2.16, currency: 'EUR', trial: 'false' as const },
};
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const renderReview = async (plan = 'standard') => {
  window.history.replaceState(null, '', `/ee/en/review/?plan=${plan}&market=ee&locale=en`);
  const view = render(<Review {...props} />);
  await settle();
  return view.unmount;
};
const payButton = () => screen.getByRole('button', { name: messages['review.pay'] });
const consentBox = () => screen.getByRole('checkbox');

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  getPlans.mockResolvedValue({ market: 'EE', plans: PLANS });
  fetchMe.mockResolvedValue({
    customerId: 'c1',
    activeSubscription: null,
    trialEligible: true,
  });
  createOrder.mockReturnValue(new Promise(() => {}));
});

describe('Review', () => {
  it('refetches /v1/plans, shows API price', async () => {
    await renderReview();
    expect(getPlans).toHaveBeenCalledWith('ee', expect.anything());
    expect(screen.getByText(formatMoney(1115, 'EUR', 'en'))).toBeInTheDocument();
    expect(screen.getByText('Legal terms')).toBeInTheDocument();
  });

  it('plan missing from API → Plans + notice=plan_unavailable', async () => {
    getPlans.mockResolvedValue({ market: 'EE', plans: PLANS.slice(0, 1) });
    await renderReview('premium');
    const url = new URL(navigate.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/ee/en/');
    expect(url.searchParams.get('notice')).toBe('plan_unavailable');
  });

  it.each(['standard', 'premium'])('trial note on %s when trialEligible', async (plan) => {
    await renderReview(plan);
    expect(screen.getByText(messages['review.trial'])).toBeInTheDocument();
  });

  it('none on basic or when not eligible', async () => {
    const unmount = await renderReview('basic');
    expect(screen.queryByText(messages['review.trial'])).toBeNull();
    unmount();
    fetchMe.mockResolvedValue({ customerId: 'c1', activeSubscription: null, trialEligible: false });
    await renderReview('standard');
    expect(screen.queryByText(messages['review.trial'])).toBeNull();
  });

  it('consent checkbox unchecked on show, label from catalog', async () => {
    await renderReview();
    expect(consentBox()).not.toBeChecked();
    expect(screen.getByLabelText(messages['review.consent'])).toBe(consentBox());
  });

  it('Pay button reads "Order with obligation to pay" (catalog key)', async () => {
    await renderReview();
    expect(payButton()).toHaveTextContent('Order with obligation to pay');
    expect(payButton()).toHaveTextContent(en['review.pay']);
  });

  it('Pay without consent → aria-invalid + aria-describedby, focus to checkbox, no Gate', async () => {
    await renderReview();
    fetchMe.mockClear();
    fireEvent.click(payButton());
    await settle();
    expect(consentBox()).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByText(messages['review.consentError']);
    expect(consentBox()).toHaveAttribute('aria-describedby', error.id);
    expect(consentBox()).toHaveFocus();
    expect(fetchMe).not.toHaveBeenCalled();
    expect(fetchOrder).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('Pay runs the Gate, never POSTs directly', async () => {
    await renderReview();
    fetchMe.mockClear();
    fireEvent.click(consentBox());
    fireEvent.click(payButton());
    expect(createOrder).not.toHaveBeenCalled();
    expect(fetchMe).toHaveBeenCalledTimes(1);
    await settle();
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('two clicks → one POST, focus unchanged', async () => {
    await renderReview();
    fireEvent.click(consentBox());
    payButton().focus();
    fireEvent.click(payButton());
    fireEvent.click(payButton());
    await settle();
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(payButton()).toHaveFocus();
    expect(payButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('pageshow persisted re-enables Pay and unchecks consent (inv. 6)', async () => {
    await renderReview();
    fireEvent.click(consentBox());
    fireEvent.click(payButton());
    await settle();
    expect(payButton()).toHaveAttribute('aria-disabled', 'true');
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });
    await settle();
    expect(payButton()).not.toHaveAttribute('aria-disabled');
    expect(consentBox()).not.toBeChecked();
  });

  it('Back after Change plan (bfcache) shows a usable Review again', async () => {
    await renderReview();
    fireEvent.click(screen.getByRole('button', { name: messages['review.changePlan'] }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(payButton()).toHaveAttribute('aria-disabled', 'true');
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });
    await settle();
    expect(payButton()).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: messages['review.changePlan'] })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('POST failure → focused error banner, consent unchecked again (Q72)', async () => {
    createOrder.mockRejectedValue(serverError);
    await renderReview();
    fireEvent.click(consentBox());
    fireEvent.click(payButton());
    await settle();
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(consentBox()).not.toBeChecked();
    expect(payButton()).not.toHaveAttribute('aria-disabled');
  });

  it('Gate finding a paid order → payment return with the orderId', async () => {
    openOrder.save(OPEN_ORDER);
    fetchOrder.mockResolvedValue({ status: 'paid' });
    await renderReview();
    fireEvent.click(consentBox());
    fireEvent.click(payButton());
    await settle();
    const url = new URL(navigate.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/payment/return/');
    expect(url.searchParams.get('orderId')).toBe('o9');
    expect(createOrder).not.toHaveBeenCalled();
  });

  describe('failures keep focus', () => {
    it('plans fetch error is a focused alert; Try again stays mounted, then focus moves to the heading', async () => {
      getPlans.mockRejectedValueOnce(serverError);
      await renderReview();
      expect(screen.getByRole('alert')).toHaveFocus();
      expect(payButton()).toHaveAttribute('aria-disabled', 'true');
      let release!: (value: unknown) => void;
      getPlans.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
      const retry = screen.getByRole('button', { name: messages['review.retryPlans'] });
      retry.focus();
      fireEvent.click(retry);
      await settle();
      const busy = screen.getByRole('button', { name: retryMessages['retry.busy'] });
      expect(busy).toBe(retry);
      expect(busy).toHaveFocus();
      expect(busy).toHaveAttribute('aria-disabled', 'true');
      release({ market: 'EE', plans: PLANS });
      await settle();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
      expect(payButton()).not.toHaveAttribute('aria-disabled');
    });

    it('Gate 5xx disables Pay; Check again stays mounted while checking, then focus moves to Pay', async () => {
      openOrder.save(OPEN_ORDER);
      fetchOrder.mockRejectedValueOnce(serverError);
      await renderReview();
      fireEvent.click(consentBox());
      fireEvent.click(payButton());
      await settle();
      expect(payButton()).toHaveAttribute('aria-disabled', 'true');
      expect(createOrder).not.toHaveBeenCalled();
      let release!: (value: unknown) => void;
      fetchOrder.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
      const check = screen.getByRole('button', { name: retryMessages['retry.action.checkAgain'] });
      check.focus();
      fireEvent.click(check);
      await settle();
      const busy = screen.getByRole('button', { name: retryMessages['retry.busy'] });
      expect(busy).toBe(check);
      expect(busy).toHaveFocus();
      expect(busy).toHaveAttribute('aria-disabled', 'true');
      release({ status: 'failed' });
      await settle();
      expect(
        screen.queryByRole('button', { name: retryMessages['retry.action.checkAgain'] }),
      ).toBeNull();
      expect(payButton()).not.toHaveAttribute('aria-disabled');
      expect(payButton()).toHaveFocus();
    });
  });
});
