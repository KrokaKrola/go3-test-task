import { describe, expect, it } from 'vitest';
import type { FlowContext, FlowState } from '@/flow/machine/machine';
import { RUN_GATE_PARAM, exitUrl } from './exitUrl';

const ctx: FlowContext = {
  market: 'lt',
  locale: 'en',
  planId: 'plan_prem_m',
  reviewStep: true,
  identified: true,
  openOrderId: null,
  reverifyOrderId: null,
  conflictRetried: false,
};
const urlOf = (state: FlowState) =>
  exitUrl(state, { utm_source: 'news' }, 'https://acc.test/', 'http://o.test');

describe('exitUrl', () => {
  it('Review keeps plan, market, locale and utm', () => {
    const url = new URL(
      urlOf({ name: 'Review', ctx, view: {}, plansError: false, consentError: false })!,
    );
    expect(url.pathname).toBe('/lt/en/review/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      plan: 'premium',
      market: 'lt',
      locale: 'en',
      utm_source: 'news',
    });
  });

  it('Plans (change plan) carries no plan', () => {
    const url = new URL(urlOf({ name: 'Plans', ctx, view: {} })!);
    expect(url.pathname).toBe('/lt/en/');
    expect(url.searchParams.has('plan')).toBe(false);
  });

  it('Account → ACCOUNT_URL, own states → null', () => {
    expect(urlOf({ name: 'Account', ctx })).toBe('https://acc.test/');
    expect(urlOf({ name: 'Verifying', ctx })).toBeNull();
  });

  it('Gate (reviewStep off) → Plans URL with a one-time rungate marker; Plans carries none', () => {
    const gate = new URL(urlOf({ name: 'Gate', ctx, step: 'me' })!);
    expect(gate.pathname).toBe('/lt/en/');
    expect(gate.searchParams.get(RUN_GATE_PARAM)).toBe('1');
    expect(gate.searchParams.get('plan')).toBe('premium');
    expect(new URL(urlOf({ name: 'Plans', ctx, view: {} })!).searchParams.has(RUN_GATE_PARAM)).toBe(
      false,
    );
  });
});
