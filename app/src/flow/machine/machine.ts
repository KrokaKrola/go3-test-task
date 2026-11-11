import type { ApiError, ApiErrorKind } from '@/api/errors/errors';
import type { MeResponse, OrderResponse } from '@/api/schemas/schemas';
import type { Locale } from '@/domain/locale/locale';
import type { Market } from '@/domain/markets/markets';

export type Notice = 'payment_cancelled' | 'payment_declined' | 'plan_unavailable';

// What a retry point shows on top of its normal screen (04 Terms).
export type RetryView = { notice?: Notice; errorKind?: ApiErrorKind; payDisabled?: boolean };

export type FlowContext = {
  market: Market;
  locale: Locale;
  planId: string | null;
  reviewStep: boolean;
  identified: boolean;
  // Open order from storage (04 Terms).
  openOrderId: string | null;
  // orderId carried by an IdentityLost re-verify returnUrl.
  reverifyOrderId: string | null;
  conflictRetried: boolean;
};

type WithCtx = { ctx: FlowContext };
export type EidFailReason = 'cancelled' | 'expired';
export type PaymentFailReason = 'cancelled' | 'declined';

export type FlowState =
  | ({ name: 'Entry' } & WithCtx)
  | ({ name: 'Plans'; view: RetryView } & WithCtx)
  | ({ name: 'StartingEid' } & WithCtx)
  | ({ name: 'RateLimited'; retryAfterSec: number; ready: boolean } & WithCtx)
  | ({ name: 'StartError' } & WithCtx)
  | ({ name: 'EidCallback'; status: string | null } & WithCtx)
  | ({ name: 'EidFailed'; reason: EidFailReason } & WithCtx)
  | ({ name: 'Verifying' } & WithCtx)
  | ({ name: 'VerifyError' } & WithCtx)
  | ({ name: 'OtherBrowser' } & WithCtx)
  | ({ name: 'Review'; view: RetryView; plansError: boolean; consentError: boolean } & WithCtx)
  | ({ name: 'Gate'; step: 'me' } & WithCtx)
  | ({ name: 'Gate'; step: 'order'; orderId: string } & WithCtx)
  | ({ name: 'Resume'; orderId: string } & WithCtx)
  | ({ name: 'CreatingOrder' } & WithCtx)
  | ({ name: 'PaymentReturn'; orderId: string | null; cancelledHint: boolean } & WithCtx)
  | ({
      name: 'Polling';
      orderId: string;
      stillConfirming: boolean;
      connectionIssue: boolean;
    } & WithCtx)
  | ({ name: 'Unconfirmed'; orderId: string } & WithCtx)
  | ({ name: 'IdentityLost'; orderId: string } & WithCtx)
  | ({ name: 'OrderNotFound'; orderId: string } & WithCtx)
  | ({ name: 'Confirmed'; orderId: string } & WithCtx)
  | ({ name: 'Account' } & WithCtx);

export type StateName = FlowState['name'];

export type FlowEvent =
  | { type: 'begin' } // state shown (load, reload, bfcache restore): run on-enter again (inv. 6)
  | { type: 'meLoaded'; me: Pick<MeResponse, 'activeSubscription'> }
  | { type: 'meFailed'; error: ApiError }
  | { type: 'select'; planId: string }
  | { type: 'sessionCreated'; redirectUrl: string }
  | { type: 'sessionFailed'; error: ApiError }
  | { type: 'countdownElapsed' }
  | { type: 'plansChecked'; planFound: boolean }
  | { type: 'plansFailed'; error: ApiError }
  | { type: 'retryPlans' }
  | { type: 'retryCheck' } // re-check the open order behind a disabled Pay (Q59)
  | { type: 'pay'; consent: boolean }
  | { type: 'tryAgain' }
  | { type: 'changePlan' }
  | { type: 'startAgain' }
  | { type: 'verify' }
  | { type: 'checkStatus' }
  | { type: 'checkAgain' }
  | { type: 'goToAccount' }
  | { type: 'backToPlans' }
  | { type: 'orderLoaded'; order: Pick<OrderResponse, 'status' | 'actionUrl'> }
  | { type: 'orderFailed'; error: ApiError }
  | { type: 'orderCreated'; orderId: string; paymentUrl: string }
  | { type: 'orderCreateFailed'; error: ApiError }
  | { type: 'stillConfirming' }
  | { type: 'pollTimeout' };

