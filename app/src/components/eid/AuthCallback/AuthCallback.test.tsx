import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMe, navigateReplace, navigate, track, trackThenRedirect, createIdentitySession } =
  vi.hoisted(() => ({
    navigate: vi.fn(),
    trackThenRedirect: vi.fn((_e: string, _p: unknown, go: () => void) => go()),
    fetchMe: vi.fn(),
    navigateReplace: vi.fn(),
    track: vi.fn(),
    createIdentitySession: vi.fn(() => new Promise(() => {})),
  }));
vi.mock('@/api/me/me', () => ({ fetchMe }));
vi.mock('@/api/identity/identity', () => ({ createIdentitySession }));
vi.mock('@/flow/navigate/navigate', () => ({ navigate, navigateReplace }));
vi.mock('@/analytics/analytics/analytics', () => ({
  track,
  setCommonSource: vi.fn(),
  trackThenRedirect,
}));

import { apiError, eidMessages } from '@/components/eid/eidTestKit/eidTestKit';
import { saveStoredParams } from '@/flow/context/context';
import { sessionStore } from '@/flow/browserStorage/browserStorage';
import { consumeRunGateToken } from '@/flow/runGateToken/runGateToken';
import { getMessages } from '@/i18n/messages/messages';
import { AuthCallback } from './AuthCallback';

const ACCOUNT_URL = 'https://account.test/';
const ME = { customerId: 'c1', trialEligible: true, activeSubscription: null };
const SUBSCRIBED = {
  ...ME,
  activeSubscription: { planId: 'plan_std_m', status: 'a', renewsAt: 'x' },
};
const OK_QUERY = 'status=ok&plan=standard&market=ee&locale=et';

const visit = (query: string) => window.history.replaceState(null, '', `/auth/callback?${query}`);
const mount = async (reviewStep = true) => {
  render(
    <AuthCallback apiBase="http://api.test" accountUrl={ACCOUNT_URL} reviewStep={reviewStep} />,
  );
  await act(async () => {});
};
const lastExit = () => new URL(navigateReplace.mock.calls.at(-1)![0] as string);
const heading = () => screen.getByRole('heading', { level: 1 });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const trackedEvents = (name: string) => track.mock.calls.filter(([event]) => event === name);

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  document.documentElement.lang = 'en';
});

