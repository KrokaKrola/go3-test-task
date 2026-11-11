import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { EidMessages } from '@/components/eid/eidMessages/eidMessages';

type Props = { messages: EidMessages; onStartAgain: () => void };

export function OtherBrowser({ messages, onStartAgain }: Props) {
  return (
    <StepScreen
      title={messages['eid.otherBrowser.title']}
      actions={[{ label: messages['eid.action.startAgainHere'], onClick: onStartAgain }]}
    >
      <p>{messages['eid.otherBrowser.body']}</p>
    </StepScreen>
  );
}
