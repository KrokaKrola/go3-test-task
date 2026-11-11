export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmSet = Partial<Record<UtmKey, string>>;

const STORAGE_KEY = 'nl_utm';
const MAX_LENGTH = 100;

// Truncated to the GA4 param limit (07).
export function readUtm(search: string | URLSearchParams): UtmSet {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const set: UtmSet = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) set[key] = value.slice(0, MAX_LENGTH);
  }
  return set;
}

export const hasUtm = (set: UtmSet) => Object.keys(set).length > 0;

// Last landing with any utm_* replaces the whole set; without any, the previous set stays (07).
export function captureUtm(landingSearch: string, previous: UtmSet): UtmSet {
  const landed = readUtm(landingSearch);
  return hasUtm(landed) ? landed : previous;
}

// Stored beats query (04 invariant 2).
export function resolveUtm(stored: UtmSet | null, query: UtmSet): UtmSet {
  return stored && hasUtm(stored) ? stored : query;
}

export function loadUtm(storage: Pick<Storage, 'getItem'>): UtmSet | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? readUtm(new URLSearchParams(raw)) : null;
  } catch {
    return null;
  }
}

// canPersist comes from the consent adapter (Q53).
export function persistUtm(
  storage: Pick<Storage, 'setItem'>,
  set: UtmSet,
  canPersist: boolean,
): void {
  if (!canPersist || !hasUtm(set)) return;
  try {
    storage.setItem(STORAGE_KEY, new URLSearchParams(set as Record<string, string>).toString());
  } catch {
    // storage unavailable: UTMs stay in memory and returnUrl
  }
}
