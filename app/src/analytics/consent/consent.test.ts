import { afterEach, describe, expect, it, vi } from 'vitest';
import { canPersistAnalytics, getConsent, setConsent, subscribeConsent } from './consent';

afterEach(() => setConsent('pending'));

describe('consent', () => {
  it('slice adapter returns pending', () => {
    expect(getConsent()).toBe('pending');
    expect(canPersistAnalytics()).toBe(false);
  });

  it('subscribers notified on update', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConsent(listener);
    setConsent('granted');
    expect(listener).toHaveBeenLastCalledWith('granted');
    expect(canPersistAnalytics()).toBe(true);
    setConsent('granted');
    expect(listener).toHaveBeenCalledTimes(1);
    setConsent('denied');
    expect(listener).toHaveBeenLastCalledWith('denied');
    unsubscribe();
    setConsent('granted');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
