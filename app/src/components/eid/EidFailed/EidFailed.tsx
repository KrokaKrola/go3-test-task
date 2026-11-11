import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { EidMessages } from '@/components/eid/eidMessages/eidMessages';
import type { EidFailReason } from '@/flow/machine/machine';

type Props = {
  messages: EidMessages;
  reason: EidFailReason;
  onTryAgain: () => void;
  onChangePlan: () => void;
};

export function EidFailed({ messages, reason, onTryAgain, onChangePlan }: Props) {
  return (
    <StepScreen
      title={messages[`eid.failed.${reason}.title`]}
      actions={[
        { label: messages['eid.action.tryAgain'], onClick: onTryAgain },
        { label: messages['eid.action.changePlan'], onClick: onChangePlan },
      ]}
    >
      <p>{messages[`eid.failed.${reason}.body`]}</p>
    </StepScreen>
  );
}
