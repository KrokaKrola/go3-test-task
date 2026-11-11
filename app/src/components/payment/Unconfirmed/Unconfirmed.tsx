import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { PaymentMessages } from '@/components/payment/paymentMessages/paymentMessages';

type Props = {
  messages: PaymentMessages;
  orderId: string;
  onCheckAgain: () => void;
  onGoToAccount: () => void;
};

export function Unconfirmed({ messages, orderId, onCheckAgain, onGoToAccount }: Props) {
  return (
    <StepScreen
      title={messages['payment.unconfirmed.title']}
      actions={[
        { label: messages['payment.action.checkAgain'], onClick: onCheckAgain },
        { label: messages['payment.action.goToAccount'], onClick: onGoToAccount },
      ]}
    >
      <p>{messages['payment.unconfirmed.body']}</p>
      <p>
        {messages['payment.orderId']} <code>{orderId}</code>
      </p>
    </StepScreen>
  );
}
