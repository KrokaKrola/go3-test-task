import { LiveRegion } from '@/components/LiveRegion/LiveRegion';
import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { PaymentMessages } from '@/components/payment/paymentMessages/paymentMessages';

type Props = { messages: PaymentMessages; stillConfirming: boolean; connectionIssue: boolean };

// Also shown while PaymentReturn does its one GET, so the screen does not change between them.
export function Polling({ messages, stillConfirming, connectionIssue }: Props) {
  const status = connectionIssue
    ? messages['payment.polling.connectionIssue']
    : stillConfirming
      ? messages['payment.polling.stillConfirming']
      : messages['payment.polling.status'];
  return (
    <StepScreen title={messages['payment.polling.title']}>
      <LiveRegion text={status} />
    </StepScreen>
  );
}
