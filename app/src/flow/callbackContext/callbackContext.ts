import type { FlowParams } from '@/flow/context/context';
import { planIdFor } from '@/domain/plans/plans';
import type { FlowContext } from '@/flow/machine/machine';

// No open order here: it lives in localStorage (W-10) and the callback only needs the reverify id.
export function callbackContext(params: FlowParams, reviewStep: boolean): FlowContext {
  return {
    market: params.market,
    locale: params.locale,
    planId: params.plan ? (planIdFor(params.plan) ?? null) : null,
    reviewStep,
    identified: false,
    openOrderId: null,
    reverifyOrderId: params.orderId,
    conflictRetried: false,
  };
}
