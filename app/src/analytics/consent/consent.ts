export type ConsentState = 'pending' | 'granted' | 'denied';

type Listener = (state: ConsentState) => void;

// Slice has no CMP (Q53): stays `pending` unless a CMP bridge (or a test) calls setConsent.
let state: ConsentState = 'pending';
const listeners = new Set<Listener>();

export const getConsent = (): ConsentState => state;

export const canPersistAnalytics = (): boolean => state === 'granted';

export function setConsent(next: ConsentState): void {
  if (next === state) return;
  state = next;
  for (const listener of [...listeners]) listener(state);
}

export function subscribeConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
