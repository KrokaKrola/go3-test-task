import { LiveRegion } from '@/components/LiveRegion/LiveRegion';
import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { EidMessages } from '@/components/eid/eidMessages/eidMessages';

export function Verifying({ messages }: { messages: EidMessages }) {
  return (
    <StepScreen title={messages['eid.verifying.title']}>
      <LiveRegion text={messages['eid.verifying.status']} />
    </StepScreen>
  );
}
