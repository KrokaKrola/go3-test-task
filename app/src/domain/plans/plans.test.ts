import { describe, expect, it } from 'vitest';
import { hasTrial, isTrialPlan, planIdFor, planKeyFor, type PlanKey } from './plans';

describe('plans', () => {
  it.each([
    ['basic', 'plan_basic_m'],
    ['standard', 'plan_std_m'],
    ['premium', 'plan_prem_m'],
  ] as const)('planKey ↔ planId both ways: %s', (key, id) => {
    expect(planIdFor(key)).toBe(id);
    expect(planKeyFor(id)).toBe(key);
  });

  it('unknown key/id → undefined', () => {
    expect(planIdFor('gold')).toBeUndefined();
    expect(planIdFor('toString')).toBeUndefined();
    expect(planKeyFor('plan_gold_m')).toBeUndefined();
    expect(planKeyFor('')).toBeUndefined();
  });

  it.each([
    ['basic', true, false],
    ['basic', false, false],
    ['standard', true, true],
    ['standard', false, false],
    ['premium', true, true],
    ['premium', false, false],
  ] as [PlanKey, boolean, boolean][])(
    'trial only standard/premium and only if trialEligible: %s eligible=%s',
    (key, eligible, expected) => {
      expect(hasTrial(key, eligible)).toBe(expected);
    },
  );

  it('isTrialPlan: standard and premium only', () => {
    expect(isTrialPlan('basic')).toBe(false);
    expect(isTrialPlan('standard')).toBe(true);
    expect(isTrialPlan('premium')).toBe(true);
  });
});
