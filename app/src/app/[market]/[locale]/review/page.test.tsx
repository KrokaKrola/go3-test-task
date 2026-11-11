import { describe, expect, it, vi } from 'vitest';

const { flags } = vi.hoisted(() => ({ flags: { reviewStep: false, 'market.LV': false } }));
vi.mock('@/config', () => ({
  getConfig: () => ({ API_BASE: 'http://api.test', ACCOUNT_URL: 'http://acc.test', flags }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/cms/loadPlanPage/loadPlanPage', () => ({ loadPlanPage: vi.fn() }));

import ReviewPage, { generateStaticParams } from './page';

describe('review page with reviewStep off', () => {
  it('still has static params (export needs a path) and renders the 404', async () => {
    expect(generateStaticParams().length).toBeGreaterThan(0);
    await expect(
      ReviewPage({ params: Promise.resolve({ market: 'ee', locale: 'en' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
