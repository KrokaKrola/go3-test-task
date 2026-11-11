import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, EidHarness, eidMessages, storeAt } from '@/components/eid/eidTestKit/eidTestKit';

vi.mock('@/api/identity/identity', () => ({
  createIdentitySession: vi.fn(() => new Promise(() => {})),
}));

const setup = (retryAfterSec = 3) => {
  const store = storeAt((ctx) => ({ name: 'RateLimited', ctx, retryAfterSec, ready: false }));
  render(<EidHarness store={store} />);
  return store;
};
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const tryAgain = () => screen.getByRole('button', { name: eidMessages['eid.action.tryAgain'] });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('RateLimited', () => {
  it('countdown from Retry-After, Try again enabled at 0 (fake timers)', async () => {
    const store = setup(3);
    expect(screen.getByText('Try again in 3 seconds')).toBeInTheDocument();
    expect(tryAgain()).toBeDisabled();
    await tick(1000);
    expect(screen.getByText('Try again in 2 seconds')).toBeInTheDocument();
    await tick(1000);
    expect(screen.getByText('Try again in 1 second')).toBeInTheDocument();
    expect(tryAgain()).toBeDisabled();
    await tick(1000);
    expect(tryAgain()).toBeEnabled();
    expect(store.getState().state).toMatchObject({ name: 'RateLimited', ready: true });
    fireEvent.click(tryAgain());
    expect(store.getState().state.name).toBe('StartingEid');
  });

  it('countdown starts from the 429 Retry-After value', () => {
    const store = storeAt((ctx) => ({ name: 'StartingEid', ctx }));
    store.getState().dispatch({
      type: 'sessionFailed',
      error: { ...apiError('rateLimited', 429), retryAfterSec: 7 },
    });
    render(<EidHarness store={store} />);
    expect(screen.getByText('Try again in 7 seconds')).toBeInTheDocument();
  });

  it('live region gets 2 messages', async () => {
    setup(3);
    const region = screen.getByRole('status');
    const seen = [region.textContent];
    new MutationObserver(() => {
      if (region.textContent !== seen.at(-1)) seen.push(region.textContent);
    }).observe(region, { childList: true, characterData: true, subtree: true });
    await tick(1000);
    await tick(1000);
    await tick(1000);
    expect(seen).toEqual([
      eidMessages['eid.rateLimited.waiting'],
      eidMessages['eid.rateLimited.ready'],
    ]);
    // the per-second number never sits inside the region
    expect(region.textContent).not.toMatch(/\d/);
  });

  it('Change plan → Plans', () => {
    const store = setup(30);
    fireEvent.click(screen.getByRole('button', { name: eidMessages['eid.action.changePlan'] }));
    expect(store.getState().state.name).toBe('Plans');
  });
});
