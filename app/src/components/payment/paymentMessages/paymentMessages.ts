import type { MessageKey, Messages } from '@/i18n/messages/messages';

type PaymentKey = Extract<MessageKey, `payment.${string}`>;
export type PaymentMessages = Pick<Messages, PaymentKey>;

export function pickPaymentMessages(messages: Messages): PaymentMessages {
  const picked: Partial<Record<PaymentKey, string>> = {};
  for (const key of Object.keys(messages) as MessageKey[])
    if (key.startsWith('payment.')) picked[key as PaymentKey] = messages[key];
  return picked as PaymentMessages;
}
