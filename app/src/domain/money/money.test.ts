import { describe, expect, it } from 'vitest';
import { formatMoney, grossCents } from './money';

// Intl uses a no-break space before the symbol; normalise for readable expectations.
const plain = (s: string) => s.replace(/ /g, ' ');

describe('money', () => {
  it('gross 899 @ 0.24 = 1115', () => expect(grossCents(899, 0.24)).toBe(1115));
  it('gross 1299 @ 0.21 = 1572', () => expect(grossCents(1299, 0.21)).toBe(1572));

  it('formats per locale (et, lv, lt, en)', () => {
    expect(plain(formatMoney(1115, 'EUR', 'et'))).toBe('11,15 €');
    expect(plain(formatMoney(1115, 'EUR', 'lv'))).toBe('11,15 €');
    expect(plain(formatMoney(1115, 'EUR', 'lt'))).toBe('11,15 €');
    expect(plain(formatMoney(1115, 'EUR', 'en'))).toBe('€11.15');
  });
});
