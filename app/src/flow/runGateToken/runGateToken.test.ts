import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/flow/browserStorage/browserStorage';
import { consumeRunGateToken, issueRunGateToken } from './runGateToken';

beforeEach(() => window.sessionStorage.clear());

describe('runGateToken', () => {
  it('issued for a plan → consumed once for that plan', () => {
    issueRunGateToken(sessionStore, 'standard');
    expect(consumeRunGateToken(sessionStore, 'standard')).toBe(true);
    expect(consumeRunGateToken(sessionStore, 'standard')).toBe(false);
  });

  it('no token (crafted link) → false', () => {
    expect(consumeRunGateToken(sessionStore, 'premium')).toBe(false);
  });

  it('token for another plan → false, and cleared', () => {
    issueRunGateToken(sessionStore, 'basic');
    expect(consumeRunGateToken(sessionStore, 'premium')).toBe(false);
    expect(consumeRunGateToken(sessionStore, 'basic')).toBe(false);
  });

  it('no plan → false', () => {
    issueRunGateToken(sessionStore, 'basic');
    expect(consumeRunGateToken(sessionStore, null)).toBe(false);
  });

  it('sessionStorage throwing → no Gate, no throw', () => {
    const blocked = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => issueRunGateToken(sessionStore, 'basic')).not.toThrow();
    expect(consumeRunGateToken(sessionStore, 'basic')).toBe(false);
    blocked.mockRestore();
  });
});
