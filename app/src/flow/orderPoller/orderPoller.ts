import type { ApiError } from '@/api/errors/errors';
import type { OrderResponse } from '@/api/schemas/schemas';
import {
  POLL_GIVE_UP_MS,
  STILL_CONFIRMING_AFTER_MS,
  pollDelay,
} from '@/flow/pollSchedule/pollSchedule';

export type PollerHandlers = {
  getOrder: (signal: AbortSignal) => Promise<Pick<OrderResponse, 'status' | 'actionUrl'>>;
  onOrder: (order: Pick<OrderResponse, 'status' | 'actionUrl'>) => void;
  onError: (error: ApiError) => void;
  onStillConfirming: () => void;
  onTimeout: () => void;
};

// Polling (04, Q9). One GET at a time; a slow response delays the next one. Returns `stop`.
export function startOrderPoller(handlers: PollerHandlers): () => void {
  const abort = new AbortController();
  const startedAt = Date.now();
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    abort.abort();
    clearTimeout(pollTimer);
    clearTimeout(stillConfirmingTimer);
    clearTimeout(giveUpTimer);
  };

  const scheduleNext = () => {
    const delay = pollDelay(Date.now() - startedAt);
    if (delay !== null) pollTimer = setTimeout(poll, delay);
  };

  const poll = () => {
    handlers.getOrder(abort.signal).then(
      (order) => {
        if (abort.signal.aborted) return;
        handlers.onOrder(order);
        if (!abort.signal.aborted) scheduleNext();
      },
      (error: ApiError) => {
        if (abort.signal.aborted) return;
        handlers.onError(error);
        if (!abort.signal.aborted) scheduleNext();
      },
    );
  };

  const stillConfirmingTimer = setTimeout(() => {
    if (!abort.signal.aborted) handlers.onStillConfirming();
  }, STILL_CONFIRMING_AFTER_MS);
  const giveUpTimer = setTimeout(() => {
    if (abort.signal.aborted) return;
    stop();
    handlers.onTimeout();
  }, POLL_GIVE_UP_MS);

  scheduleNext();
  return stop;
}
