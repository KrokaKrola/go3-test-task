import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createIdentitySession } = vi.hoisted(() => ({
  createIdentitySession: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/api/identity/identity', () => ({ createIdentitySession }));

import {
  EidHarness,
  eidMessages,
  flowContext,
  storeAt,
} from '@/components/eid/eidTestKit/eidTestKit';

const ctx = flowContext({ market: 'lt', locale: 'en', planId: 'plan_prem_m' });
const setup = (reason: 'cancelled' | 'expired') => {
  const store = storeAt((c) => ({ name: 'EidFailed', ctx: c, reason }), ctx);
  render(<EidHarness store={store} />);
  return store;
};

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe('EidFailed', () => {
  it.each(['cancelled', 'expired'] as const)('shows the %s message', (reason) => {
    setup(reason);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      eidMessages[`eid.failed.${reason}.title`],
    );
  });

  it('Try again restarts eID with same context', () => {
    const store = setup('cancelled');
    fireEvent.click(screen.getByRole('button', { name: eidMessages['eid.action.tryAgain'] }));
    expect(store.getState().state).toMatchObject({ name: 'StartingEid', ctx });
    expect(createIdentitySession).toHaveBeenCalledTimes(1);
    const [, returnUrl] = createIdentitySession.mock.calls[0] as unknown as [string, string];
    expect(Object.fromEntries(new URL(returnUrl).searchParams)).toEqual({
      plan: 'premium',
      market: 'lt',
      locale: 'en',
    });
  });

  it('Change plan → Plans', () => {
    const store = setup('expired');
    fireEvent.click(screen.getByRole('button', { name: eidMessages['eid.action.changePlan'] }));
    expect(store.getState().state.name).toBe('Plans');
  });
});
