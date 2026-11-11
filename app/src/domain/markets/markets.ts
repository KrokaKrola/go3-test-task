import type { Locale } from '../locale/locale';

export type Market = 'ee' | 'lv' | 'lt';
export type Pair = Readonly<{ market: Market; locale: Locale }>;

const LOCAL_LOCALE: Record<Market, Locale> = { ee: 'et', lv: 'lv', lt: 'lt' };
const MARKET_ORDER: readonly Market[] = ['ee', 'lt', 'lv'];

export const ALL_PAIRS: readonly Pair[] = MARKET_ORDER.flatMap((market) => [
  Object.freeze({ market, locale: LOCAL_LOCALE[market] }),
  Object.freeze({ market, locale: 'en' as const }),
]);

export function enabledPairs(flags: { 'market.LV': boolean }): readonly Pair[] {
  return flags['market.LV'] ? ALL_PAIRS : ALL_PAIRS.filter((p) => p.market !== 'lv');
}

export type PairResolution =
  { kind: 'ok'; pair: Pair } | { kind: 'redirect'; pair: Pair } | { kind: 'root' };

const isMarket = (value: string): value is Market => Object.hasOwn(LOCAL_LOCALE, value);

const hasPair = (pairs: readonly Pair[], market: string, locale: string) =>
  pairs.find((p) => p.market === market && p.locale === locale);

// 08 Fallback. Callers with a disabled market (callbacks, Q52) pass ALL_PAIRS.
export function resolvePair(
  market: string,
  locale: string,
  pairs: readonly Pair[],
): PairResolution {
  const m = market.toLowerCase();
  const l = locale.toLowerCase();
  const exact = hasPair(pairs, m, l);
  if (exact) return { kind: market === m && locale === l ? 'ok' : 'redirect', pair: exact };
  if (!isMarket(m)) return { kind: 'root' };
  const local = hasPair(pairs, m, LOCAL_LOCALE[m]);
  return local ? { kind: 'redirect', pair: local } : { kind: 'root' };
}

const DEFAULT_PAIR: Pair = { market: 'ee', locale: 'et' };

// Q55: language subtag picks the locale, region subtag breaks ties between markets.
export function pickRootPair(languages: readonly string[], pairs: readonly Pair[]): Pair {
  for (const tag of languages) {
    const [language, region] = tag.toLowerCase().split('-');
    const candidates = pairs.filter((p) => p.locale === language);
    const match = candidates.find((p) => p.market === region) ?? candidates[0];
    if (match) return match;
  }
  return DEFAULT_PAIR;
}
