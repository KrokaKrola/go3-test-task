'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { setCommonSource, track } from '@/analytics/analytics/analytics';
import { isApiError, networkError } from '@/api/errors/errors';
import { fetchMe } from '@/api/me/me';
import { useEidRestore } from '@/components/eid/useEidRestore/useEidRestore';
import { useFocusHeadingOnStepChange } from '@/components/focus/focus';
import { EidScreen, isEidState } from '@/components/eid/EidScreen/EidScreen';
import { Verifying } from '@/components/eid/Verifying/Verifying';
import { pickEidMessages, type EidMessages } from '@/components/eid/eidMessages/eidMessages';
import { resolveFlowParams, saveStoredParams, type FlowParams } from '@/flow/context/context';
import { sessionStore } from '@/flow/browserStorage/browserStorage';
import { callbackContext } from '@/flow/callbackContext/callbackContext';
import { exitUrl } from '@/flow/exitUrl/exitUrl';
import type { FlowEffect } from '@/flow/machine/machine';
import { navigateReplace } from '@/flow/navigate/navigate';
import { createFlowStore } from '@/flow/store/store';
import { getMessages } from '@/i18n/messages/messages';

type Props = { apiBase: string; accountUrl: string; reviewStep: boolean };
type Boot = {
  store: ReturnType<typeof createFlowStore>;
  params: FlowParams;
  messages: EidMessages;
};

// 04 EidCallback: market, locale and plan come from stored context, else the URL (Q7, Q61).
export function AuthCallback(props: Props) {
  const [boot, setBoot] = useState<Boot | null>(null);

  // Layout effect: <html lang> is set before the first text is committed.
  useLayoutEffect(() => {
    const params = resolveFlowParams(sessionStore, window.location.search);
    if (!params) {
      navigateReplace('/'); // no usable context: let the root pick a language (Q68)
      return;
    }
    document.documentElement.lang = params.locale;
    const ctx = callbackContext(params, props.reviewStep);
    const status = new URLSearchParams(window.location.search).get('status');
    // Browser-only context, so it can't be read during the (static) first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoot({
      store: createFlowStore(ctx, { name: 'EidCallback', ctx, status }),
      params,
      messages: pickEidMessages(getMessages(params.locale)),
    });
  }, [props.reviewStep]);

  return boot ? <CallbackFlow {...props} {...boot} /> : <main />;
}

function CallbackFlow({ apiBase, accountUrl, store, params, messages }: Props & Boot) {
  const state = store((s) => s.state);
  useFocusHeadingOnStepChange(state.name);
  useEidRestore(store, 'failed');

  useEffect(() => {
    saveStoredParams(sessionStore, params);
    setCommonSource(() => ({
      market: params.market,
      locale: params.locale,
      reviewStep: store.getState().state.ctx.reviewStep,
      utm: params.utm,
    }));
    const abort = new AbortController();
    const { dispatch } = store.getState();

    const run = (effect: FlowEffect) => {
      if (effect.type === 'replaceHistory') {
        // Drop only `status`: a reload keeps UTMs and context.
        const query = new URLSearchParams(window.location.search);
        query.delete('status');
        const search = query.size ? `?${query}` : '';
        window.history.replaceState(null, '', window.location.pathname + search);
      }
      if (effect.type !== 'fetchMe') return;
      fetchMe(apiBase, abort.signal).then(
        (me) => {
          if (abort.signal.aborted) return;
          const { ctx } = store.getState().state;
          // Only /v1/me proves the eID succeeded (07).
          track('identity_completed', {
            plan_id: ctx.planId ?? 'unknown',
            eid_purpose: ctx.reverifyOrderId ? 'reverify' : 'checkout',
          });
          dispatch({ type: 'meLoaded', me });
        },
        (error: unknown) => {
          if (!abort.signal.aborted)
            dispatch({ type: 'meFailed', error: isApiError(error) ? error : networkError() });
        },
      );
    };

    const unsubscribe = store.subscribe((next, previous) => {
      const target = exitUrl(next.state, params.utm, accountUrl, window.location.origin);
      if (target) {
        if (next.state !== previous.state) navigateReplace(target);
        return;
      }
      if (next.effects !== previous.effects) next.effects.forEach(run);
    });
    dispatch({ type: 'begin' });
    return () => {
      abort.abort();
      unsubscribe();
    };
  }, [store, params, apiBase, accountUrl]);

  return isEidState(state) ? (
    <EidScreen
      state={state}
      dispatch={store.getState().dispatch}
      messages={messages}
      utm={params.utm}
      apiBase={apiBase}
      redirect={navigateReplace}
    />
  ) : (
    <Verifying messages={messages} />
  );
}
