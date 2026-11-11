'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { setCommonSource } from '@/analytics/analytics/analytics';
import { getPlans } from '@/api/client/client';
import { isApiError, networkError } from '@/api/errors/errors';
import { fetchMe } from '@/api/me/me';
import { fetchOrder } from '@/api/order/order';
import { LiveRegion } from '@/components/LiveRegion/LiveRegion';
import { Resume, RetryPoint } from '@/components/RetryPoint/RetryPoint';
import type { RetryMessages } from '@/components/RetryPoint/retryMessages/retryMessages';
import { EidScreen, isEidState } from '@/components/eid/EidScreen/EidScreen';
import type { EidMessages } from '@/components/eid/eidMessages/eidMessages';
import { useEidRestore } from '@/components/eid/useEidRestore/useEidRestore';
import { focusHeading, useFocusHeadingOnStepChange } from '@/components/focus/focus';
import type { ReviewMessages } from '@/components/review/reviewMessages/reviewMessages';
import { brandName } from '@/brand';
import type { Pair } from '@/domain/markets/markets';
import { formatMoney, grossCents } from '@/domain/money/money';
import { hasTrial, planIdFor, planKeyFor } from '@/domain/plans/plans';
import { sessionStore } from '@/flow/browserStorage/browserStorage';
import { resolveFlowParams } from '@/flow/context/context';
import {
  buildOrderSnapshot,
  createOrderRunner,
  type ReviewPlan,
} from '@/flow/createOrder/createOrder';
import { exitUrl } from '@/flow/exitUrl/exitUrl';
import { runGateEffect, type GateDeps } from '@/flow/gate/gate';
import type { FlowContext, FlowEffect, FlowState, RetryView } from '@/flow/machine/machine';
import { navigate } from '@/flow/navigate/navigate';
import { openOrder } from '@/flow/openOrder/openOrder';
import { createFlowStore } from '@/flow/store/store';
import type { UtmSet } from '@/flow/utm/utm';
import styles from './Review.module.css';

export type ReviewProps = {
  pair: Pair;
  accountUrl: string;
  apiBase: string;
  messages: ReviewMessages;
  eidMessages: EidMessages;
  retryMessages: RetryMessages;
  legalText: string[];
  // API plan id → CMS card title.
  planTitles: Record<string, string>;
};

type Boot = { store: ReturnType<typeof createFlowStore>; utm: UtmSet };

const reviewState = (ctx: FlowContext): FlowState => ({
  name: 'Review',
  ctx,
  view: {},
  plansError: false,
  consentError: false,
});

// States that leave this page. Review itself is never an exit target.
const EXIT_STATES: readonly FlowState['name'][] = [
  'Plans',
  'Account',
  'PaymentReturn',
  'Confirmed',
  'IdentityLost',
];

