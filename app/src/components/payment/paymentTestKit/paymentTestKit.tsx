import { act, render, screen } from '@testing-library/react';
import { PaymentReturn } from '@/components/payment/PaymentReturn/PaymentReturn';
import type { ApiError } from '@/api/errors/errors';
import { getMessages } from '@/i18n/messages/messages';
import type { OpenOrder } from '@/flow/openOrder/openOrder';

export const ACCOUNT_URL = 'https://account.test/';
export const en = getMessages('en');
export const PLAN_TITLES = { 'ee/en': { plan_std_m: 'Standard', plan_prem_m: 'Premium' } };

export const OPEN_ORDER: OpenOrder = {
  orderId: 'o-open',
  paymentUrl: 'https://pay.test/o-open',
  planId: 'plan_std_m',
  market: 'ee',
  locale: 'en',
  snapshot: { value: 11.15, tax: 2.16, currency: 'EUR', trial: 'true' },
};

export const apiError = (kind: ApiError['kind'], status: number): ApiError => ({
  kind,
  status,
  code: kind,
  message: kind,
});

export const order = (status: string, extra: object = {}) => ({
  orderId: 'o-url',
  planId: 'plan_std_m',
  status,
  createdAt: 'x',
  ...extra,
});

export const visit = (query = 'orderId=o-url&plan=standard&market=ee&locale=en') =>
  window.history.replaceState(null, '', `/payment/return/?${query}`);

export const mount = async (reviewStep = true) => {
  const view = render(
    <PaymentReturn
      apiBase="http://api.test"
      accountUrl={ACCOUNT_URL}
      reviewStep={reviewStep}
      planTitles={PLAN_TITLES}
    />,
  );
  await act(async () => {});
  return view;
};

export const heading = () => screen.getByRole('heading', { level: 1 });
export const liveRegion = () => screen.getByRole('status');
export const lastNavigated = (mock: { mock: { calls: unknown[][] } }) =>
  new URL(mock.mock.calls.at(-1)![0] as string);
