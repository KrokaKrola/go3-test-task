import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { EidMessages } from '@/components/eid/eidMessages/eidMessages';

type Props = { messages: EidMessages; onTryAgain: () => void; onStartAgain: () => void };

export function VerifyError({ messages, onTryAgain, onStartAgain }: Props) {
  return (
    <StepScreen
      title={messages['eid.verifyError.title']}
      actions={[
        { label: messages['eid.action.tryAgain'], onClick: onTryAgain },
        { label: messages['eid.action.startAgain'], onClick: onStartAgain },
      ]}
    >
      <p role="alert">{messages['eid.verifyError.body']}</p>
    </StepScreen>
  );
}
