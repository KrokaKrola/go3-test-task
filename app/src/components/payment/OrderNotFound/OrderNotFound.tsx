import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { PaymentMessages } from '@/components/payment/paymentMessages/paymentMessages';

type Props = {
  messages: PaymentMessages;
  orderId: string;
  onBackToPlans: () => void;
  onGoToAccount: () => void;
};

export function OrderNotFound({ messages, orderId, onBackToPlans, onGoToAccount }: Props) {
  return (
    <StepScreen
      title={messages['payment.orderNotFound.title']}
      actions={[
        { label: messages['payment.action.backToPlans'], onClick: onBackToPlans },
        { label: messages['payment.action.goToAccount'], onClick: onGoToAccount },
      ]}
    >
      <p>{messages['payment.orderNotFound.body']}</p>
      <p>
        {messages['payment.orderId']} <code>{orderId}</code>
      </p>
    </StepScreen>
  );
}