export type FlowEffect =
  | { type: 'fetchMe' }
  | { type: 'fetchPlans' }
  | { type: 'startEidSession'; planId: string | null }
  | { type: 'startCountdown'; seconds: number }
  | { type: 'replaceHistory' }
  | { type: 'fetchOrder'; orderId: string }
  | { type: 'createOrder'; planId: string }
  | { type: 'saveOpenOrder'; orderId: string; paymentUrl: string }
  | { type: 'clearOpenOrder' }
  | { type: 'redirect'; url: string }
  | { type: 'startPolling'; orderId: string }
  // `purchase` once per orderId, then clear open order and context (04 Confirmed).
  | { type: 'confirmOrder'; orderId: string }
  | { type: 'redirectToAccount' };

export type Transition = { state: FlowState; effects: FlowEffect[] };

const NOTICE_BY_FAILURE: Record<PaymentFailReason, Notice> = {
  cancelled: 'payment_cancelled',
  declined: 'payment_declined',
};

export function initialState(ctx: FlowContext): FlowState {
  return { name: 'Entry', ctx };
}

const stay = (state: FlowState): Transition => ({ state, effects: [] });

function enter(state: FlowState): Transition {
  const { ctx } = state;
  switch (state.name) {
    case 'Entry':
    case 'Verifying':
      return { state, effects: [{ type: 'fetchMe' }] };
    case 'StartingEid':
      return { state, effects: [{ type: 'startEidSession', planId: ctx.planId }] };
    case 'RateLimited':
      return { state, effects: [{ type: 'startCountdown', seconds: state.retryAfterSec }] };
    case 'EidCallback': {
      const next: FlowState =
        state.status === 'ok'
          ? { name: 'Verifying', ctx }
          : {
              name: 'EidFailed',
              ctx,
              reason: state.status === 'cancelled' ? 'cancelled' : 'expired',
            };
      const entered = enter(next);
      return { state: entered.state, effects: [{ type: 'replaceHistory' }, ...entered.effects] };
    }
    case 'Review':
      return { state, effects: [{ type: 'fetchPlans' }] };
    case 'Gate':
      return {
        state,
        effects:
          state.step === 'order'
            ? [{ type: 'fetchOrder', orderId: state.orderId }]
            : [{ type: 'fetchMe' }],
      };
    case 'CreatingOrder':
      return ctx.planId
        ? { state, effects: [{ type: 'createOrder', planId: ctx.planId }] }
        : enter(plans(ctx));
    case 'PaymentReturn':
      return state.orderId
        ? { state, effects: [{ type: 'fetchOrder', orderId: state.orderId }] }
        : enter(plans(ctx));
    case 'Polling':
      return { state, effects: [{ type: 'startPolling', orderId: state.orderId }] };
    case 'OrderNotFound':
      return { state, effects: [{ type: 'clearOpenOrder' }] };
    case 'Confirmed':
      return { state, effects: [{ type: 'confirmOrder', orderId: state.orderId }] };
    case 'Account':
      return { state, effects: [{ type: 'redirectToAccount' }] };
    default:
      return stay(state);
  }
}

function go(state: FlowState, before: FlowEffect[] = []): Transition {
  const entered = enter(state);
  return { state: entered.state, effects: [...before, ...entered.effects] };
}

const plans = (ctx: FlowContext, view: RetryView = {}): FlowState => ({ name: 'Plans', ctx, view });
const review = (ctx: FlowContext, view: RetryView = {}): FlowState => ({
  name: 'Review',
  ctx,
  view,
  plansError: false,
  consentError: false,
});
const startingEid = (ctx: FlowContext): Transition => go({ name: 'StartingEid', ctx });
const account = (ctx: FlowContext): Transition => go({ name: 'Account', ctx });

// Where failures land: Review, or Plans with the plan preselected when reviewStep is off (Q38).
const retryPoint = (ctx: FlowContext, view: RetryView, before: FlowEffect[] = []): Transition =>
  go(ctx.reviewStep ? review(ctx, view) : plans(ctx, view), before);

