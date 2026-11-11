import type { Locale } from '@/domain/locale/locale';
import { ALL_PAIRS, resolvePair } from '@/domain/markets/markets';
import type { Market } from '@/domain/markets/markets';
import { planIdFor } from '@/domain/plans/plans';
import type { PlanKey } from '@/domain/plans/plans';
import { UTM_KEYS, loadUtm, readUtm, resolveUtm } from '@/flow/utm/utm';
import type { UtmSet } from '@/flow/utm/utm';

export type ReturnPath = '/auth/callback' | '/payment/return';

export type FlowParams = {
  plan: PlanKey | null;
  market: Market;
  locale: Locale;
  utm: UtmSet;
  orderId: string | null;
};

const STORAGE_KEY = 'nl_flow_context';

const toSearchParams = (params: FlowParams, withUtm: boolean): URLSearchParams => {
  const search = new URLSearchParams();
  if (params.plan) search.set('plan', params.plan);
  search.set('market', params.market);
  search.set('locale', params.locale);
  if (withUtm) {
    for (const key of UTM_KEYS) {
      const value = params.utm[key];
      if (value) search.set(key, value);
    }
  }
  if (params.orderId) search.set('orderId', params.orderId);
  return search;
};

export function buildReturnUrl(origin: string, path: ReturnPath, params: FlowParams): string {
  const url = new URL(path, origin);
  url.search = toSearchParams(params, true).toString();
  return url.toString();
}

// Callbacks may land on a disabled market (Q52), so all pairs are valid here.
// Only an exact (lowercase, existing) pair is accepted: we built these URLs ourselves.
export function parseFlowParams(search: string | URLSearchParams): FlowParams | null {
  const query = typeof search === 'string' ? new URLSearchParams(search) : search;
  const resolved = resolvePair(query.get('market') ?? '', query.get('locale') ?? '', ALL_PAIRS);
  if (resolved.kind !== 'ok') return null;
  const plan = query.get('plan') ?? '';
  return {
    plan: planIdFor(plan) ? (plan as PlanKey) : null,
    market: resolved.pair.market,
    locale: resolved.pair.locale,
    utm: readUtm(query),
    orderId: query.get('orderId') || null,
  };
}

export function loadStoredParams(storage: Pick<Storage, 'getItem'>): FlowParams | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? parseFlowParams(new URLSearchParams(raw)) : null;
  } catch {
    return null;
  }
}

// No UTMs here: their only stored copy is nl_utm, written under consent (07, Q53).
export function saveStoredParams(storage: Pick<Storage, 'setItem'>, params: FlowParams): void {
  try {
    storage.setItem(STORAGE_KEY, toSearchParams(params, false).toString());
  } catch {
    // convenience copy only; returnUrl still carries the context (Q7)
  }
}

// 04 invariant 2: plan/market/locale stored beats query. orderId and UTMs fall back per field.
export function resolveFlowParams(
  storage: Pick<Storage, 'getItem'>,
  search: string | URLSearchParams,
): FlowParams | null {
  const stored = loadStoredParams(storage);
  const query = parseFlowParams(search);
  const base = stored ?? query;
  if (!base) return null;
  return {
    ...base,
    orderId: stored?.orderId ?? query?.orderId ?? null,
    utm: resolveUtm(loadUtm(storage), query?.utm ?? {}),
  };
}
