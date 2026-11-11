import type { Locale } from '../../domain/locale/locale';
import type { Market } from '../../domain/markets/markets';
import { UTM_KEYS } from '../../flow/utm/utm';
import type { UtmSet } from '../../flow/utm/utm';
import { getConsent, subscribeConsent } from '../consent/consent';

export type EidPurpose = 'checkout' | 'reverify';

export type EventMap = {
  plan_viewed: { identified: boolean };
  plan_selected: { plan_id: string };
  identity_started: { plan_id: string; eid_purpose: EidPurpose };
  identity_completed: { plan_id: string; eid_purpose: EidPurpose };
  payment_started: { plan_id: string; transaction_id: string };
  purchase: {
    transaction_id: string;
    value: number;
    currency: string;
    plan_id: string;
    trial: boolean | 'unknown';
    tax: number;
  };
};

export type EventName = keyof EventMap;

export type CommonSource = {
  market: Market;
  locale: Locale;
  reviewStep: boolean;
  utm: UtmSet;
};

// Runtime whitelist: anything else (customerId, urls, error text) is stripped (07 No personal data).
const EVENT_PARAMS: { [E in EventName]: readonly (keyof EventMap[E])[] } = {
  plan_viewed: ['identified'],
  plan_selected: ['plan_id'],
  identity_started: ['plan_id', 'eid_purpose'],
  identity_completed: ['plan_id', 'eid_purpose'],
  payment_started: ['plan_id', 'transaction_id'],
  purchase: ['transaction_id', 'value', 'currency', 'plan_id', 'trial', 'tax'],
};

type DataLayerEntry = Record<string, unknown>;
type Resolved = { event: EventName; payload: DataLayerEntry };

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

const PURCHASE_GUARD_PREFIX = 'nl_purchase_';
const REDIRECT_MIN_MS = 300;
const REDIRECT_MAX_MS = 500;

let commonSource: (() => CommonSource) | null = null;
let queue: Resolved[] = [];
const purchasesSeen = new Set<string>();
let skipNextPlanViewed = false;

export const setCommonSource = (source: (() => CommonSource) | null): void => {
  commonSource = source;
};

const purchaseGuardKey = (orderId: string) => `${PURCHASE_GUARD_PREFIX}${orderId}`;

function hasPurchaseGuard(orderId: string): boolean {
  try {
    return localStorage.getItem(purchaseGuardKey(orderId)) !== null;
  } catch {
    return false;
  }
}

function writePurchaseGuard(orderId: string): void {
  try {
    localStorage.setItem(purchaseGuardKey(orderId), '1');
  } catch {
    // storage unavailable: in-memory guard still holds for this page
  }
}

function resolveCommon(): DataLayerEntry {
  const source = commonSource?.();
  if (!source) return {};
  const common: DataLayerEntry = {
    market: source.market.toUpperCase(),
    locale: source.locale,
    review_step: source.reviewStep,
  };
  for (const key of UTM_KEYS) {
    const value = source.utm[key];
    if (value) common[key] = value.slice(0, 100);
  }
  return common;
}

function resolve<E extends EventName>(event: E, params: EventMap[E]): Resolved {
  const picked: DataLayerEntry = {};
  for (const key of EVENT_PARAMS[event]) picked[key as string] = params[key];
  // Resolved at call time: a queued event must not depend on storage cleared later (07).
  return { event, payload: { event, ...resolveCommon(), ...picked } };
}

function pushLive({ event, payload }: Resolved, extra?: DataLayerEntry): void {
  if (event === 'purchase') writePurchaseGuard(String(payload.transaction_id));
  (window.dataLayer ??= []).push(extra ? { ...payload, ...extra } : payload);
}

type Outcome = 'pushed' | 'queued' | 'dropped';

function emit(resolved: Resolved, extra?: DataLayerEntry): Outcome {
  const consent = getConsent();
  if (consent === 'denied') return 'dropped';
  if (consent === 'pending') {
    queue.push(resolved);
    return 'queued';
  }
  pushLive(resolved, extra);
  return 'pushed';
}

function admit<E extends EventName>(event: E, params: EventMap[E]): boolean {
  if (event === 'plan_viewed' && skipNextPlanViewed) {
    skipNextPlanViewed = false;
    return false;
  }
  if (event === 'purchase') {
    const orderId = (params as EventMap['purchase']).transaction_id;
    if (purchasesSeen.has(orderId) || hasPurchaseGuard(orderId)) return false;
    purchasesSeen.add(orderId);
  }
  return true;
}

// Analytics never breaks the flow (07): errors are swallowed.
export function track<E extends EventName>(event: E, params: EventMap[E]): void {
  try {
    if (!admit(event, params)) return;
    emit(resolve(event, params));
  } catch {
    // swallowed
  }
}

// Push with GTM eventCallback; navigate no earlier than 300 ms, no later than 500 ms (07).
export function trackThenRedirect<E extends 'identity_started' | 'payment_started'>(
  event: E,
  params: EventMap[E],
  navigate: () => void,
): void {
  let navigated = false;
  let minElapsed = false;
  let eventDone = false;
  const go = () => {
    if (navigated) return;
    navigated = true;
    clearTimeout(minTimer);
    clearTimeout(maxTimer);
    navigate();
  };
  const goWhenReady = () => {
    if (minElapsed && eventDone) go();
  };
  const minTimer = setTimeout(() => {
    minElapsed = true;
    goWhenReady();
  }, REDIRECT_MIN_MS);
  const maxTimer = setTimeout(go, REDIRECT_MAX_MS);

  let outcome: Outcome = 'dropped';
  try {
    if (admit(event, params)) {
      outcome = emit(resolve(event, params), {
        eventCallback: () => {
          eventDone = true;
          goWhenReady();
        },
      });
    }
  } catch {
    // swallowed: redirect timers still navigate
  }
  // Nothing sent live: no callback will come, don't wait for it.
  if (outcome !== 'pushed') {
    eventDone = true;
    goWhenReady();
  }
}

subscribeConsent((state) => {
  const pending = queue;
  queue = [];
  if (state === 'granted') for (const resolved of pending) pushLive(resolved);
});

if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) skipNextPlanViewed = true;
  });
}

// Memory only; localStorage guards stay (a reload keeps them).
export function resetAnalytics(): void {
  commonSource = null;
  queue = [];
  purchasesSeen.clear();
  skipNextPlanViewed = false;
}
