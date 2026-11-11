import { describe, expect, it } from 'vitest';
import { ALL_PAIRS, enabledPairs, pickRootPair, resolvePair } from './markets';

const lvOff = enabledPairs({ 'market.LV': false });
const lvOn = enabledPairs({ 'market.LV': true });

describe('enabledPairs', () => {
  it('LV pairs only with the flag on', () => {
    expect(lvOff.map((p) => `${p.market}/${p.locale}`)).toEqual([
      'ee/et',
      'ee/en',
      'lt/lt',
      'lt/en',
    ]);
    expect(lvOn).toEqual(ALL_PAIRS);
    expect(lvOn).toHaveLength(6);
  });
});

describe('resolvePair', () => {
  it('valid lowercase pair is ok', () => {
    expect(resolvePair('lt', 'en', lvOff)).toEqual({
      kind: 'ok',
      pair: { market: 'lt', locale: 'en' },
    });
  });

  it('uppercase /EE/ET/ → /ee/et/', () => {
    expect(resolvePair('EE', 'ET', lvOff)).toEqual({
      kind: 'redirect',
      pair: { market: 'ee', locale: 'et' },
    });
  });

  it.each([
    ['ee', 'ru', 'ee', 'et'],
    ['ee', 'lv', 'ee', 'et'],
    ['lt', 'xx', 'lt', 'lt'],
  ])('valid market %s, unknown locale %s → local locale', (market, locale, m, l) => {
    expect(resolvePair(market, locale, lvOff)).toEqual({
      kind: 'redirect',
      pair: { market: m, locale: l },
    });
  });

  it('unknown market → root', () => {
    expect(resolvePair('xx', 'en', lvOff)).toEqual({ kind: 'root' });
    expect(resolvePair('toString', 'en', lvOff)).toEqual({ kind: 'root' });
  });

  it('LV with flag off → root, with flag on → ok', () => {
    expect(resolvePair('lv', 'lv', lvOff)).toEqual({ kind: 'root' });
    expect(resolvePair('lv', 'ru', lvOff)).toEqual({ kind: 'root' });
    expect(resolvePair('lv', 'lv', lvOn).kind).toBe('ok');
  });

  it('callbacks: ALL_PAIRS resolves lv even when flag is off (Q52)', () => {
    expect(resolvePair('lv', 'lv', ALL_PAIRS).kind).toBe('ok');
  });
});

describe('pickRootPair', () => {
  it('from navigator.languages, default ee/et', () => {
    expect(pickRootPair(['lt-LT', 'en'], lvOff)).toEqual({ market: 'lt', locale: 'lt' });
    expect(pickRootPair(['ru-RU', 'et'], lvOff)).toEqual({ market: 'ee', locale: 'et' });
    expect(pickRootPair(['lv-LV', 'lt'], lvOff)).toEqual({ market: 'lt', locale: 'lt' });
    expect(pickRootPair(['lv'], lvOn)).toEqual({ market: 'lv', locale: 'lv' });
    expect(pickRootPair(['en-LT'], lvOff)).toEqual({ market: 'lt', locale: 'en' });
    expect(pickRootPair(['en-US'], lvOff)).toEqual({ market: 'ee', locale: 'en' });
    expect(pickRootPair(['ru-RU', 'de'], lvOff)).toEqual({ market: 'ee', locale: 'et' });
    expect(pickRootPair([], lvOff)).toEqual({ market: 'ee', locale: 'et' });
  });
});
