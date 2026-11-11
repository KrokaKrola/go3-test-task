import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { navigate, trackThenRedirect } = vi.hoisted(() => ({
  navigate: vi.fn(),
  trackThenRedirect: vi.fn(),
}));
vi.mock('@/flow/navigate/navigate', () => ({ navigate }));
vi.mock('@/analytics/analytics/analytics', async (importActual) => {
  const actual = await importActual<typeof import('@/analytics/analytics/analytics')>();
  trackThenRedirect.mockImplementation(actual.trackThenRedirect);
  return { ...actual, trackThenRedirect };
});

import { API_BASE, EidHarness, eidMessages, storeAt } from '@/components/eid/eidTestKit/eidTestKit';

const fetchMock = vi.fn();
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers }));
const CREATED = { sessionId: 's1', redirectUrl: 'https://eid.test/go' };

const setup = () => {
  const store = storeAt((ctx) => ({ name: 'StartingEid', ctx }));
  render(<EidHarness store={store} />);
  return store;
};
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  fetchMock.mockReset();
});

describe('StartEid', () => {
  it('POST body has returnUrl with plan, market, locale', async () => {
    reply(201, CREATED);
    setup();
    await settle();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/v1/identity/sessions`);
    expect(init.method).toBe('POST');
    const returnUrl = new URL((JSON.parse(init.body as string) as { returnUrl: string }).returnUrl);
    expect(returnUrl.pathname).toBe('/auth/callback');
    expect(Object.fromEntries(returnUrl.searchParams)).toEqual({
      plan: 'standard',
      market: 'ee',
      locale: 'en',
    });
  });

  it('201 → redirect to redirectUrl after ≥ 300 ms with "Opening …" announced', async () => {
    reply(201, CREATED);
    setup();
    expect(screen.getByRole('status')).toHaveTextContent(eidMessages['eid.starting.status']);
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent(eidMessages['eid.opening']);
    await act(async () => void (await vi.advanceTimersByTimeAsync(299)));
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));
    expect(navigate).toHaveBeenCalledExactlyOnceWith(CREATED.redirectUrl);
  });

  it('429 → RateLimited', async () => {
    reply(429, { error: 'slow down' }, { 'Retry-After': '12' });
    const store = setup();
    await settle();
    expect(store.getState().state).toMatchObject({ name: 'RateLimited', retryAfterSec: 12 });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      eidMessages['eid.rateLimited.title'],
    );
  });

  it.each([
    ['400', () => reply(400, { error: 'bad' })],
    ['5xx', () => reply(500, { error: 'boom' })],
    ['network', () => fetchMock.mockRejectedValueOnce(new TypeError('offline'))],
  ])('%s → StartError; Try again → StartingEid, Change plan → Plans', async (_, fail) => {
    fail();
    const store = setup();
    await settle();
    expect(store.getState().state.name).toBe('StartError');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      eidMessages['eid.startError.title'],
    );

    reply(201, CREATED);
    fireEvent.click(screen.getByRole('button', { name: eidMessages['eid.action.tryAgain'] }));
    expect(store.getState().state.name).toBe('StartingEid');
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('StartError: Change plan → Plans', async () => {
    reply(500, { error: 'boom' });
    const store = setup();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: eidMessages['eid.action.changePlan'] }));
    expect(store.getState().state.name).toBe('Plans');
  });

  it('identity_started on 201 only', async () => {
    reply(429, { error: 'slow' });
    setup();
    await settle();
    expect(trackThenRedirect).not.toHaveBeenCalled();

    reply(500, { error: 'boom' });
    setup();
    await settle();
    expect(trackThenRedirect).not.toHaveBeenCalled();

    reply(201, CREATED);
    setup();
    await settle();
    expect(trackThenRedirect).toHaveBeenCalledExactlyOnceWith(
      'identity_started',
      { plan_id: 'plan_std_m', eid_purpose: 'checkout' },
      expect.any(Function),
    );
  });
});
