import { getPlans } from '@/api/client/client';
import { getConfig } from '@/config';
import type { Pair } from '@/domain/markets/markets';
import {
  CmsValidationError,
  parsePlanPage,
  type ParseResult,
} from '@/cms/parsePlanPage/parsePlanPage';

async function fetchCmsEntry(pair: Pair): Promise<unknown> {
  const query = `market=${pair.market.toUpperCase()}&locale=${pair.locale}`;
  let response: Response;
  try {
    response = await fetch(`${getConfig().API_BASE}/cms/v1/plan-pages?${query}`);
  } catch {
    return fail('CMS unreachable');
  }
  if (!response.ok) return fail(`CMS answered ${response.status}`);
  try {
    return await response.json();
  } catch {
    return fail('CMS returned invalid JSON');
  }
}

const fail = (message: string): never => {
  throw new CmsValidationError(message);
};

// Build time only (06 Transport). Plans fetch failure fails the build (06 Card merge).
export async function loadPlanPage(pair: Pair, marketEnabled: boolean): Promise<ParseResult> {
  try {
    const [raw, { plans }] = await Promise.all([fetchCmsEntry(pair), getPlans(pair.market)]);
    return parsePlanPage(raw, plans, { marketEnabled, ...pair });
  } catch (error) {
    if (marketEnabled) throw error;
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    return { page: null, warnings: [message] };
  }
}
