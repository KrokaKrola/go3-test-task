'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchMe } from '@/api/me/me';
import type { ApiError } from '@/api/errors/errors';
import { setCommonSource, track } from '@/analytics/analytics/analytics';
import { PlansContext } from '@/components/PlansController/plansContext';
import { EidScreen, isEidState } from '@/components/eid/EidScreen/EidScreen';
import type { EidMessages } from '@/components/eid/eidMessages/eidMessages';
import { useEidRestore } from '@/components/eid/useEidRestore/useEidRestore';
import { useFocusHeadingOnStepChange } from '@/components/focus/focus';
import type { Pair } from '@/domain/markets/markets';
import type { FlowEffect } from '@/flow/machine/machine';
import { navigate } from '@/flow/navigate/navigate';
import { createFlowStore } from '@/flow/store/store';
import { readUtm } from '@/flow/utm/utm';

export type PlansFlowStore = ReturnType<typeof createFlowStore>;

export type PlansControllerProps = {
  pair: Pair;
  reviewStep: boolean;
  accountUrl: string;
  apiBase: string;
  eidMessages: EidMessages;
  store?: PlansFlowStore;
  children: ReactNode;
};

export function PlansController({
  pair,
  reviewStep,
  accountUrl,
  apiBase,
  eidMessages,
  store: injectedStore,
  children,
}: PlansControllerProps) {
  const [store] = useState(
    () =>
      injectedStore ??
      createFlowStore({
        market: pair.market,
        locale: pair.locale,
        planId: null,
        reviewStep,
        identified: false,
        openOrderId: null,
        reverifyOrderId: null,
        conflictRetried: false,
      }),
  );
  const state = store((s) => s.state);
  const eidActive = isEidState(state);
  useEidRestore(store, 'plans');
  // Plans -> eID screens is a step change; Entry -> Plans is not.
  useFocusHeadingOnStepChange(eidActive ? state.name : 'plans');
  const [trialEligible, setTrialEligible] = useState<boolean | null>(null);
  // A click while Entry is still checking /v1/me waits for Plans (Q65).
  const heldPlanId = useRef<string | null>(null);

  const selectNow = (planId: string) => {
    if (store.getState().state.name !== 'Plans') return;
    track('plan_selected', { plan_id: planId });
    store.getState().dispatch({ type: 'select', planId });
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

    const run = (effect: FlowEffect) => {
      if (effect.type === 'redirectToAccount') navigate(accountUrl);
      if (effect.type !== 'fetchMe') return;
      fetchMe(apiBase, abort.signal).then(
        (me) => {
          if (abort.signal.aborted) return;
          setTrialEligible(me.trialEligible);
          dispatch({ type: 'meLoaded', me });
        },
        (error: ApiError) => {
          if (!abort.signal.aborted) dispatch({ type: 'meFailed', error });
        },
      );
    };

    const unsubscribe = store.subscribe((next, previous) => {
      if (next.state.name === 'Plans' && previous.state.name === 'Entry') {
        track('plan_viewed', { identified: next.state.ctx.identified });
        const held = heldPlanId.current;
        heldPlanId.current = null;
        if (held) selectNow(held);
      }
      if (next.effects !== previous.effects) next.effects.forEach(run);
    });
    dispatch({ type: 'begin' });
    return () => {
      abort.abort();
      unsubscribe();
    };
    // selectNow only reads the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, pair, reviewStep, accountUrl, apiBase]);

  const select = (planId: string) => {
    if (store.getState().state.name === 'Entry') heldPlanId.current = planId;
    else selectNow(planId);
  };

  const trialHidden = state.ctx.identified && trialEligible === false;

  return (
    <PlansContext.Provider value={{ trialHidden, select }}>
      {eidActive ? (
        <EidScreen
          state={state}
          dispatch={store.getState().dispatch}
          messages={eidMessages}
          utm={readUtm(new URLSearchParams(window.location.search))}
          apiBase={apiBase}
          redirect={navigate}
        />
      ) : (
        children
      )}
    </PlansContext.Provider>
  );
}