export function Review(props: ReviewProps) {
  const [boot, setBoot] = useState<Boot | null>(null);

  // Layout effect: stored context is browser-only and <html lang> must not flicker.
  useLayoutEffect(() => {
    const params = resolveFlowParams(sessionStore, window.location.search);
    const planKey = params?.plan ?? null;
    const ctx: FlowContext = {
      market: props.pair.market,
      locale: props.pair.locale,
      planId: planKey ? (planIdFor(planKey) ?? null) : null,
      reviewStep: true,
      identified: true,
      openOrderId: openOrder.read()?.orderId ?? null,
      reverifyOrderId: null,
      conflictRetried: false,
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoot({ store: createFlowStore(ctx, reviewState(ctx)), utm: params?.utm ?? {} });
  }, [props.pair]);

  return boot ? <ReviewFlow {...props} {...boot} /> : <main />;
}

function ReviewFlow({
  pair,
  accountUrl,
  apiBase,
  messages,
  eidMessages,
  retryMessages,
  legalText,
  planTitles,
  store,
  utm,
}: ReviewProps & Boot) {
  const state = store((s) => s.state);
  const eidActive = isEidState(state);
  const resumeActive = state.name === 'Resume';
  useEidRestore(store, 'plans');
  useFocusHeadingOnStepChange(eidActive || resumeActive ? state.name : 'review');

  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [trialEligible, setTrialEligible] = useState(false);
  const [consent, setConsent] = useState(false);
  // What Review shows is what Pay snapshots: the refs mirror the latest values for the runner.
  const planRef = useRef<ReviewPlan | null>(null);
  const trialRef = useRef(false);
  const consentRef = useRef<HTMLInputElement>(null);
  const payRef = useRef<HTMLButtonElement>(null);
  const plansBannerRef = useRef<HTMLDivElement>(null);
  // Retry buttons stay mounted while their request runs, so focus is never dropped (08).
  const [fetching, setFetching] = useState(false);
  const [retryingPlans, setRetryingPlans] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const focusHeadingAfterRetry = useRef(false);
  const plansError = state.name === 'Review' && state.plansError;
  const consentErrorId = useId();
  // The Gate replaces Review for a moment; the banner keeps its content meanwhile.
  const [lastView, setLastView] = useState<RetryView>({});
  if (state.name === 'Review' && state.view !== lastView) setLastView(state.view);

  useEffect(() => {
    if (fetching) return;
    if (plansError) plansBannerRef.current?.focus();
    else if (focusHeadingAfterRetry.current) focusHeading();
    focusHeadingAfterRetry.current = false;
  }, [fetching, plansError]);

  const title = messages['review.title'];
  useEffect(() => {
    document.title = `${title} · ${brandName}`;
  }, [title]);

  useEffect(() => {
    setCommonSource(() => ({
      market: pair.market,
      locale: pair.locale,
      reviewStep: true,
      utm,
    }));
    const abort = new AbortController();
    const { dispatch } = store.getState();

    const loadTrialEligibility = () =>
      fetchMe(apiBase, abort.signal).then(
        (me) => {
          if (abort.signal.aborted) return;
          trialRef.current = me.trialEligible;
          setTrialEligible(me.trialEligible);
        },
        () => {
          // No trial claim without proof; Pay's Gate handles 401 and failures.
          trialRef.current = false;
          if (!abort.signal.aborted) setTrialEligible(false);
        },
      );

    const gateDeps: GateDeps = {
      getMe: (signal) => fetchMe(apiBase, signal),
      getOrder: (orderId, signal) => fetchOrder(apiBase, orderId, signal),
      clearOpenOrder: () => openOrder.clear(),
    };
    const runOrder = createOrderRunner({
      attempt: () => {
        const current = planRef.current;
        if (!current) throw new Error('unreachable: Pay stays disabled until the plan is loaded');
        return {
          ctx: store.getState().state.ctx,
          utm,
          snapshot: buildOrderSnapshot(current, trialRef.current),
        };
      },
      origin: window.location.origin,
      saveOpenOrder: (order) => openOrder.save(order),
      navigate,
    });
    const run = (effect: FlowEffect) => {
      if (effect.type === 'fetchPlans') {
        setFetching(true);
        getPlans(pair.market, abort.signal).then(
          ({ plans }) => {
            if (abort.signal.aborted) return;
            setFetching(false);
            setRetryingPlans(false);
            const found = plans.find((p) => p.id === store.getState().state.ctx.planId) ?? null;
            planRef.current = found;
            setPlan(found);
            dispatch({ type: 'plansChecked', planFound: found !== null });
          },
          (error: unknown) => {
            if (abort.signal.aborted) return;
            setFetching(false);
            setRetryingPlans(false);
            dispatch({ type: 'plansFailed', error: isApiError(error) ? error : networkError() });
          },
        );
        return;
      }
      if (runGateEffect(effect, dispatch, abort.signal, gateDeps)) return;
      runOrder(effect, dispatch);
    };

    const unsubscribe = store.subscribe((next, previous) => {
      if (next.state !== previous.state) {
        if (checkingRef.current) {
          checkingRef.current = false;
          setChecking(false);
          const stillDisabled = next.state.name === 'Review' && next.state.view.payDisabled;
          if (!stillDisabled) payRef.current?.focus();
        }
        if (next.state.name === 'Review' && previous.state.name !== 'Review') setConsent(false);
        const target = EXIT_STATES.includes(next.state.name)
          ? exitUrl(next.state, utm, accountUrl, window.location.origin)
          : null;
        if (target) {
          navigate(target);
          return;
        }
      }
      if (next.effects !== previous.effects) next.effects.forEach(run);
    });

    // Inv. 6: a bfcache restore (Back from payment) shows a fresh Review, Pay enabled, box unchecked.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      const { state: current } = store.getState();
      setConsent(false);
      if (current.name === 'Review') {
        dispatch({ type: 'begin' });
      } else if (!isEidState(current)) {
        const ctx = { ...current.ctx, openOrderId: openOrder.read()?.orderId ?? null };
        store.setState({ state: reviewState(ctx), effects: [] });
        dispatch({ type: 'begin' });
      }
      void loadTrialEligibility();
    };
    window.addEventListener('pageshow', onPageShow);

    dispatch({ type: 'begin' });
    void loadTrialEligibility();
    return () => {
      abort.abort();
      unsubscribe();
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [store, pair, apiBase, accountUrl, utm]);

  const send = store.getState().dispatch;

  if (eidActive)
    return (
      <EidScreen
        state={state}
        dispatch={send}
        messages={eidMessages}
        utm={utm}
        apiBase={apiBase}
        redirect={navigate}
      />
    );
  if (resumeActive)
    return <Resume messages={retryMessages} onCheckStatus={() => send({ type: 'checkStatus' })} />;

  const review = state.name === 'Review' ? state : null;
  const view = review ? review.view : lastView;
  const busy = !review;
  const consentError = (review?.consentError ?? false) && !consent;
  const payUnavailable = busy || plansError || !plan || Boolean(view.payDisabled);
  const planKey = state.ctx.planId ? planKeyFor(state.ctx.planId) : undefined;
  const showTrial = Boolean(planKey && hasTrial(planKey, trialEligible));

  const pay = () => {
    // Read the store, not the render: the second click of a double tap sees the Gate already running.
    if (store.getState().state.name !== 'Review') return;
    if (payUnavailable) return;
    send({ type: 'openOrderSynced', orderId: openOrder.read()?.orderId ?? null });
    send({ type: 'pay', consent });
    const after = store.getState().state;
    if (after.name === 'Review' && after.consentError) consentRef.current?.focus();
  };

  const status = (() => {
    if (state.name === 'CreatingOrder' && state.ctx.openOrderId) return messages['review.opening'];
    if (busy) return messages['review.paying'];
    if (!plan && !plansError) return messages['review.loading'];
    return '';
  })();

  return (
    <>
      <RetryPoint
        messages={retryMessages}
        view={view}
        planTitle={null}
        canRetry={false}
        onTryAgain={() => {}}
        onCheckAgain={() => {}}
      />
      <main className={styles.review}>
        <h1>{title}</h1>
        {state.ctx.planId && (
          <p>
            {messages['review.plan']} <strong>{planTitles[state.ctx.planId]}</strong>
          </p>
        )}
        {plan && (
          <p>
            {messages['review.price']}{' '}
            <strong>
              {formatMoney(grossCents(plan.priceNet, plan.vatRate), plan.currency, pair.locale)}
            </strong>{' '}
            {messages['review.perMonth']}
          </p>
        )}
        {showTrial && <p>{messages['review.trial']}</p>}
        {(plansError || retryingPlans) && (
          <div ref={plansBannerRef} role="alert" tabIndex={-1} className={styles.banner}>
            <p>{messages['review.plansError']}</p>
            <button
              type="button"
              className={styles.action}
              aria-disabled={retryingPlans || undefined}
              onClick={() => {
                if (retryingPlans) return;
                setRetryingPlans(true);
                focusHeadingAfterRetry.current = true;
                send({ type: 'retryPlans' });
              }}
            >
              {retryingPlans ? retryMessages['retry.busy'] : messages['review.retryPlans']}
            </button>
          </div>
        )}
        <section>
          {legalText.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
        <label className={styles.consent}>
          <input
            ref={consentRef}
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            aria-invalid={consentError ? 'true' : undefined}
            aria-describedby={consentError ? consentErrorId : undefined}
          />
          <span>{messages['review.consent']}</span>
        </label>
        {consentError && (
          <p id={consentErrorId} className={styles.fieldError}>
            {messages['review.consentError']}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            ref={payRef}
            className={styles.action}
            aria-disabled={payUnavailable || undefined}
            onClick={pay}
          >
            {messages['review.pay']}
          </button>
          {(view.payDisabled || checking) && (
            <button
              type="button"
              className={styles.action}
              aria-disabled={checking || undefined}
              onClick={() => {
                if (checkingRef.current) return;
                checkingRef.current = true;
                setChecking(true);
                send({ type: 'retryCheck' });
              }}
            >
              {checking ? retryMessages['retry.busy'] : retryMessages['retry.action.checkAgain']}
            </button>
          )}
          <button
            type="button"
            className={styles.action}
            aria-disabled={busy || undefined}
            onClick={() => {
              if (store.getState().state.name === 'Review') send({ type: 'changePlan' });
            }}
          >
            {messages['review.changePlan']}
          </button>
        </div>
        <LiveRegion text={status} />
      </main>
    </>
  );
}
