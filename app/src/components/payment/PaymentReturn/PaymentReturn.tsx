'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { purchaseSent, setCommonSource, track } from '@/analytics/analytics/analytics';
import { getPlans } from '@/api/client/client';
import { fetchOrder } from '@/api/order/order';
import { Confirmed } from '@/components/payment/Confirmed/Confirmed';
import { IdentityLost } from '@/components/payment/IdentityLost/IdentityLost';
import { OrderNotFound } from '@/components/payment/OrderNotFound/OrderNotFound';
import {
  pickPaymentMessages,
  type PaymentMessages,
} from '@/components/payment/paymentMessages/paymentMessages';
import { Polling } from '@/components/payment/Polling/Polling';
import { Unconfirmed } from '@/components/payment/Unconfirmed/Unconfirmed';
import { EidScreen, isEidState } from '@/components/eid/EidScreen/EidScreen';
import { pickEidMessages, type EidMessages } from '@/components/eid/eidMessages/eidMessages';
import { useEidRestore } from '@/components/eid/useEidRestore/useEidRestore';
import { useFocusHeadingOnStepChange } from '@/components/focus/focus';
import { planIdFor } from '@/domain/plans/plans';
import { sessionStore } from '@/flow/browserStorage/browserStorage';
import { clearStoredParams, resolveFlowParams, type FlowParams } from '@/flow/context/context';
import { confirmOrder } from '@/flow/confirmOrder/confirmOrder';
import { exitUrl } from '@/flow/exitUrl/exitUrl';
import { runGateEffect, type GateDeps } from '@/flow/gate/gate';
import type { FlowContext, FlowEffect, FlowState } from '@/flow/machine/machine';
import { navigate, navigateReplace } from '@/flow/navigate/navigate';
import { openOrder, type OpenOrder } from '@/flow/openOrder/openOrder';
import { startOrderPoller } from '@/flow/orderPoller/orderPoller';
import { createFlowStore } from '@/flow/store/store';
import { getMessages } from '@/i18n/messages/messages';

type Props = {
  apiBase: string;
  accountUrl: string;
  reviewStep: boolean;
  // `${market}/${locale}` → API plan id → CMS card title.
  planTitles: Record<string, Record<string, string>>;
};

type Boot = {
  store: ReturnType<typeof createFlowStore>;
  params: FlowParams;
  capturedOrder: OpenOrder | null;
  paymentMessages: PaymentMessages;
  eidMessages: EidMessages;
};

// States that leave this page. The rest render here (Confirmed and IdentityLost are ours).
const EXIT_STATES: readonly FlowState['name'][] = ['Plans', 'Review', 'Account'];

// 04 PaymentReturn: orderId from the open order, else stored context, else the URL (inv. 2).
export function PaymentReturn(props: Props) {
  const [boot, setBoot] = useState<Boot | null>(null);

  // Layout effect: <html lang> is set before the first text is committed.
  useLayoutEffect(() => {
    const params = resolveFlowParams(sessionStore, window.location.search);
    if (!params) {
      navigateReplace('/'); // no usable context: let the root pick a language (Q68)
      return;
    }
    document.documentElement.lang = params.locale;
    const capturedOrder = openOrder.read();
    const orderId = capturedOrder?.orderId ?? params.orderId;
    const ctx: FlowContext = {
      market: params.market,
      locale: params.locale,
      planId: params.plan ? (planIdFor(params.plan) ?? null) : (capturedOrder?.planId ?? null),
      reviewStep: props.reviewStep,
      identified: false,
      openOrderId: capturedOrder?.orderId ?? null,
      reverifyOrderId: null,
      conflictRetried: false,
    };
    const cancelledHint = new URLSearchParams(window.location.search).get('cancelled') === '1';
    const messages = getMessages(params.locale);
    // Browser-only context, so it can't be read during the (static) first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoot({
      store: createFlowStore(ctx, { name: 'PaymentReturn', ctx, orderId, cancelledHint }),
      params,
      capturedOrder,
      paymentMessages: pickPaymentMessages(messages),
      eidMessages: pickEidMessages(messages),
    });
  }, [props.reviewStep]);

  return boot ? <PaymentFlow {...props} {...boot} /> : <main />;
}

