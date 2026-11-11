// Proof that `rungate=1` came from our own callback in this tab, not a crafted link (04 inv. 1, Q68).
const RUN_GATE_TOKEN_KEY = 'nl_run_gate';

type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function issueRunGateToken(storage: TokenStorage, planKey: string): void {
  storage.setItem(RUN_GATE_TOKEN_KEY, planKey);
}

// One-time: always cleared, true only when it was issued for this plan.
export function consumeRunGateToken(storage: TokenStorage, planKey: string | null): boolean {
  const issuedFor = storage.getItem(RUN_GATE_TOKEN_KEY);
  storage.removeItem(RUN_GATE_TOKEN_KEY);
  return issuedFor !== null && issuedFor === planKey;
}
