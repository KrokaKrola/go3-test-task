import { describe, expect, it } from 'vitest';
import { catalogs } from './messages';

const sortedKeys = (catalog: object) => Object.keys(catalog).sort();

describe('messages', () => {
  it('all catalogs share keys', () => {
    const expected = sortedKeys(catalogs.en);
    for (const catalog of Object.values(catalogs)) expect(sortedKeys(catalog)).toEqual(expected);
  });

  it('no empty value', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });
});