function PaymentFlow({
  apiBase,
  accountUrl,
  planTitles,
  store,
  params,
  capturedOrder,
  paymentMessages,
  eidMessages,
}: Props & Boot) {
  const state = store((s) => s.state);
  useFocusHeadingOnStepChange(
    state.name === 'PaymentReturn' || state.name === 'Polling' ? 'polling' : state.name,
  );
  useEidRestore(store, 'failed');
  const [orderPlanId, setOrderPlanId] = useState<string | null>(null);
  const orderPlanIdRef = useRef<string | null>(null);

  useEffect(() => {
    setCommonSource(() => ({
      market: params.market,
      locale: params.locale,
      reviewStep: store.getState().state.ctx.reviewStep,
      utm: params.utm,
    }));
    const { dispatch } = store.getState();
    const abort = new AbortController();
    let stopPoller = () => {};
    let redirectedThisCycle = false;

    const getOrder = (orderId: string, signal: AbortSignal) =>
      fetchOrder(apiBase, orderId, signal).then((order) => {
        orderPlanIdRef.current = order.planId;
        setOrderPlanId(order.planId);
        return order;
      });
    const gateDeps: GateDeps = {
      getMe: () => Promise.reject(new Error('unreachable: no /v1/me on the payment return page')),
      getOrder,
      clearOpenOrder: () => openOrder.clear(),
    };

    const run = (effect: FlowEffect) => {
      // "Check again" starts a new cycle.
      if (effect.type === 'fetchOrder' && store.getState().state.name === 'Unconfirmed')
        redirectedThisCycle = false;
      if (runGateEffect(effect, dispatch, abort.signal, gateDeps)) return;
      switch (effect.type) {
        case 'startPolling':
          redirectedThisCycle = false;
          stopPoller();
          stopPoller = startOrderPoller({
            getOrder: (signal) => getOrder(effect.orderId, signal),
            onOrder: (order) => dispatch({ type: 'orderLoaded', order }),
            onError: (error) => dispatch({ type: 'orderFailed', error }),
            onStillConfirming: () => dispatch({ type: 'stillConfirming' }),
            onTimeout: () => dispatch({ type: 'pollTimeout' }),
          });
          return;
        case 'redirect':
          // Once per poll cycle: a pending challenge must not be reopened every 2 s.
          if (redirectedThisCycle) return;
          redirectedThisCycle = true;
          navigate(effect.url);
          return;
        case 'confirmOrder':
          void confirmOrder({
            orderId: effect.orderId,
            market: store.getState().state.ctx.market,
            openOrder: capturedOrder,
            orderPlanId: orderPlanIdRef.current,
            getPlans: (market) => getPlans(market, abort.signal),
            purchaseSent,
            trackPurchase: (purchase) => track('purchase', purchase),
            clearOpenOrder: () => openOrder.clear(),
            clearContext: () => clearStoredParams(sessionStore),
          });
          return;
        default:
          return;
      }
    };

    const unsubscribe = store.subscribe((next, previous) => {
      if (next.state !== previous.state) {
        if (next.state.name !== 'Polling') stopPoller();
        if (EXIT_STATES.includes(next.state.name)) {
          // The exit skips the target's own effects, but a failed payment must still clear the order.
          next.effects.filter((e) => e.type === 'clearOpenOrder').forEach(run);
          const target = exitUrl(next.state, params.utm, accountUrl, window.location.origin);
          if (target) {
            navigateReplace(target);
            return;
          }
        }
      }
      if (next.effects !== previous.effects) next.effects.forEach(run);
    });
    dispatch({ type: 'begin' });
    return () => {
      abort.abort();
      stopPoller();
      unsubscribe();
    };
  }, [store, params, apiBase, accountUrl, capturedOrder]);

  const send = store.getState().dispatch;

  if (isEidState(state))
    return (
      <EidScreen
        state={state}
        dispatch={send}
        messages={eidMessages}
        utm={params.utm}
        apiBase={apiBase}
        redirect={navigate}
      />
    );

  switch (state.name) {
    case 'Confirmed': {
      const ownOrder = capturedOrder?.orderId === state.orderId ? capturedOrder : null;
      const planId = ownOrder?.planId ?? orderPlanId;
      return (
        <Confirmed
          messages={paymentMessages}
          orderId={state.orderId}
          planTitle={
            planId
              ? (planTitles[`${state.ctx.market}/${state.ctx.locale}`]?.[planId] ?? planId)
              : null
          }
          showTrialNote={ownOrder?.snapshot.trial === 'true'}
          onGoToAccount={() => send({ type: 'goToAccount' })}
        />
      );
    }
    case 'Unconfirmed':
      return (
        <Unconfirmed
          messages={paymentMessages}
          orderId={state.orderId}
          onCheckAgain={() => send({ type: 'checkAgain' })}
          onGoToAccount={() => send({ type: 'goToAccount' })}
        />
      );
    case 'IdentityLost':
      return (
        <IdentityLost
          messages={paymentMessages}
          orderId={state.orderId}
          onVerify={() => send({ type: 'verify' })}
        />
      );
    case 'OrderNotFound':
      return (
        <OrderNotFound
          messages={paymentMessages}
          orderId={state.orderId}
          onBackToPlans={() => send({ type: 'backToPlans' })}
          onGoToAccount={() => send({ type: 'goToAccount' })}
        />
      );
    default:
      // PaymentReturn's one GET, Polling, and the moment before an exit.
      return (
        <Polling
          messages={paymentMessages}
          stillConfirming={state.name === 'Polling' && state.stillConfirming}
          connectionIssue={state.name === 'Polling' && state.connectionIssue}
        />
      );
  }
}