function gateState(ctx: FlowContext): FlowState {
  return ctx.openOrderId
    ? { name: 'Gate', ctx, step: 'order', orderId: ctx.openOrderId }
    : { name: 'Gate', ctx, step: 'me' };
}

// 04 PaymentFailed: clear the open order, land on the retry point with a notice.
const paymentFailed = (ctx: FlowContext, reason: PaymentFailReason): Transition =>
  retryPoint({ ...ctx, openOrderId: null }, { notice: NOTICE_BY_FAILURE[reason] }, [
    { type: 'clearOpenOrder' },
  ]);

// Every path into CreatingOrder passes the Gate (04 Gate).
const gate = (ctx: FlowContext): Transition => go(gateState({ ...ctx, conflictRetried: false }));

const gateAfterConflict = (ctx: FlowContext): Transition =>
  go(gateState({ ...ctx, conflictRetried: true }));

const afterIdentified = (ctx: FlowContext): Transition =>
  ctx.reviewStep ? go(review(ctx)) : gate(ctx);

const paymentReturn = (ctx: FlowContext, orderId: string, cancelledHint = false): Transition =>
  go({ name: 'PaymentReturn', ctx, orderId, cancelledHint });

type OrderOutcomeState = Extract<FlowState, { orderId: string }>;

// Shared exits of Polling and Unconfirmed (04).
function onPolledOrder(
  state: OrderOutcomeState & { name: 'Polling' | 'Unconfirmed' },
  event: FlowEvent,
): Transition {
  const { ctx, orderId } = state;
  if (event.type === 'orderLoaded') {
    switch (event.order.status) {
      case 'paid':
        return go({ name: 'Confirmed', ctx, orderId });
      case 'failed':
        return paymentFailed(ctx, 'declined');
      case 'requires_action':
        return event.order.actionUrl
          ? { state, effects: [{ type: 'redirect', url: event.order.actionUrl }] }
          : stay(state);
      case 'pending':
        return state.name === 'Polling' ? stay({ ...state, connectionIssue: false }) : stay(state);
    }
  }
  if (event.type === 'orderFailed') {
    switch (event.error.kind) {
      case 'unauthenticated':
        return go({ name: 'IdentityLost', ctx, orderId });
      case 'orderNotFound':
        return go({ name: 'OrderNotFound', ctx: { ...ctx, openOrderId: null }, orderId });
      case 'network':
      case 'server':
        return state.name === 'Polling' ? stay({ ...state, connectionIssue: true }) : stay(state);
      default:
        return stay(state);
    }
  }
  return stay(state);
}

