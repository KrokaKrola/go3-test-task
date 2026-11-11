import type { ApiError } from '@/api/errors/errors';
import type { MeResponse, OrderResponse } from '@/api/schemas/schemas';
import type { FlowEffect, FlowEvent } from '@/flow/machine/machine';

export type GateDeps = {
  getMe: (signal: AbortSignal) => Promise<Pick<MeResponse, 'activeSubscription'>>;
  getOrder: (
    orderId: string,
    signal: AbortSignal,
  ) => Promise<Pick<OrderResponse, 'status' | 'actionUrl'>>;
  clearOpenOrder: () => void;
};

// Runs the Gate's I/O (04 Gate steps 1 and 3; `fetchMe` also serves Entry and Verifying).
// The machine decides every exit; this never starts an order. Returns false for other effects.
export function runGateEffect(
  effect: FlowEffect,
  dispatch: (event: FlowEvent) => void,
  signal: AbortSignal,
  deps: GateDeps,
): boolean {
  switch (effect.type) {
    case 'fetchMe':
      deps.getMe(signal).then(
        (me) => {
          if (!signal.aborted) dispatch({ type: 'meLoaded', me });
        },
        (error: ApiError) => {
          if (!signal.aborted) dispatch({ type: 'meFailed', error });
        },
      );
      return true;
    case 'fetchOrder':
      deps.getOrder(effect.orderId, signal).then(
        (order) => {
          if (!signal.aborted) dispatch({ type: 'orderLoaded', order });
        },
        (error: ApiError) => {
          if (!signal.aborted) dispatch({ type: 'orderFailed', error });
        },
      );
      return true;
    case 'clearOpenOrder':
      deps.clearOpenOrder();
      return true;
    default:
      return false;
  }
}
