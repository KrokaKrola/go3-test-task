import type { EventMap } from '@/analytics/analytics/analytics';
import type { PlansResponse } from '@/api/schemas/schemas';
import type { Market } from '@/domain/markets/markets';
import { grossCents } from '@/domain/money/money';
import type { OpenOrder } from '@/flow/openOrder/openOrder';

export type ConfirmDeps = {
  orderId: string;
  market: Market;
  // Open order captured before anything cleared it; only used when it is this order.
  openOrder: OpenOrder | null;
  // `planId` of the paid order from GET /v1/orders/{id}, for the no-snapshot case.
  orderPlanId: string | null;
  getPlans: (market: Market) => Promise<PlansResponse>;
  purchaseSent: (orderId: string) => boolean;
  trackPurchase: (params: EventMap['purchase']) => void;
  clearOpenOrder: () => void;
  clearContext: () => void;
};

const trialParam = (trial: OpenOrder['snapshot']['trial']): EventMap['purchase']['trial'] =>
  trial === 'unknown' ? 'unknown' : trial === 'true';

// 04 Confirmed, 07 `purchase`: params from the snapshot, then clear the open order and context.
export async function confirmOrder(deps: ConfirmDeps): Promise<void> {
  const snapshotOrder = deps.openOrder?.orderId === deps.orderId ? deps.openOrder : null;
  const alreadySent = deps.purchaseSent(deps.orderId);
  const finish = () => {
    deps.clearOpenOrder();
    deps.clearContext();
  };

  if (alreadySent) return finish();
  if (snapshotOrder) {
    const { snapshot, planId } = snapshotOrder;
    deps.trackPurchase({
      transaction_id: deps.orderId,
      value: snapshot.value,
      tax: snapshot.tax,
      currency: snapshot.currency,
      plan_id: planId,
      trial: trialParam(snapshot.trial),
    });
    return finish();
  }

  // No snapshot (another browser, Q7): estimate from the current plan price, trial unknown.
  finish();
  if (!deps.orderPlanId) return;
  try {
    const { plans } = await deps.getPlans(deps.market);
    const plan = plans.find((p) => p.id === deps.orderPlanId);
    if (!plan) return;
    const gross = grossCents(plan.priceNet, plan.vatRate);
    deps.trackPurchase({
      transaction_id: deps.orderId,
      value: gross / 100,
      tax: (gross - plan.priceNet) / 100,
      currency: plan.currency,
      plan_id: plan.id,
      trial: 'unknown',
    });
  } catch {
    // No price, no event: a later return can still send it (guard not set).
  }
}
