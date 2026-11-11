// Q9: every 2 s for 20 s, then every 5 s, give up at 3 min.
export const FAST_POLL_MS = 2_000;
export const SLOW_POLL_MS = 5_000;
export const STILL_CONFIRMING_AFTER_MS = 20_000;
export const POLL_GIVE_UP_MS = 180_000;

// Wait before the next GET, given the time since polling began. null = stop.
export function pollDelay(elapsedMs: number): number | null {
  if (elapsedMs >= POLL_GIVE_UP_MS) return null;
  return elapsedMs < STILL_CONFIRMING_AFTER_MS ? FAST_POLL_MS : SLOW_POLL_MS;
}
