import { afterEach, describe, expect, it } from 'vitest';
import { HANDOFF_BOOT_SCRIPT, endHandoff, isHandoffActive } from './paymentHandoff';

const boot = (search: string) => {
  window.history.replaceState(null, '', `/ee/en/${search}`);
  new Function(HANDOFF_BOOT_SCRIPT)();
};

afterEach(endHandoff);

describe('paymentHandoff', () => {
  it('boot script marks <html> for rungate=1', () => {
    boot('?plan=standard&rungate=1');
    expect(isHandoffActive()).toBe(true);
  });

  it.each(['', '?plan=standard', '?rungate=0'])('no mark for %j', (search) => {
    boot(search);
    expect(isHandoffActive()).toBe(false);
  });

  it('endHandoff clears the mark', () => {
    boot('?rungate=1');
    endHandoff();
    expect(isHandoffActive()).toBe(false);
  });
});
