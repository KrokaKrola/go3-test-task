import { describe, expect, it } from 'vitest';
import { pluralCategory, pluralForm } from './plural';

const counts = [0, 1, 2, 5, 11, 21];

describe('plural', () => {
  it('lt and lv for 0, 1, 2, 5, 11, 21', () => {
    expect(counts.map((n) => pluralCategory('lt', n))).toEqual([
      'other',
      'one',
      'few',
      'few',
      'other',
      'one',
    ]);
    expect(counts.map((n) => pluralCategory('lv', n))).toEqual([
      'zero',
      'one',
      'other',
      'other',
      'zero',
      'one',
    ]);
  });

  it('pluralForm falls back to other', () => {
    expect(pluralForm('lv', 0, { one: 'a', other: 'b' })).toBe('b');
    expect(pluralForm('lt', 2, { one: 'a', few: 'f', other: 'b' })).toBe('f');
  });
});
