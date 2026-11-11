'use client';

import { EidFailed } from '@/components/eid/EidFailed/EidFailed';
import { OtherBrowser } from '@/components/eid/OtherBrowser/OtherBrowser';
import { RateLimited } from '@/components/eid/RateLimited/RateLimited';
import { StartEid } from '@/components/eid/StartEid/StartEid';
import { StartError } from '@/components/eid/StartError/StartError';
import { Verifying } from '@/components/eid/Verifying/Verifying';
import { VerifyError } from '@/components/eid/VerifyError/VerifyError';
import type { EidMessages } from '@/components/eid/eidMessages/eidMessages';
import type { FlowEvent, FlowState } from '@/flow/machine/machine';
import type { UtmSet } from '@/flow/utm/utm';

const EID_STATES: readonly FlowState['name'][] = [
  'StartingEid',
  'RateLimited',
  'StartError',
  'EidFailed',
  'Verifying',
  'VerifyError',
  'OtherBrowser',
];

export const isEidState = (state: FlowState): boolean => EID_STATES.includes(state.name);

type Props = {
  state: FlowState;
  dispatch: (event: FlowEvent) => void;
  messages: EidMessages;
  utm: UtmSet;
  apiBase: string;
  redirect: (url: string) => void;
};

export function EidScreen({ state, dispatch, messages, utm, apiBase, redirect }: Props) {
  const tryAgain = () => dispatch({ type: 'tryAgain' });
  const changePlan = () => dispatch({ type: 'changePlan' });
  const startAgain = () => dispatch({ type: 'startAgain' });
  switch (state.name) {
    case 'StartingEid':
      return (
        <StartEid
          ctx={state.ctx}
          utm={utm}
          apiBase={apiBase}
          messages={messages}
          redirect={redirect}
          dispatch={dispatch}
        />
      );
    case 'RateLimited':
      return (
        <RateLimited
          messages={messages}
          locale={state.ctx.locale}
          retryAfterSec={state.retryAfterSec}
          ready={state.ready}
          onElapsed={() => dispatch({ type: 'countdownElapsed' })}
          onTryAgain={tryAgain}
          onChangePlan={changePlan}
        />
      );
    case 'StartError':
      return <StartError messages={messages} onTryAgain={tryAgain} onChangePlan={changePlan} />;
    case 'EidFailed':
      return (
        <EidFailed
          messages={messages}
          reason={state.reason}
          onTryAgain={tryAgain}
          onChangePlan={changePlan}
        />
      );
    case 'Verifying':
      return <Verifying messages={messages} />;
    case 'VerifyError':
      return <VerifyError messages={messages} onTryAgain={tryAgain} onStartAgain={startAgain} />;
    case 'OtherBrowser':
      return <OtherBrowser messages={messages} onStartAgain={startAgain} />;
    default:
      return null;
  }
}
