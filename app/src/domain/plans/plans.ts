export type PlanKey = 'basic' | 'standard' | 'premium';

const PLAN_ID_BY_KEY: Record<PlanKey, string> = {
  basic: 'plan_basic_m',
  standard: 'plan_std_m',
  premium: 'plan_prem_m',
};

export const TRIAL_DAYS = 30;
const TRIAL_PLAN_KEYS: readonly PlanKey[] = ['standard', 'premium'];

export function planIdFor(key: string): string | undefined {
  return Object.hasOwn(PLAN_ID_BY_KEY, key) ? PLAN_ID_BY_KEY[key as PlanKey] : undefined;
}

export function planKeyFor(id: string): PlanKey | undefined {
  return (Object.keys(PLAN_ID_BY_KEY) as PlanKey[]).find((key) => PLAN_ID_BY_KEY[key] === id);
}

export function isTrialPlan(key: PlanKey): boolean {
  return TRIAL_PLAN_KEYS.includes(key);
}

export function hasTrial(key: PlanKey, trialEligible: boolean): boolean {
  return trialEligible && isTrialPlan(key);
}
