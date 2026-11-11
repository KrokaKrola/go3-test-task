import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Locale } from '@/domain/locale/locale';
import type { Market } from '@/domain/markets/markets';
import { CmsValidationError, parsePlanPage } from './parsePlanPage';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const fixture = (market: string, locale: string): Raw =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, `../../../../fixtures/cms/plan-page.${market}.${locale}.json`),
      'utf8',
    ),
  );

const plan = (id: string, priceNet: number, vatRate: number) => ({
  id,
  name: 'api name',
  priceNet,
  vatRate,
  currency: 'EUR',
});
const API = {
  EE: [
    plan('plan_basic_m', 599, 0.24),
    plan('plan_std_m', 899, 0.24),
    plan('plan_prem_m', 1299, 0.24),
  ],
  LT: [
    plan('plan_basic_m', 599, 0.21),
    plan('plan_std_m', 899, 0.21),
    plan('plan_prem_m', 1299, 0.21),
  ],
  LV: [plan('plan_basic_m', 599, 0.21), plan('plan_std_m', 899, 0.21)],
};

const run = (market: Market, locale: Locale, raw: unknown, marketEnabled = true) =>
  parsePlanPage(raw, API[market.toUpperCase() as keyof typeof API], {
    marketEnabled,
    market,
    locale,
  });

const ee = () => fixture('EE', 'et');
const lvFilled = (locale: Locale) => {
  const raw = fixture('LV', locale);
  raw.legalText = [{ type: 'paragraph', text: 'Legal' }];
  return raw;
};

