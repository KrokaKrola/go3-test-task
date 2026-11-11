import { describe, expect, it, vi } from 'vitest';
import { captureUtm, loadUtm, persistUtm, resolveUtm } from './utm';

describe('utm', () => {
  it('last landing with utm_* replaces set', () => {
    const previous = { utm_source: 'old', utm_medium: 'email', utm_term: 'x' };
    expect(captureUtm('?utm_campaign=new&gclid=1', previous)).toEqual({ utm_campaign: 'new' });
  });

  it('keeps stored set on a landing without utm_*', () => {
    const previous = { utm_source: 'old' };
    expect(captureUtm('?gclid=1', previous)).toBe(previous);
  });

  it('persisted only when canPersist', () => {
    const storage = window.sessionStorage;
    storage.clear();
    persistUtm(storage, { utm_source: 'a' }, false);
    expect(loadUtm(storage)).toBeNull();
    persistUtm(storage, { utm_source: 'a' }, true);
    expect(loadUtm(storage)).toEqual({ utm_source: 'a' });
  });

  it('survives throwing storage', () => {
    const setItem = vi.fn(() => {
      throw new Error('blocked');
    });
    expect(() => persistUtm({ setItem }, { utm_source: 'a' }, true)).not.toThrow();
  });

  it('truncated to 100 chars', () => {
    const set = captureUtm(`?utm_source=${'a'.repeat(150)}`, {});
    expect(set.utm_source).toHaveLength(100);
  });

  it('stored set beats query, query used when nothing stored', () => {
    expect(resolveUtm({ utm_source: 's' }, { utm_source: 'q' })).toEqual({ utm_source: 's' });
    expect(resolveUtm(null, { utm_source: 'q' })).toEqual({ utm_source: 'q' });
  });
});
