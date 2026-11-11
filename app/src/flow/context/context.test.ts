import { persistUtm } from '../utm/utm';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildReturnUrl, parseFlowParams, resolveFlowParams, saveStoredParams } from './context';
import type { FlowParams } from './context';

const params: FlowParams = {
  plan: 'standard',
  market: 'lt',
  locale: 'en',
  utm: { utm_source: 'news', utm_campaign: 'spring sale' },
  orderId: null,
};

const searchOf = (url: string) => new URL(url).searchParams;

describe('flow context', () => {
  beforeEach(() => window.sessionStorage.clear());

  it.each(['/auth/callback', '/payment/return'] as const)(
    'returnUrl round trip: plan, market, locale (%s)',
    (path) => {
      const url = buildReturnUrl('http://localhost:3000', path, params);
      expect(new URL(url).pathname).toBe(path);
      expect(parseFlowParams(searchOf(url))).toEqual(params);
    },
  );

  it('orderId round trip on /auth/callback (IdentityLost reverify)', () => {
    const withOrder = { ...params, orderId: 'ord_1' };
    const url = buildReturnUrl('http://localhost:3000', '/auth/callback', withOrder);
    expect(parseFlowParams(searchOf(url))?.orderId).toBe('ord_1');
  });

  it('stored beats query', () => {
    saveStoredParams(window.sessionStorage, params);
    const query = 'plan=basic&market=ee&locale=et';
    expect(resolveFlowParams(window.sessionStorage, query)).toEqual({ ...params, utm: {} });
  });

  it('query used only when nothing stored', () => {
    const resolved = resolveFlowParams(window.sessionStorage, 'plan=basic&market=ee&locale=et');
    expect(resolved).toMatchObject({ plan: 'basic', market: 'ee', locale: 'et' });
  });

  it('invalid query pair rejected via resolvePair', () => {
    for (const query of ['market=ee&locale=lt', 'market=xx&locale=en', 'market=EE&locale=et', '']) {
      expect(resolveFlowParams(window.sessionStorage, query)).toBeNull();
    }
  });

  it('storage throwing → still resolves from query', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    const resolved = resolveFlowParams(throwing, 'plan=premium&market=lv&locale=lv');
    expect(resolved).toMatchObject({ plan: 'premium', market: 'lv', locale: 'lv' });
  });

  it('save without consent leaves no UTM in sessionStorage', () => {
    saveStoredParams(window.sessionStorage, params);
    persistUtm(window.sessionStorage, params.utm, false);
    const all = Object.keys(window.sessionStorage).map(
      (k) => `${k}=${window.sessionStorage.getItem(k)}`,
    );
    expect(all.join('&')).not.toContain('utm_');
  });

  it('stored orderId null does not hide ?orderId from the URL', () => {
    saveStoredParams(window.sessionStorage, { ...params, orderId: null });
    const resolved = resolveFlowParams(window.sessionStorage, 'market=ee&locale=et&orderId=ord_1');
    expect(resolved).toMatchObject({ market: 'lt', locale: 'en', orderId: 'ord_1' });
  });

  it('query UTMs used when context is stored but no nl_utm', () => {
    saveStoredParams(window.sessionStorage, params);
    const resolved = resolveFlowParams(
      window.sessionStorage,
      'market=ee&locale=et&utm_source=news',
    );
    expect(resolved?.utm).toEqual({ utm_source: 'news' });
  });
});