describe('parsePlanPage', () => {
  describe('outcome per fixture', () => {
    it.each([
      ['EE', 'et', 'ee'],
      ['EE', 'en', 'ee'],
      ['LT', 'lt', 'lt'],
      ['LT', 'en', 'lt'],
    ] as const)('%s.%s valid with LV on and off', (m, locale, market) => {
      for (const marketEnabled of [true, false]) {
        const { page, warnings } = run(market, locale, fixture(m, locale), marketEnabled);
        expect(warnings).toEqual([]);
        expect(page?.cards.map((c) => c.planKey)).toEqual(['basic', 'standard', 'premium']);
        expect(page?.cards.map((c) => c.badge).filter(Boolean)).toHaveLength(1);
        expect(page?.cards[1]?.badge).not.toBeNull();
        expect(page?.legalText).toHaveLength(2);
        expect(page?.faq).toHaveLength(2);
      }
    });

    it.each(['en', 'lv'] as const)(
      'LV.%s with LV off: not generated, warning legalText empty',
      (locale) => {
        const { page, warnings } = run('lv', locale, fixture('LV', locale), false);
        expect(page).toBeNull();
        expect(warnings).toContain('legalText empty');
      },
    );

    it.each(['en', 'lv'] as const)('LV.%s with LV on: build fails on legalText', (locale) => {
      expect(() => run('lv', locale, fixture('LV', locale), true)).toThrow(/legalText empty/);
    });

    it('LV.en once legalText fixed: Basic + Standard with badge, Premium hidden, FAQ hidden', () => {
      const { page } = run('lv', 'en', lvFilled('en'));
      expect(page?.cards.map((c) => c.planKey)).toEqual(['basic', 'standard']);
      expect(page?.cards[1]?.badge).toBeTruthy();
      expect(page?.faq).toEqual([]);
    });

    it('LV.lv once legalText fixed: Standard without bullets or badge, Premium (empty title) hidden', () => {
      const { page } = run('lv', 'lv', lvFilled('lv'));
      expect(page?.cards.map((c) => c.planKey)).toEqual(['basic', 'standard']);
      expect(page?.cards[1]?.bullets).toEqual([]);
      expect(page?.cards[1]?.badge).toBeNull();
      expect(page?.faq).toEqual([]);
    });
  });

  describe('card merge rules 1–6', () => {
    it('1: unknown planKey dropped with a warning', () => {
      const raw = ee();
      raw.planCards.push({ planKey: 'gold', title: 'Gold', bullets: [] });
      const { page, warnings } = run('ee', 'et', raw);
      expect(page?.cards).toHaveLength(3);
      expect(warnings.join()).toMatch(/unknown planKey/);
    });

    it('2: duplicate planKey fails the build', () => {
      const raw = ee();
      raw.planCards.push({ ...raw.planCards[0] });
      expect(() => run('ee', 'et', raw)).toThrow(/duplicate planKey basic/);
    });

    it('API plans empty fails the build', () => {
      expect(() =>
        parsePlanPage(ee(), [], { marketEnabled: true, market: 'ee', locale: 'et' }),
      ).toThrow(/no plans/);
    });

    it('3: card without API plan is hidden, no error', () => {
      const { page } = parsePlanPage(ee(), API.EE.slice(0, 2), {
        marketEnabled: true,
        market: 'ee',
        locale: 'et',
      });
      expect(page?.cards.map((c) => c.planKey)).toEqual(['basic', 'standard']);
    });

    it('4: API plan without CMS card fails an enabled market, only warns a disabled one', () => {
      const raw = ee();
      raw.planCards = raw.planCards.slice(0, 2);
      expect(() => run('ee', 'et', raw)).toThrow(/plan_prem_m has no CMS card/);
      const disabled = run('ee', 'et', raw, false);
      expect(disabled.page).toBeNull();
      expect(disabled.warnings.join()).toMatch(/plan_prem_m/);
    });

    it('5: rendered card with empty title fails the build', () => {
      const raw = ee();
      raw.planCards[2].title = '  ';
      expect(() => run('ee', 'et', raw)).toThrow(/title empty/);
    });

    it('6: order is CMS order, price from API and never from priceLabel', () => {
      const raw = ee();
      raw.planCards.reverse();
      const { page } = run('ee', 'et', raw);
      expect(page?.cards.map((c) => c.planKey)).toEqual(['premium', 'standard', 'basic']);
      const standard = page?.cards.find((c) => c.planKey === 'standard');
      expect(standard?.priceText).toMatch(/^11,15\s€$/);
      expect(JSON.stringify(page)).not.toContain('10,99');
    });
  });

  describe('legalText', () => {
    it('non-paragraph skipped + warning', () => {
      const raw = ee();
      raw.legalText.push({ type: 'list', items: [] }, 'text', { type: 'paragraph', text: ' ' });
      const { page, warnings } = run('ee', 'et', raw);
      expect(page?.legalText).toHaveLength(2);
      expect(warnings.filter((w) => /non-paragraph/.test(w))).toHaveLength(2);
    });
  });

  describe('field rules', () => {
    it('paragraph without text skipped silently; non-object faq item is an error', () => {
      const raw = ee();
      raw.legalText.push({ type: 'paragraph' });
      const { page, warnings } = run('ee', 'et', raw);
      expect(page?.legalText).toHaveLength(2);
      expect(warnings).toEqual([]);
      raw.faq.push('oops');
      expect(() => run('ee', 'et', raw)).toThrow(/faq items/);
    });

    it('wrong type is an error even on optional fields', () => {
      const raw = ee();
      raw.subhead = 5;
      expect(() => run('ee', 'et', raw)).toThrow(CmsValidationError);
    });

    it('market/locale mismatch fails', () => {
      expect(() => run('lt', 'lt', ee())).toThrow(/expected lt\/lt/);
    });

    it('empty bullets dropped with warning, empty faq side dropped with warning', () => {
      const raw = ee();
      raw.planCards[0].bullets.push(' ');
      raw.faq.push({ question: 'Q', answer: '' });
      const { page, warnings } = run('ee', 'et', raw);
      expect(page?.cards[0]?.bullets).toHaveLength(3);
      expect(page?.faq).toHaveLength(2);
      expect(warnings).toHaveLength(2);
    });

    it('empty headline fails; empty subhead is not rendered', () => {
      const raw = ee();
      raw.subhead = '';
      expect(run('ee', 'et', raw).page?.subhead).toBeNull();
      raw.headline = '';
      expect(() => run('ee', 'et', raw)).toThrow(/headline empty/);
    });
  });
});
