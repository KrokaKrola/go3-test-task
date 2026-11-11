import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setConsent } from '@/analytics/consent/consent';
import { resetAnalytics, setCommonSource, track, trackThenRedirect } from './analytics';
import type { EventMap, EventName } from './analytics';

const COMMON = {
  market: 'EE',
  locale: 'et',
  review_step: true,
  utm_source: 'news',
  utm_campaign: 'spring',
} as const;

const SAMPLE: { [E in EventName]: EventMap[E] } = {
  plan_viewed: { identified: false },
  plan_selected: { plan_id: 'plan_std_m' },
  identity_started: { plan_id: 'plan_std_m', eid_purpose: 'checkout' },
  identity_completed: { plan_id: 'plan_std_m', eid_purpose: 'reverify' },
  payment_started: { plan_id: 'plan_std_m', transaction_id: 'ord_1' },
  purchase: {
    transaction_id: 'ord_1',
    value: 12.4,
    currency: 'EUR',
    plan_id: 'plan_std_m',
    trial: 'unknown',
    tax: 2.4,
  },
};

const layer = () => (window.dataLayer ?? []) as Record<string, unknown>[];

beforeEach(() => {
  localStorage.clear();
  delete window.dataLayer;
  resetAnalytics();
  setCommonSource(() => ({
    market: 'ee',
    locale: 'et',
    reviewStep: true,
    utm: { utm_source: 'news', utm_campaign: 'spring' },
  }));
  setConsent('granted');
});

afterEach(() => {
  setConsent('pending');
  resetAnalytics();
  vi.useRealTimers();
});

describe('analytics', () => {
  it.each(Object.keys(SAMPLE) as EventName[])('params per event: %s', (event) => {
    track(event, SAMPLE[event] as never);
    expect(layer()).toEqual([{ event, ...COMMON, ...SAMPLE[event] }]);
  });

  it('param whitelist, no personal data', () => {
    const forbidden = {
      customerId: 'c1',
      sessionId: 's1',
      paymentUrl: 'https://pay',
      actionUrl: 'https://act',
      redirectUrl: 'https://eid',
      returnUrl: 'https://ret',
      message: 'boom',
    };
    for (const event of Object.keys(SAMPLE) as EventName[]) {
      track(event, { ...SAMPLE[event], ...forbidden } as never);
    }
    for (const entry of layer()) {
      for (const key of Object.keys(forbidden)) expect(entry).not.toHaveProperty(key);
    }
    expect(layer()).toHaveLength(6);
  });

  it('purchase once per orderId via localStorage guard', () => {
    track('purchase', SAMPLE.purchase);
    track('purchase', SAMPLE.purchase);
    expect(layer()).toHaveLength(1);
    expect(localStorage.getItem('nl_purchase_ord_1')).not.toBeNull();

    resetAnalytics(); // reload: memory gone, localStorage stays
    track('purchase', SAMPLE.purchase);
    expect(layer()).toHaveLength(1);

    track('purchase', { ...SAMPLE.purchase, transaction_id: 'ord_2' });
    expect(layer()).toHaveLength(2);
  });

  it('plan_viewed not on bfcache restore', () => {
    track('plan_viewed', SAMPLE.plan_viewed);
    expect(layer()).toHaveLength(1);

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    track('plan_viewed', SAMPLE.plan_viewed);
    expect(layer()).toHaveLength(1);

    track('plan_viewed', SAMPLE.plan_viewed);
    expect(layer()).toHaveLength(2);
  });

  it('before consent queued; granted flushes; denied drops', () => {
    setConsent('pending');
    track('plan_selected', SAMPLE.plan_selected);
    track('purchase', SAMPLE.purchase);
    expect(layer()).toHaveLength(0);
    expect(localStorage.getItem('nl_purchase_ord_1')).toBeNull();

    // params resolved at call time, not at flush
    setCommonSource(() => ({ market: 'lt', locale: 'lt', reviewStep: false, utm: {} }));
    setConsent('granted');
    expect(layer().map((e) => e.event)).toEqual(['plan_selected', 'purchase']);
    expect(layer()[0]).toMatchObject({ market: 'EE', utm_source: 'news' });
    expect(localStorage.getItem('nl_purchase_ord_1')).not.toBeNull();

    setConsent('pending');
    track('plan_selected', SAMPLE.plan_selected);
    setConsent('denied');
    setConsent('granted');
    expect(layer()).toHaveLength(2);

    setConsent('denied');
    track('purchase', { ...SAMPLE.purchase, transaction_id: 'ord_9' });
    expect(layer()).toHaveLength(2);
    expect(localStorage.getItem('nl_purchase_ord_9')).toBeNull();
  });

  it('throwing common source never breaks track or the redirect', () => {
    vi.useFakeTimers();
    setCommonSource(() => {
      throw new Error('boom');
    });
    expect(() => track('plan_selected', SAMPLE.plan_selected)).not.toThrow();
    const navigate = vi.fn();
    trackThenRedirect('payment_started', SAMPLE.payment_started, navigate);
    vi.advanceTimersByTime(300);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  describe('redirect waits for eventCallback, 300–500 ms', () => {
    const start = () => {
      vi.useFakeTimers();
      const navigate = vi.fn();
      trackThenRedirect('payment_started', SAMPLE.payment_started, navigate);
      return navigate;
    };
    const callback = () => (layer()[0]!.eventCallback as () => void)();

    it('not before 300 ms even if callback is instant', () => {
      const navigate = start();
      callback();
      vi.advanceTimersByTime(299);
      expect(navigate).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('goes on callback arriving between 300 and 500 ms', () => {
      const navigate = start();
      vi.advanceTimersByTime(400);
      expect(navigate).not.toHaveBeenCalled();
      callback();
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('goes at 500 ms when GTM never calls back, once', () => {
      const navigate = start();
      vi.advanceTimersByTime(499);
      expect(navigate).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(navigate).toHaveBeenCalledTimes(1);
      callback();
      vi.advanceTimersByTime(1000);
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('pending consent: nothing pushed, still navigates at 300 ms', () => {
      setConsent('pending');
      const navigate = start();
      vi.advanceTimersByTime(300);
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(layer()).toHaveLength(0);
    });
  });
});
