import { describe, expect, it } from 'vitest';
import { pollDelay } from './pollSchedule';

describe('pollSchedule', () => {
  it('2 s until 20 s, then 5 s, stop at 180 s', () => {
    expect(pollDelay(0)).toBe(2_000);
    expect(pollDelay(19_999)).toBe(2_000);
    expect(pollDelay(20_000)).toBe(5_000);
    expect(pollDelay(179_999)).toBe(5_000);
    expect(pollDelay(180_000)).toBeNull();
    expect(pollDelay(500_000)).toBeNull();
  });
});
