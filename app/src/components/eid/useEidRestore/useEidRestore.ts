import { useEffect } from 'react';
import type { createFlowStore } from '@/flow/store/store';

// 04 invariant 6 / Q69: Back from the eID page restores StartingEid. Never re-POST (it would trap Back).
export function useEidRestore(store: ReturnType<typeof createFlowStore>, to: 'plans' | 'failed') {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      const { state, dispatch } = store.getState();
      if (state.name === 'StartingEid') dispatch({ type: 'eidAbandoned', to });
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [store, to]);
}
