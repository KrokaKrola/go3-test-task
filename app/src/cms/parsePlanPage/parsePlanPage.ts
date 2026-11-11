import type { PlansResponse } from '@/api/schemas/schemas';
import type { Locale } from '@/domain/locale/locale';
import type { Market } from '@/domain/markets/markets';
import { formatMoney, grossCents } from '@/domain/money/money';
import { planIdFor, planKeyFor, type PlanKey } from '@/domain/plans/plans';

export class CmsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CmsValidationError';
  }
}

export type PlanCardData = {
  planKey: PlanKey;
  planId: string;
  title: string;
  bullets: string[];
  badge: string | null;
  priceText: string;
  priceNet: number;
  vatRate: number;
  currency: string;
};

export type PlanPageData = {
  headline: string;
  subhead: string | null;
  cards: PlanCardData[];
  legalText: string[];
  faq: { question: string; answer: string }[];
};

export type ParseOptions = { marketEnabled: boolean; market: Market; locale: Locale };
export type ParseResult = { page: PlanPageData | null; warnings: string[] };

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (message: string): never => {
  throw new CmsValidationError(message);
};

function optionalString(source: Json, field: string): string {
  const value = source[field];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') fail(`${field} must be a string`);
  return (value as string).trim();
}

function requiredString(source: Json, field: string): string {
  const value = optionalString(source, field);
  if (!value) fail(`${field} empty`);
  return value;
}

function optionalArray(source: Json, field: string): unknown[] {
  const value = source[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  return value as unknown[];
}

function parseBullets(card: Json, label: string, warnings: string[]): string[] {
  const kept: string[] = [];
  for (const item of optionalArray(card, 'bullets')) {
    if (typeof item !== 'string') fail(`${label}.bullets must be an array of strings`);
    const text = (item as string).trim();
    if (text) kept.push(text);
    else warnings.push(`${label}: empty bullet dropped`);
  }
  return kept;
}

function parseLegalText(source: Json, warnings: string[]): string[] {
  const paragraphs: string[] = [];
  for (const node of optionalArray(source, 'legalText')) {
    if (!isObject(node) || node.type !== 'paragraph') {
      warnings.push('legalText: non-paragraph node skipped');
      continue;
    }
    if (node.text === undefined || node.text === null) continue;
    if (typeof node.text !== 'string') fail('legalText paragraph text must be a string');
    const text = (node.text as string).trim();
    if (text) paragraphs.push(text);
  }
  if (paragraphs.length === 0) fail('legalText empty');
  return paragraphs;
}

function parseFaq(source: Json, warnings: string[]): PlanPageData['faq'] {
  const pairs: PlanPageData['faq'] = [];
  for (const item of optionalArray(source, 'faq')) {
    if (!isObject(item)) fail('faq items must be objects');
    const question = optionalString(item as Json, 'question');
    const answer = optionalString(item as Json, 'answer');
    if (question && answer) pairs.push({ question, answer });
    else warnings.push('faq: pair with an empty side dropped');
  }
  return pairs;
}

type RawCard = { planKey: PlanKey; source: Json; index: number };

// 06 Card merge rules 1 and 2.
function knownCards(source: Json, warnings: string[]): RawCard[] {
  if (!Array.isArray(source.planCards)) fail('planCards must be an array');
  const cards: RawCard[] = [];
  const seen = new Set<string>();
  (source.planCards as unknown[]).forEach((raw, index) => {
    if (!isObject(raw)) return fail(`planCards[${index}] must be an object`);
    if (typeof raw.planKey !== 'string' || !planIdFor(raw.planKey)) {
      warnings.push(`planCards[${index}]: unknown planKey dropped`);
      return;
    }
    if (seen.has(raw.planKey)) fail(`duplicate planKey ${raw.planKey}`);
    seen.add(raw.planKey);
    cards.push({ planKey: raw.planKey as PlanKey, source: raw, index });
  });
  return cards;
}

function mergeCards(
  source: Json,
  apiPlans: PlansResponse['plans'],
  locale: Locale,
  warnings: string[],
): PlanCardData[] {
  if (apiPlans.length === 0) fail('API returned no plans');
  const cards = knownCards(source, warnings);
  // Rule 4: every API plan needs a CMS card (Q45).
  for (const plan of apiPlans) {
    const key = planKeyFor(plan.id);
    if (!key || !cards.some((card) => card.planKey === key))
      fail(`API plan ${plan.id} has no CMS card`);
  }
  const merged: PlanCardData[] = [];
  for (const { planKey, source: card, index } of cards) {
    const plan = apiPlans.find((p) => p.id === planIdFor(planKey));
    if (!plan) continue; // Rule 3: hidden, no error (Q8).
    const label = `planCards[${index}]`;
    merged.push({
      planKey,
      planId: plan.id,
      title: optionalString(card, 'title') || fail(`${label}.title empty`),
      bullets: parseBullets(card, label, warnings),
      badge: optionalString(card, 'badge') || null,
      priceText: formatMoney(grossCents(plan.priceNet, plan.vatRate), plan.currency, locale),
      priceNet: plan.priceNet,
      vatRate: plan.vatRate,
      currency: plan.currency,
    });
  }
  return merged;
}

function parseStrict(
  raw: unknown,
  apiPlans: PlansResponse['plans'],
  { market, locale }: ParseOptions,
  warnings: string[],
): PlanPageData {
  if (!isObject(raw)) return fail('entry is not an object');
  if (raw.market !== market.toUpperCase() || raw.locale !== locale)
    fail(`entry is for ${String(raw.market)}/${String(raw.locale)}, expected ${market}/${locale}`);
  return {
    headline: requiredString(raw, 'headline'),
    subhead: optionalString(raw, 'subhead') || null,
    cards: mergeCards(raw, apiPlans, locale, warnings),
    legalText: parseLegalText(raw, warnings),
    faq: parseFaq(raw, warnings),
  };
}

export function parsePlanPage(
  raw: unknown,
  apiPlans: PlansResponse['plans'],
  options: ParseOptions,
): ParseResult {
  const warnings: string[] = [];
  try {
    return { page: parseStrict(raw, apiPlans, options, warnings), warnings };
  } catch (error) {
    if (options.marketEnabled || !(error instanceof CmsValidationError)) throw error;
    return { page: null, warnings: [...warnings, error.message] };
  }
}
