import { describe, expect, it } from 'vitest';
import { intlTag } from './locale';

describe('locale', () => {
  it('en maps to en-150, others unchanged', () => {
    expect(intlTag('en')).toBe('en-150');
    expect(intlTag('et')).toBe('et');
    expect(intlTag('lv')).toBe('lv');
    expect(intlTag('lt')).toBe('lt');
  });
});