export function reduce(state: FlowState, event: FlowEvent): Transition {
  const { ctx } = state;
  if (event.type === 'begin') return onBegin(state);

  switch (state.name) {
    case 'Entry':
      if (event.type === 'meLoaded') {
        const identified = { ...ctx, identified: true };
        return event.me.activeSubscription ? account(identified) : go(plans(identified));
      }
      if (event.type === 'meFailed') return go(plans({ ...ctx, identified: false }));
      return stay(state);

    case 'Plans':
      if (event.type === 'select') {
        const chosen = { ...ctx, planId: event.planId };
        if (!chosen.identified) return startingEid(chosen);
        return afterIdentified(chosen);
      }
      if (
        event.type === 'retryCheck' ||
        event.type === 'orderLoaded' ||
        event.type === 'orderFailed'
      )
        return onRetryCheck(state, event);
      // Plans is the retry point only when reviewStep is off (Q38).
      if (event.type === 'tryAgain' && !ctx.reviewStep && ctx.planId && !state.view.payDisabled)
        return gate(ctx);
      return stay(state);

    case 'StartingEid':
      if (event.type === 'sessionCreated')
        return { state, effects: [{ type: 'redirect', url: event.redirectUrl }] };
      if (event.type === 'sessionFailed')
        return event.error.kind === 'rateLimited'
          ? go({
              name: 'RateLimited',
              ctx,
              retryAfterSec: event.error.retryAfterSec ?? 30,
              ready: false,
            })
          : go({ name: 'StartError', ctx });
      return stay(state);

    case 'RateLimited':
      if (event.type === 'countdownElapsed') return stay({ ...state, ready: true });
      if (event.type === 'tryAgain' && state.ready) return startingEid(ctx);
      if (event.type === 'changePlan') return go(plans(ctx));
      return stay(state);

    case 'StartError':
    case 'EidFailed':
      if (event.type === 'tryAgain') return startingEid(ctx);
      if (event.type === 'changePlan') return go(plans(ctx));
      return stay(state);

    case 'EidCallback':
      return stay(state);

    case 'Verifying':
      if (event.type === 'meLoaded') {
        const identified = { ...ctx, identified: true };
        if (ctx.reverifyOrderId)
          return paymentReturn({ ...identified, reverifyOrderId: null }, ctx.reverifyOrderId);
        return event.me.activeSubscription ? account(identified) : afterIdentified(identified);
      }
      if (event.type === 'meFailed')
        return go(
          event.error.kind === 'unauthenticated'
            ? { name: 'OtherBrowser', ctx }
            : { name: 'VerifyError', ctx },
        );
      return stay(state);

    case 'VerifyError':
      if (event.type === 'tryAgain') return go({ name: 'Verifying', ctx });
      if (event.type === 'startAgain') return startingEid(ctx);
      return stay(state);

    case 'OtherBrowser':
      return event.type === 'startAgain' ? startingEid(ctx) : stay(state);

    case 'Review':
      if (event.type === 'plansChecked')
        return event.planFound
          ? stay({ ...state, plansError: false })
          : go(plans(ctx, { notice: 'plan_unavailable' }));
      if (event.type === 'plansFailed') return stay({ ...state, plansError: true });
      if (event.type === 'retryPlans') return go({ ...state, plansError: false });
      if (
        event.type === 'retryCheck' ||
        event.type === 'orderLoaded' ||
        event.type === 'orderFailed'
      )
        return onRetryCheck(state, event);
      if (event.type === 'changePlan') return go(plans(ctx));
      if (event.type === 'pay') {
        if (state.plansError || state.view.payDisabled) return stay(state);
        if (!event.consent) return stay({ ...state, consentError: true });
        return gate(ctx);
      }
      return stay(state);

    case 'Gate':
      return onGate(state, event);

    case 'Resume':
      return event.type === 'checkStatus' ? paymentReturn(ctx, state.orderId) : stay(state);

    case 'CreatingOrder':
      return onCreatingOrder(state, event);

    case 'PaymentReturn': {
      if (!state.orderId) return stay(state);
      if (event.type === 'orderFailed')
        return go({
          name: 'Polling',
          ctx,
          orderId: state.orderId,
          stillConfirming: false,
          connectionIssue: false,
        });
      if (event.type !== 'orderLoaded') return stay(state);
      const { orderId } = state;
      switch (event.order.status) {
        case 'paid':
          return go({ name: 'Confirmed', ctx, orderId });
        case 'failed':
          return paymentFailed(ctx, state.cancelledHint ? 'cancelled' : 'declined');
        default:
          return go({
            name: 'Polling',
            ctx,
            orderId,
            stillConfirming: false,
            connectionIssue: false,
          });
      }
    }

    case 'Polling':
      if (event.type === 'stillConfirming') return stay({ ...state, stillConfirming: true });
      if (event.type === 'pollTimeout')
        return go({ name: 'Unconfirmed', ctx, orderId: state.orderId });
      return onPolledOrder(state, event);

    case 'Unconfirmed':
      if (event.type === 'checkAgain')
        return { state, effects: [{ type: 'fetchOrder', orderId: state.orderId }] };
      if (event.type === 'goToAccount') return account(ctx);
      return onPolledOrder(state, event);

    case 'IdentityLost':
      return event.type === 'verify'
        ? startingEid({ ...ctx, reverifyOrderId: state.orderId })
        : stay(state);

    case 'OrderNotFound':
      if (event.type === 'backToPlans') return go(plans(ctx));
      if (event.type === 'goToAccount') return account(ctx);
      return stay(state);

    case 'Confirmed':
      return event.type === 'goToAccount' ? account(ctx) : stay(state);

    case 'Account':
      return stay(state);
  }
}

