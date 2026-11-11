import { buildFlowUrl } from '@/flow/context/context';
import type { FlowParams } from '@/flow/context/context';
import { planKeyFor } from '@/domain/plans/plans';
import { NOTICE_PARAM } from '@/flow/notice/notice';
import type { FlowState } from '@/flow/machine/machine';
import type { UtmSet } from '@/flow/utm/utm';

// One-time marker for the Plans page (W-10): run the Gate once, then strip it with replaceState,
// so a reload shows Plans or the retry point and never an automatic Gate run (inv. 1, Q68).
export const RUN_GATE_PARAM = 'rungate';

// Where a page hands over once the machine leaves the states it renders. null = stay.
export function exitUrl(
  state: FlowState,
  utm: UtmSet,
  accountUrl: string,
  origin: string,
): string | null {
  const { ctx } = state;
  const params: FlowParams = {
    plan: ctx.planId ? (planKeyFor(ctx.planId) ?? null) : null,
    market: ctx.market,
    locale: ctx.locale,
    utm,
    orderId: null,
  };
  const home = `/${ctx.market}/${ctx.locale}/`;
  switch (state.name) {
    case 'Account':
      return accountUrl;
    case 'Review':
      return buildFlowUrl(origin, `${home}review/`, params);
    case 'Gate': {
      const url = new URL(buildFlowUrl(origin, home, params));
      url.searchParams.set(RUN_GATE_PARAM, '1');
      return url.toString();
    }
    case 'Plans': {
      const url = new URL(buildFlowUrl(origin, home, { ...params, plan: null }));
      if (state.view.notice) url.searchParams.set(NOTICE_PARAM, state.view.notice);
      return url.toString();
    }
    case 'Confirmed':
    case 'IdentityLost':
      return buildFlowUrl(origin, '/payment/return/', { ...params, orderId: state.orderId });
    case 'PaymentReturn':
      return state.orderId
        ? buildFlowUrl(origin, '/payment/return/', { ...params, orderId: state.orderId })
        : null;
    default:
      return null;
  }
}
