import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { PaymentMessages } from '@/components/payment/paymentMessages/paymentMessages';

type Props = { messages: PaymentMessages; orderId: string; onVerify: () => void };

export function IdentityLost({ messages, orderId, onVerify }: Props) {
  return (
    <StepScreen
      title={messages['payment.identityLost.title']}
      actions={[{ label: messages['payment.action.verify'], onClick: onVerify }]}
    >
      <p>{messages['payment.identityLost.body']}</p>
      <p>
        {messages['payment.orderId']} <code>{orderId}</code>
      </p>
    </StepScreen>
  );
}
