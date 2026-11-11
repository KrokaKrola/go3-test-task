import { expect, test } from 'vitest';
import { createFlowStore } from './store';
import type { FlowContext } from '../machine/machine';

const ctx: FlowContext = {
  market: 'ee',
  locale: 'et',
  planId: 'plan_std_m',
  reviewStep: true,
  identified: false,
  openOrderId: null,
  reverifyOrderId: null,
  conflictRetried: false,
};

test('dispatch applies reducer and exposes effects', () => {
  const store = createFlowStore(ctx);
  expect(store.getState().state.name).toBe('Entry');

  store.getState().dispatch({ type: 'meLoaded', me: { activeSubscription: null } });
  expect(store.getState().state).toMatchObject({ name: 'Plans', ctx: { identified: true } });
  expect(store.getState().effects).toEqual([]);

  store.getState().dispatch({ type: 'select', planId: 'plan_std_m' });
  expect(store.getState().state.name).toBe('Review');
  expect(store.getState().effects).toEqual([{ type: 'fetchPlans' }]);
});
