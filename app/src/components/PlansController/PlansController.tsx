'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchMe } from '@/api/me/me';
import { fetchOrder } from '@/api/order/order';
import { setCommonSource, track } from '@/analytics/analytics/analytics';
import { PlansContext } from '@/components/PlansController/plansContext';
import { LiveRegion } from '@/components/LiveRegion/LiveRegion';
import { EidScreen, isEidState } from '@/components/eid/EidScreen/EidScreen';
import type { EidMessages } from '@/components/eid/eidMessages/eidMessages';
import { useEidRestore } from '@/components/eid/useEidRestore/useEidRestore';
import { useFocusHeadingOnStepChange } from '@/components/focus/focus';
import { Resume, RetryPoint } from '@/components/RetryPoint/RetryPoint';
import type { RetryMessages } from '@/components/RetryPoint/retryMessages/retryMessages';
import type { Pair } from '@/domain/markets/markets';
import { planIdFor } from '@/domain/plans/plans';
import { sessionStore } from '@/flow/browserStorage/browserStorage';
import { resolveFlowParams } from '@/flow/context/context';
import { RUN_GATE_PARAM, exitUrl } from '@/flow/exitUrl/exitUrl';
import { runGateEffect, type GateDeps } from '@/flow/gate/gate';
import type { FlowEffect, FlowEvent, RetryView } from '@/flow/machine/machine';
import { navigate } from '@/flow/navigate/navigate';
import { removeUrlParam } from '@/flow/notice/notice';
import { consumeRunGateToken } from '@/flow/runGateToken/runGateToken';
import { openOrder } from '@/flow/openOrder/openOrder';
import { createFlowStore } from '@/flow/store/store';
import { readUtm } from '@/flow/utm/utm';

export type PlansFlowStore = ReturnType<typeof createFlowStore>;

export type PlansControllerProps = {
  pair: Pair;
  reviewStep: boolean;
  accountUrl: string;
  apiBase: string;
  eidMessages: EidMessages;
  retryMessages: RetryMessages;
  // API plan id → card title, for the retry point's "selected plan".
  planTitles: Record<string, string>;
  store?: PlansFlowStore;
  children: ReactNode;
};

// Stored context beats the URL (inv. 2); the URL covers a return in another browser (Q7).
function chosenPlanId(): string | null {
  if (typeof window === 'undefined') return null;
  const plan = resolveFlowParams(sessionStore, window.location.search)?.plan;
  return plan ? (planIdFor(plan) ?? null) : null;
}

