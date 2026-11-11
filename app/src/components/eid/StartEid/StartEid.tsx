'use client';

import { useEffect, useRef, useState } from 'react';
import { trackThenRedirect } from '@/analytics/analytics/analytics';
import { isApiError, networkError } from '@/api/errors/errors';
import { createIdentitySession } from '@/api/identity/identity';
import { LiveRegion } from '@/components/LiveRegion/LiveRegion';
import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { EidMessages } from '@/components/eid/eidMessages/eidMessages';
import { planKeyFor } from '@/domain/plans/plans';
import { buildReturnUrl, saveStoredParams } from '@/flow/context/context';
import type { FlowContext, FlowEvent } from '@/flow/machine/machine';
import { sessionStore } from '@/flow/browserStorage/browserStorage';
import type { UtmSet } from '@/flow/utm/utm';

type Props = {
  ctx: FlowContext;
  utm: UtmSet;
  apiBase: string;
  messages: EidMessages;
  // Plans: navigate. Callback page: navigateReplace, so /auth/callback never stays in history.
  redirect: (url: string) => void;
  dispatch: (event: FlowEvent) => void;
};

// StartingEid on enter: one POST per mount. The redirect waits for the GTM callback, 300-500 ms (08).
export function StartEid({ ctx, utm, apiBase, messages, redirect, dispatch }: Props) {
  const [opening, setOpening] = useState(false);
  const started = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    if (started.current) return () => void (mounted.current = false);
    started.current = true;

    const params = {
      plan: ctx.planId ? (planKeyFor(ctx.planId) ?? null) : null,
      market: ctx.market,
      locale: ctx.locale,
      utm,
      orderId: ctx.reverifyOrderId,
    };
    saveStoredParams(sessionStore, params);
    const returnUrl = buildReturnUrl(window.location.origin, '/auth/callback', params);

    createIdentitySession(apiBase, returnUrl).then(
      ({ redirectUrl }) => {
        if (!mounted.current) return;
        setOpening(true);
        trackThenRedirect(
          'identity_started',
          {
            plan_id: ctx.planId ?? 'unknown',
            eid_purpose: ctx.reverifyOrderId ? 'reverify' : 'checkout',
          },
          () => redirect(redirectUrl),
        );
      },
      (error: unknown) => {
        if (mounted.current)
          dispatch({ type: 'sessionFailed', error: isApiError(error) ? error : networkError() });
      },
    );
    return () => {
      mounted.current = false;
    };
    // Mount = enter; props at mount time are the attempt's context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StepScreen title={messages['eid.starting.title']}>
      <LiveRegion text={opening ? messages['eid.opening'] : messages['eid.starting.status']} />
    </StepScreen>
  );
}