function onGate(state: Extract<FlowState, { name: 'Gate' }>, event: FlowEvent): Transition {
  const { ctx } = state;
  if (state.step === 'order') {
    const { orderId } = state;
    const continueToMe = (): Transition =>
      go({ name: 'Gate', ctx: { ...ctx, openOrderId: null }, step: 'me' }, [
        { type: 'clearOpenOrder' },
      ]);
    if (event.type === 'orderLoaded') {
      switch (event.order.status) {
        case 'pending':
        case 'requires_action':
          return go({ name: 'Resume', ctx, orderId });
        case 'paid':
          return go({ name: 'Confirmed', ctx, orderId });
        case 'failed':
          return continueToMe();
      }
    }
    if (event.type === 'orderFailed') {
      switch (event.error.kind) {
        case 'orderNotFound':
          return continueToMe();
        case 'unauthenticated':
          return go({ name: 'IdentityLost', ctx, orderId });
        default:
          return retryPoint(ctx, { errorKind: event.error.kind, payDisabled: true });
      }
    }
    return stay(state);
  }

  if (event.type === 'meLoaded') {
    if (event.me.activeSubscription) return account(ctx);
    // Second pass after a 409: no second POST (Q41).
    if (ctx.conflictRetried) return retryPoint(ctx, { errorKind: 'conflict' });
    return go({ name: 'CreatingOrder', ctx });
  }
  if (event.type === 'meFailed')
    return event.error.kind === 'unauthenticated'
      ? startingEid({ ...ctx, identified: false })
      : retryPoint(ctx, { errorKind: event.error.kind });
  return stay(state);
}

function onCreatingOrder(
  state: Extract<FlowState, { name: 'CreatingOrder' }>,
  event: FlowEvent,
): Transition {
  const { ctx } = state;
  if (event.type === 'orderCreated')
    return {
      state: { ...state, ctx: { ...ctx, openOrderId: event.orderId } },
      effects: [
        { type: 'saveOpenOrder', orderId: event.orderId, paymentUrl: event.paymentUrl },
        { type: 'redirect', url: event.paymentUrl },
      ],
    };
  if (event.type !== 'orderCreateFailed') return stay(state);
  switch (event.error.kind) {
    case 'unauthenticated':
      return startingEid({ ...ctx, identified: false });
    case 'alreadySubscribed':
      return account(ctx);
    case 'invalidPlan':
      return go(plans(ctx, { notice: 'plan_unavailable' }));
    case 'conflict':
      return gateAfterConflict(ctx);
    default:
      return retryPoint(ctx, { errorKind: event.error.kind });
  }
}

// Shown again: stale disabled flags and consent error are dropped (inv. 6). The cross-page notice stays.
function onBegin(state: FlowState): Transition {
  switch (state.name) {
    case 'Gate':
    case 'CreatingOrder':
      return stay(state);
    case 'Review':
      return enter({
        ...state,
        view: { notice: state.view.notice },
        plansError: false,
        consentError: false,
      });
    case 'Plans':
      return stay({ ...state, view: { notice: state.view.notice } });
    default:
      return enter(state);
  }
}

// Display check of the open order behind a disabled Pay (04 Gate step 1, Q59). Never creates an order.
function onRetryCheck(
  state: Extract<FlowState, { name: 'Plans' | 'Review' }>,
  event: FlowEvent,
): Transition {
  const { ctx } = state;
  const orderId = ctx.openOrderId;
  if (!state.view.payDisabled || !orderId) return stay(state);
  const payEnabled = (): Transition => ({
    state: {
      ...state,
      ctx: { ...ctx, openOrderId: null },
      view: { ...state.view, payDisabled: false, errorKind: undefined },
    },
    effects: [{ type: 'clearOpenOrder' }],
  });
  if (event.type === 'retryCheck') return { state, effects: [{ type: 'fetchOrder', orderId }] };
  if (event.type === 'orderLoaded') {
    switch (event.order.status) {
      case 'pending':
      case 'requires_action':
        return go({ name: 'Resume', ctx, orderId });
      case 'paid':
        return go({ name: 'Confirmed', ctx, orderId });
      case 'failed':
        return payEnabled();
    }
  }
  if (event.type === 'orderFailed') {
    switch (event.error.kind) {
      case 'orderNotFound':
        return payEnabled();
      case 'unauthenticated':
        return go({ name: 'IdentityLost', ctx, orderId });
      default:
        return stay({ ...state, view: { ...state.view, errorKind: event.error.kind } });
    }
  }
  return stay(state);
}
