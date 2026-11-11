import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

const base = {
  NEXT_PUBLIC_API_BASE: 'http://localhost:4010',
  NEXT_PUBLIC_ACCOUNT_URL: 'http://localhost:3000/account-stub',
};

describe('config', () => {
  it('defaults: reviewStep on, market.LV off', () => {
    const { flags } = parseConfig(base);
    expect(flags.reviewStep).toBe(true);
    expect(flags['market.LV']).toBe(false);
  });

  it('rejects missing API_BASE', () => {
    expect(() => parseConfig({ ...base, NEXT_PUBLIC_API_BASE: undefined })).toThrow(
      /NEXT_PUBLIC_API_BASE/,
    );
  });

  it('rejects missing ACCOUNT_URL', () => {
    expect(() => parseConfig({ ...base, NEXT_PUBLIC_ACCOUNT_URL: undefined })).toThrow(
      /NEXT_PUBLIC_ACCOUNT_URL/,
    );
  });

  it('reads flag overrides', () => {
    const { flags } = parseConfig({
      ...base,
      NEXT_PUBLIC_FLAG_REVIEW_STEP: 'false',
      NEXT_PUBLIC_FLAG_MARKET_LV: 'true',
    });
    expect(flags).toEqual({ reviewStep: false, 'market.LV': true });
  });
});