export function PlansController({
  pair,
  reviewStep,
  accountUrl,
  apiBase,
  eidMessages,
  retryMessages,
  planTitles,
  store: injectedStore,
  children,
}: PlansControllerProps) {
  const [store] = useState(
    () =>
      injectedStore ??
      createFlowStore({
        market: pair.market,
        locale: pair.locale,
        planId: chosenPlanId(),
        reviewStep,
        identified: false,
        openOrderId: null,
        reverifyOrderId: null,
        conflictRetried: false,
      }),
  );
  // Gate-triggering actions look at storage first: another tab may have created an order (Q37).
  const syncOpenOrder = (dispatch: (event: FlowEvent) => void) =>
    dispatch({ type: 'openOrderSynced', orderId: openOrder.read()?.orderId ?? null });
  const state = store((s) => s.state);
  const eidActive = isEidState(state);
  const resumeActive = state.name === 'Resume';
  useEidRestore(store, 'plans');
  // Plans -> eID or Resume screens is a step change; Entry -> Plans is not.
  useFocusHeadingOnStepChange(eidActive || resumeActive ? state.name : 'plans');
  const [trialEligible, setTrialEligible] = useState<boolean | null>(null);
  // A click while Entry is still checking /v1/me waits for Plans (Q65).
  const heldPlanId = useRef<string | null>(null);
  // `rungate=1` (Q68): run the Gate on reaching Plans. Not a user select, so no plan_selected (07).
  const gateIntentPlanId = useRef<string | null>(null);
  // The Gate replaces Plans for a moment; the retry point keeps its banner meanwhile.
  const [lastPlansView, setLastPlansView] = useState<RetryView>({});
  if (state.name === 'Plans' && state.view !== lastPlansView) setLastPlansView(state.view);

  const selectNow = (planId: string, tracked = true) => {
    if (store.getState().state.name !== 'Plans') return;
    if (tracked) track('plan_selected', { plan_id: planId });
    const { dispatch } = store.getState();
    syncOpenOrder(dispatch);
    dispatch({ type: 'select', planId });
  };

  useEffect(() => {
    setCommonSource(() => ({
      market: pair.market,
      locale: pair.locale,
      reviewStep,
      utm: readUtm(new URLSearchParams(window.location.search)),
    }));
    const abort = new AbortController();
    const { dispatch } = store.getState();

    const gateDeps: GateDeps = {
      getMe: async (signal) => {
        const me = await fetchMe(apiBase, signal);
        if (!signal.aborted) setTrialEligible(me.trialEligible);
        return me;
      },
      getOrder: (orderId, signal) => fetchOrder(apiBase, orderId, signal),
      clearOpenOrder: () => openOrder.clear(),
    };
    const run = (effect: FlowEffect) => {
      if (effect.type === 'redirectToAccount') navigate(accountUrl);
      runGateEffect(effect, dispatch, abort.signal, gateDeps);
    };

    const unsubscribe = store.subscribe((next, previous) => {
      if (next.state.name === 'Plans' && previous.state.name === 'Entry') {
        track('plan_viewed', { identified: next.state.ctx.identified });
        const held = heldPlanId.current;
        heldPlanId.current = null;
        if (held) selectNow(held);
        const gateIntent = gateIntentPlanId.current;
        gateIntentPlanId.current = null;
        if (gateIntent) selectNow(gateIntent, false);
      }
      // Identified select with reviewStep on: Review is its own route (04 Plans exits).
      if (next.state.name === 'Review' && previous.state.name === 'Plans') {
        const target = exitUrl(
          next.state,
          readUtm(new URLSearchParams(window.location.search)),
          accountUrl,
          window.location.origin,
        );
        if (target) navigate(target);
      }
      if (next.effects !== previous.effects) next.effects.forEach(run);
    });
    // Back from /review/ restores Plans frozen in Review: show Plans again (inv. 6).
    const onPageShow = (event: PageTransitionEvent) => {
      const { state: current } = store.getState();
      if (event.persisted && current.name === 'Review')
        store.setState({ state: { name: 'Plans', ctx: current.ctx, view: {} }, effects: [] });
    };
    window.addEventListener('pageshow', onPageShow);
    dispatch({ type: 'begin' });
    // One-time marker from the callback (Q68): run the Gate for the URL plan only when this tab's
    // callback issued a token for it, so a crafted link can't create an order (inv. 1).
    const query = new URLSearchParams(window.location.search);
    const planKey = query.get('plan');
    const tokenValid = consumeRunGateToken(sessionStore, planKey);
    if (query.get(RUN_GATE_PARAM) === '1') {
      const planId = planIdFor(planKey ?? '');
      if (!reviewStep && tokenValid && planId) gateIntentPlanId.current = planId;
      removeUrlParam(RUN_GATE_PARAM);
    }
    return () => {
      abort.abort();
      unsubscribe();
      window.removeEventListener('pageshow', onPageShow);
    };
    // selectNow only reads the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, pair, reviewStep, accountUrl, apiBase]);

  const select = (planId: string) => {
    if (store.getState().state.name === 'Entry') heldPlanId.current = planId;
    else selectNow(planId);
  };

  const trialHidden = state.ctx.identified && trialEligible === false;
  const { dispatch: send } = store.getState();

  const screen = () => {
    if (eidActive)
      return (
        <EidScreen
          state={state}
          dispatch={send}
          messages={eidMessages}
          utm={readUtm(new URLSearchParams(window.location.search))}
          apiBase={apiBase}
          redirect={navigate}
        />
      );
    if (state.name === 'Resume')
      return (
        <Resume messages={retryMessages} onCheckStatus={() => send({ type: 'checkStatus' })} />
      );
    return (
      <>
        {(state.name === 'Plans' || state.name === 'Gate') && (
          <RetryPoint
            messages={retryMessages}
            view={state.name === 'Plans' ? state.view : lastPlansView}
            planTitle={state.ctx.planId ? (planTitles[state.ctx.planId] ?? null) : null}
            canRetry={!reviewStep && Boolean(state.ctx.planId)}
            busy={state.name === 'Gate'}
            onTryAgain={() => {
              syncOpenOrder(send);
              send({ type: 'tryAgain' });
            }}
            onCheckAgain={() => send({ type: 'retryCheck' })}
          />
        )}
        <LiveRegion text={state.name === 'Gate' ? retryMessages['retry.busy'] : ''} />
        {children}
      </>
    );
  };

  return <PlansContext.Provider value={{ trialHidden, select }}>{screen()}</PlansContext.Provider>;
}
