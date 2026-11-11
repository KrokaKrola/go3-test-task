import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMessages } from '@/i18n/messages/messages';
import type { FlowContext } from '@/flow/machine/machine';
import { createFlowStore } from '@/flow/store/store';
import { Resume, RetryPoint } from './RetryPoint';
import { pickRetryMessages } from './retryMessages/retryMessages';

const en = getMessages('en');
const messages = pickRetryMessages(en);

const ctx: FlowContext = {
  market: 'ee',
  locale: 'en',
  planId: 'plan_std_m',
  reviewStep: false,
  identified: true,
  openOrderId: 'o1',
  reverifyOrderId: null,
  conflictRetried: false,
};

const renderRetryPoint = (view = {}) =>
  render(
    <RetryPoint
      messages={messages}
      view={view}
      planTitle="Standard"
      canRetry
      onTryAgain={() => {}}
      onCheckAgain={() => {}}
    />,
  );

beforeEach(() => {
  window.history.replaceState(null, '', '/ee/en/');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RetryPoint', () => {
  it('Resume shows only Check status → PaymentReturn', () => {
    const store = createFlowStore(ctx, { name: 'Resume', ctx, orderId: 'o1' });
    render(
      <Resume
        messages={messages}
        onCheckStatus={() => store.getState().dispatch({ type: 'checkStatus' })}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([en['retry.action.checkStatus']]);
    expect(screen.queryByText(en['retry.action.tryAgain'])).toBeNull();

    fireEvent.click(buttons[0]!);
    expect(store.getState().state).toMatchObject({ name: 'PaymentReturn', orderId: 'o1' });
    expect(store.getState().effects).toEqual([{ type: 'fetchOrder', orderId: 'o1' }]);
  });

  it('?notice= banner gets focus, param removed via history.replaceState', () => {
    window.history.replaceState(null, '', '/ee/en/?plan=standard&notice=payment_declined');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const pushState = vi.spyOn(window.history, 'pushState');
    renderRetryPoint();
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent(en['retry.notice.payment_declined']);
    expect(banner).toHaveFocus();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?plan=standard');
  });

  it('unknown notice → no banner', () => {
    window.history.replaceState(null, '', '/ee/en/?notice=<script>');
    renderRetryPoint();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('error banner with Pay disabled: Try again disabled, Check again enabled', () => {
    renderRetryPoint({ errorKind: 'server', payDisabled: true });
    expect(screen.getByRole('alert')).toHaveTextContent(en['retry.error.other']);
    expect(screen.getByRole('button', { name: en['retry.action.tryAgain'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: en['retry.action.checkAgain'] })).toBeEnabled();
  });
});