describe('AuthCallback', () => {
  it('cancelled → EidFailed(cancelled)', async () => {
    visit('status=cancelled&plan=standard&market=ee&locale=en');
    await mount();
    expect(heading()).toHaveTextContent(eidMessages['eid.failed.cancelled.title']);
    expect(fetchMe).not.toHaveBeenCalled();
  });

  it.each(['status=expired', 'status=weird', ''])(
    'expired/missing/unknown → EidFailed(expired) (%s)',
    async (status) => {
      visit(`${status}&plan=standard&market=ee&locale=en`);
      await mount();
      expect(heading()).toHaveTextContent(eidMessages['eid.failed.expired.title']);
    },
  );

  it('exits use history.replaceState', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    visit('status=cancelled&plan=standard&market=ee&locale=en');
    replaceState.mockClear();
    await mount();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(window.location.search).not.toContain('status');
    // the page exit replaces too, so Back never lands on the callback
    fetchMe.mockResolvedValue(ME);
    visit(OK_QUERY);
    document.body.innerHTML = '';
    await mount();
    expect(navigateReplace).toHaveBeenCalledTimes(1);
    expect(window.location.search).not.toContain('status');
  });

  it('ok + /v1/me 200 → Review with context plan', async () => {
    fetchMe.mockResolvedValue(ME);
    visit(OK_QUERY);
    await mount();
    expect(lastExit().pathname).toBe('/ee/et/review/');
    expect(lastExit().searchParams.get('plan')).toBe('standard');
  });

  it('stored context beats the query plan', async () => {
    fetchMe.mockResolvedValue(ME);
    saveStoredParams(sessionStore, {
      plan: 'premium',
      market: 'ee',
      locale: 'et',
      utm: {},
      orderId: null,
    });
    visit(OK_QUERY);
    await mount();
    expect(lastExit().searchParams.get('plan')).toBe('premium');
  });

  it('reviewStep off: ok + 200 → Gate', async () => {
    fetchMe.mockResolvedValue(ME);
    visit(OK_QUERY);
    await mount(false);
    expect(lastExit().pathname).toBe('/ee/et/');
    expect(lastExit().searchParams.get('plan')).toBe('standard');
    expect(consumeRunGateToken(sessionStore, 'standard')).toBe(true);
  });

  it('reviewStep on: Review exit issues no rungate token', async () => {
    fetchMe.mockResolvedValue(ME);
    visit(OK_QUERY);
    await mount(true);
    expect(consumeRunGateToken(sessionStore, 'standard')).toBe(false);
  });

  it('ok + activeSubscription → ACCOUNT_URL', async () => {
    fetchMe.mockResolvedValue(SUBSCRIBED);
    visit(OK_QUERY);
    await mount();
    expect(navigateReplace).toHaveBeenCalledExactlyOnceWith(ACCOUNT_URL);
  });

  it('ok + orderId in context → PaymentReturn for that order', async () => {
    fetchMe.mockResolvedValue(SUBSCRIBED);
    visit(`${OK_QUERY}&orderId=ord_7`);
    await mount();
    expect(lastExit().pathname).toBe('/payment/return/');
    expect(lastExit().searchParams.get('orderId')).toBe('ord_7');
    expect(trackedEvents('identity_completed')[0]![1]).toMatchObject({ eid_purpose: 'reverify' });
  });

  it('lang set from context before first text', async () => {
    fetchMe.mockReturnValue(new Promise(() => {}));
    visit('status=ok&plan=standard&market=lt&locale=lt');
    const langWhenTextAttached: string[] = [];
    const attach = Node.prototype.appendChild;
    const spy = vi.spyOn(Node.prototype, 'appendChild').mockImplementation(function <
      T extends Node,
    >(this: Node, node: T) {
      if (this.isConnected && node.textContent)
        langWhenTextAttached.push(document.documentElement.lang);
      return attach.call(this, node) as T;
    });
    await mount();
    spy.mockRestore();
    expect(document.documentElement.lang).toBe('lt');
    expect(heading()).toHaveTextContent(getMessages('lt')['eid.verifying.title']);
    expect(langWhenTextAttached.length).toBeGreaterThan(0);
    expect(langWhenTextAttached.every((lang) => lang === 'lt')).toBe(true);
  });

  it('/v1/me 401 → OtherBrowser; Start again here keeps the query plan', async () => {
    fetchMe.mockRejectedValue(apiError('unauthenticated', 401));
    visit('status=ok&plan=premium&market=lt&locale=en');
    await mount();
    expect(heading()).toHaveTextContent(eidMessages['eid.otherBrowser.title']);
    click(eidMessages['eid.action.startAgainHere']);
    const [, returnUrl] = createIdentitySession.mock.calls[0] as unknown as [string, string];
    expect(Object.fromEntries(new URL(returnUrl).searchParams)).toEqual({
      plan: 'premium',
      market: 'lt',
      locale: 'en',
    });
  });

  it('/v1/me 5xx/network → VerifyError; Try again → Verifying, Start again → StartingEid', async () => {
    fetchMe.mockRejectedValueOnce(apiError('server', 500));
    visit('status=ok&plan=standard&market=ee&locale=en');
    await mount();
    expect(heading()).toHaveTextContent(eidMessages['eid.verifyError.title']);

    fetchMe.mockReturnValueOnce(new Promise(() => {}));
    click(eidMessages['eid.action.tryAgain']);
    expect(heading()).toHaveTextContent(eidMessages['eid.verifying.title']);
    expect(fetchMe).toHaveBeenCalledTimes(2);
  });

  it('VerifyError (network): Start again → StartingEid', async () => {
    fetchMe.mockRejectedValueOnce(apiError('network', 0));
    visit('status=ok&plan=standard&market=ee&locale=en');
    await mount();
    click(eidMessages['eid.action.startAgain']);
    expect(heading()).toHaveTextContent(eidMessages['eid.starting.title']);
    expect(createIdentitySession).toHaveBeenCalledTimes(1);
  });

  it('identity_completed only after /v1/me 200', async () => {
    let resolveMe!: (me: unknown) => void;
    fetchMe.mockReturnValue(new Promise((resolve) => (resolveMe = resolve)));
    visit(OK_QUERY);
    await mount();
    expect(trackedEvents('identity_completed')).toHaveLength(0);
    await act(async () => resolveMe(ME));
    expect(track).toHaveBeenCalledExactlyOnceWith('identity_completed', {
      plan_id: 'plan_std_m',
      eid_purpose: 'checkout',
    });
  });

  it.each([
    ['cancelled', 'status=cancelled'],
    ['401', OK_QUERY],
    ['5xx', OK_QUERY],
  ])('no identity_completed on %s', async (kind, query) => {
    if (kind === '401') fetchMe.mockRejectedValue(apiError('unauthenticated', 401));
    if (kind === '5xx') fetchMe.mockRejectedValue(apiError('server', 500));
    visit(`${query}&plan=standard&market=ee&locale=en`);
    await mount();
    expect(trackedEvents('identity_completed')).toHaveLength(0);
  });

  it('no usable context → root picks a language', async () => {
    visit('status=ok');
    await mount();
    expect(navigateReplace).toHaveBeenCalledExactlyOnceWith('/');
  });

  it('Start again here redirects with navigateReplace, not navigate', async () => {
    fetchMe.mockRejectedValue(apiError('unauthenticated', 401));
    createIdentitySession.mockResolvedValueOnce({
      sessionId: 's',
      redirectUrl: 'https://eid.test/go',
    });
    visit('status=ok&plan=standard&market=ee&locale=en');
    await mount();
    click(eidMessages['eid.action.startAgainHere']);
    await act(async () => {});
    expect(navigateReplace).toHaveBeenCalledWith('https://eid.test/go');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('bfcache restore while StartingEid → EidFailed (no second POST)', async () => {
    fetchMe.mockRejectedValue(apiError('unauthenticated', 401));
    createIdentitySession.mockResolvedValueOnce({
      sessionId: 's',
      redirectUrl: 'https://eid.test/go',
    });
    visit('status=ok&plan=standard&market=ee&locale=en');
    await mount();
    click(eidMessages['eid.action.startAgainHere']);
    await act(async () => {});
    expect(heading()).toHaveTextContent(eidMessages['eid.starting.title']);
    act(() => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    });
    expect(heading()).toHaveTextContent(eidMessages['eid.starting.title']);
    act(() => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });
    expect(heading()).toHaveTextContent(eidMessages['eid.failed.expired.title']);
    expect(createIdentitySession).toHaveBeenCalledTimes(1);
  });

  it('replaceHistory keeps UTMs and drops only status', async () => {
    visit('status=cancelled&plan=standard&market=ee&locale=en&utm_source=news');
    await mount();
    expect(window.location.search).toContain('utm_source=news');
    expect(window.location.search).not.toContain('status');
  });
});
