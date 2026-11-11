import { trackThenRedirect } from '@/analytics/analytics/analytics';
import { createOrder } from '@/api/client/client';
import { isApiError, networkError } from '@/api/errors/errors';
import { grossCents } from '@/domain/money/money';
import { hasTrial, planKeyFor } from '@/domain/plans/plans';
import { buildReturnUrl } from '@/flow/context/context';
import type { FlowContext, FlowEffect, FlowEvent } from '@/flow/machine/machine';
import type { OpenOrder } from '@/flow/openOrder/openOrder';
import type { UtmSet } from '@/flow/utm/utm';

export type OrderSnapshot = OpenOrder['snapshot'];

export type ReviewPlan = { id: string; priceNet: number; vatRate: number; currency: string };

// `purchase` snapshot (07): what the user saw on Review. Trial shown → value and tax are 0.
export function buildOrderSnapshot(plan: ReviewPlan, trialEligible: boolean): OrderSnapshot {
  const planKey = planKeyFor(plan.id);
  const trial = planKey ? hasTrial(planKey, trialEligible) : false;
  const gross = grossCents(plan.priceNet, plan.vatRate);
  return {
    value: trial ? 0 : gross / 100,
    tax: trial ? 0 : (gross - plan.priceNet) / 100,
    currency: plan.currency,
    trial: trial ? 'true' : 'false',
  };
}

export type OrderAttempt = { ctx: FlowContext; utm: UtmSet; snapshot: OrderSnapshot };

export type CreateOrderDeps = {
  // Read when the effect runs: the attempt is whatever Review showed at Pay.
  attempt: () => OrderAttempt;
  origin: string;
  saveOpenOrder: (order: OpenOrder) => void;
  navigate: (url: string) => void;
};

// Runs CreatingOrder's effects (04). Slice: no attempt marker (04 Slice, Q39).
export function createOrderRunner(deps: CreateOrderDeps) {
  let saved: OpenOrder | null = null;
  return (effect: FlowEffect, dispatch: (event: FlowEvent) => void): boolean => {
    switch (effect.type) {
      case 'createOrder': {
        const { ctx, utm } = deps.attempt();
        const planKey = planKeyFor(effect.planId) ?? null;
        const returnUrl = buildReturnUrl(deps.origin, '/payment/return', {
          plan: planKey,
          market: ctx.market,
          locale: ctx.locale,
          utm,
          orderId: null,
        });
        createOrder({ planId: effect.planId, market: ctx.market, returnUrl }).then(
          ({ orderId, paymentUrl }) => dispatch({ type: 'orderCreated', orderId, paymentUrl }),
          (error: unknown) =>
            dispatch({
              type: 'orderCreateFailed',
              error: isApiError(error) ? error : networkError(),
            }),
        );
        return true;
      }
      case 'saveOpenOrder': {
        const { ctx, snapshot } = deps.attempt();
        saved = {
          orderId: effect.orderId,
          paymentUrl: effect.paymentUrl,
          planId: ctx.planId ?? '',
          market: ctx.market,
          locale: ctx.locale,
          snapshot,
        };
        deps.saveOpenOrder(saved);
        return true;
      }
      case 'redirect': {
        const order = saved;
        trackThenRedirect(
          'payment_started',
          { plan_id: order?.planId ?? '', transaction_id: order?.orderId ?? '' },
          () => deps.navigate(effect.url),
        );
        return true;
      }
      default:
        return false;
    }
  };
}
