import type { ApiError } from '@/api/errors/errors';
import { EidScreen } from '@/components/eid/EidScreen/EidScreen';
import { pickEidMessages } from '@/components/eid/eidMessages/eidMessages';
import type { FlowContext, FlowState } from '@/flow/machine/machine';
import { navigate } from '@/flow/navigate/navigate';
import { createFlowStore } from '@/flow/store/store';
import { getMessages } from '@/i18n/messages/messages';

export const eidMessages = pickEidMessages(getMessages('en'));
export const API_BASE = 'http://api.test';

export const flowContext = (overrides: Partial<FlowContext> = {}): FlowContext => ({
  market: 'ee',
  locale: 'en',
  planId: 'plan_std_m',
  reviewStep: true,
  identified: false,
  openOrderId: null,
  reverifyOrderId: null,
  conflictRetried: false,
  ...overrides,
});

export const apiError = (kind: ApiError['kind'], status: number): ApiError => ({
  kind,
  status,
  code: kind,
  message: kind,
});

export const storeAt = (build: (ctx: FlowContext) => FlowState, ctx = flowContext()) =>
  createFlowStore(ctx, build(ctx));

// Test-only host: renders whatever eID screen the store is in.
export function EidHarness({ store }: { store: ReturnType<typeof createFlowStore> }) {
  const state = store((s) => s.state);
  return (
    <EidScreen
      state={state}
      dispatch={store.getState().dispatch}
      messages={eidMessages}
      utm={{}}
      apiBase={API_BASE}
      redirect={navigate}
    />
  );
}
