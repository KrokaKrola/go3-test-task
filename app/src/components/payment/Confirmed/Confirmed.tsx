import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { PaymentMessages } from '@/components/payment/paymentMessages/paymentMessages';

type Props = {
  messages: PaymentMessages;
  orderId: string;
  planTitle: string | null;
  // Only known while the open order is still ours; gone after a reload (04 Confirmed).
  showTrialNote: boolean;
  onGoToAccount: () => void;
};

export function Confirmed({ messages, orderId, planTitle, showTrialNote, onGoToAccount }: Props) {
  return (
    <StepScreen
      title={messages['payment.confirmed.title']}
      actions={[{ label: messages['payment.action.goToAccount'], onClick: onGoToAccount }]}
    >
      <p>{messages['payment.confirmed.body']}</p>
      <p>
        {messages['payment.orderId']} <code>{orderId}</code>
      </p>
      {planTitle && (
        <p>
          {messages['payment.confirmed.plan']} <strong>{planTitle}</strong>
        </p>
      )}
      {showTrialNote && <p>{messages['payment.confirmed.trial']}</p>}
    </StepScreen>
  );
}
