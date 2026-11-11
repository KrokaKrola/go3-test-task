import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { EidMessages } from '@/components/eid/eidMessages/eidMessages';

type Props = { messages: EidMessages; onTryAgain: () => void; onChangePlan: () => void };

export function StartError({ messages, onTryAgain, onChangePlan }: Props) {
  return (
    <StepScreen
      title={messages['eid.startError.title']}
      actions={[
        { label: messages['eid.action.tryAgain'], onClick: onTryAgain },
        { label: messages['eid.action.changePlan'], onClick: onChangePlan },
      ]}
    >
      <p role="alert">{messages['eid.startError.body']}</p>
    </StepScreen>
  );
}
